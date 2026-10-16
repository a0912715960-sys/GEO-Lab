import { artifactHash as digest } from './src/hash.mjs';
import { check, annotate } from './src/platform.mjs';

export function capabilities(env = process.env) {
  return ['gemini', 'openai'].map((provider) => ({
    provider,
    configured: !!env[provider.toUpperCase() + '_API_KEY'],
    model: env[provider.toUpperCase() + '_MODEL'] || '',
    mode: 'official-search-api',
  }));
}
export function neutralRequest(config, prompt) {
  // Locale is a sampling instruction. Private product facts are never added here.
  return `${prompt.question}\nAnswer in ${config.language}. Target buyer market: ${config.country}. Use web search and cite public sources. Do not invent supplier capabilities.`;
}
export function parseGemini(raw) {
  const steps = raw.steps || [];
  const outputs = steps
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => (Array.isArray(s.content) ? s.content : []));
  const textParts = outputs.filter((c) => c.type === 'text');
  const citations = textParts.flatMap((c) =>
    (c.annotations || [])
      .filter((a) => a.type === 'url_citation')
      .map((a) => ({
        url: a.url,
        title: a.title || a.url,
        start: a.start_index,
        end: a.end_index,
      })),
  );
  return {
    answer: textParts.map((c) => c.text || '').join('\n'),
    citations,
    searchPerformed: steps.some((s) => s.type === 'google_search_result'),
    usage: raw.usage || null,
    providerModel: raw.model || null,
    parserVersion: 'gemini-interactions-v1',
  };
}
export function parseOpenAI(raw) {
  const output = raw.output || [];
  const contents = output
    .filter((x) => x.type === 'message')
    .flatMap((x) => x.content || [])
    .filter((x) => x.type === 'output_text');
  return {
    answer: contents.map((x) => x.text || '').join('\n'),
    citations: contents.flatMap((x) =>
      (x.annotations || [])
        .filter((a) => a.type === 'url_citation')
        .map((a) => ({
          url: a.url,
          title: a.title || a.url,
          start: a.start_index,
          end: a.end_index,
        })),
    ),
    searchPerformed: output.some((x) => x.type === 'web_search_call' && x.status === 'completed'),
    usage: raw.usage || null,
    providerModel: raw.model || null,
    parserVersion: 'openai-responses-v1',
  };
}
export async function callSearch(
  config,
  prompt,
  { env = process.env, transport = fetch, timeoutMs = 45000 } = {},
) {
  const key = env[config.provider.toUpperCase() + '_API_KEY'];
  check(key, 'API 未配置', 409);
  const question = neutralRequest(config, prompt);
  const gemini = config.provider === 'gemini';
  const endpoint = gemini
    ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
    : 'https://api.openai.com/v1/responses';
  const body = gemini
    ? { model: config.model, input: question, tools: [{ type: 'google_search' }], store: false }
    : {
        model: config.model,
        input: question,
        tools: [
          { type: 'web_search', user_location: { type: 'approximate', country: config.country } },
        ],
        store: false,
      };
  const headers = {
    'content-type': 'application/json',
    ...(gemini ? { 'x-goog-api-key': key } : { authorization: 'Bearer ' + key }),
  };
  let response;
  try {
    response = await transport(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw Object.assign(
      new Error(error.name === 'TimeoutError' ? 'API 请求超时' : 'API 网络请求失败'),
      { retryable: true },
    );
  }
  const responseText = await response.text();
  // Do not log provider error bodies: they can echo request headers or credentials.
  if (!response.ok)
    throw Object.assign(new Error('API HTTP ' + response.status), {
      httpStatus: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  let raw;
  try {
    raw = JSON.parse(responseText);
  } catch {
    throw new Error('API 响应不是 JSON');
  }
  const redact = (value) =>
    typeof value === 'string'
      ? value.replaceAll(key, '[REDACTED]')
      : Array.isArray(value)
        ? value.map(redact)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]))
          : value;
  raw = redact(raw);
  const parsed = gemini ? parseGemini(raw) : parseOpenAI(raw);
  return {
    ...parsed,
    raw,
    requestSummary: {
      provider: config.provider,
      model: config.model,
      endpoint,
      promptId: prompt.id,
      promptVersion: prompt.version,
      promptHash: digest(question),
      country: config.country,
      language: config.language,
      search: true,
    },
  };
}
export async function executePlan(
  s,
  planId,
  {
    env = process.env,
    transport = fetch,
    clock = () => new Date(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    checkpoint = () => {},
    cycleKey,
  } = {},
) {
  const plan = s.plans.find((p) => p.id === planId);
  check(plan, '计划不存在', 404);
  check(digest(plan.config) === plan.configHash, '计划配置快照已损坏', 409);
  const config = plan.config,
    at = clock().toISOString(),
    day = at.slice(0, 10),
    cycle = cycleKey || Math.floor(clock().getTime() / (config.cadenceHours * 3600000));
  const results = [];
  for (const prompt of config.prompts) {
    const identity = digest({
      planId,
      version: plan.version,
      cycle,
      promptId: prompt.id,
      promptVersion: prompt.version,
    });
    const existing = s.runs.find((r) => r.id === identity);
    if (existing) {
      results.push(existing);
      continue;
    }
    const run = {
      id: identity,
      origin: 'real',
      at,
      planId,
      planVersion: plan.version,
      configHash: plan.configHash,
      provider: config.provider,
      model: config.model,
      country: config.country,
      language: config.language,
      productIds: [prompt.productId],
      prompt: structuredClone(prompt),
      status: 'queued',
      answer: '',
      citations: [],
      searchPerformed: false,
      attempts: [],
      reservedUSD: 0,
      annotation: null,
      actualBilledUSD: null,
    };
    s.runs.push(run);
    results.push(run);
    if (!env[config.provider.toUpperCase() + '_API_KEY']) {
      run.status = 'blocked';
      run.error = 'API 未配置';
      plan.lastError = run.error;
      await checkpoint(s);
      continue;
    }
    if (s.workspace.provenance === 'synthetic' || config.workspace.provenance === 'synthetic') {
      run.status = 'blocked';
      run.error = '先配置实际品牌与域名，再执行真实监测';
      await checkpoint(s);
      continue;
    }
    for (let retry = 0; retry <= config.retries; retry++) {
      const planRuns = s.runs.filter((r) => r.planId === planId);
      const attempts = planRuns.flatMap((r) => r.attempts).filter((a) => a.at.startsWith(day));
      const reserve = planRuns.reduce(
        (n, r) =>
          n +
          r.attempts
            .filter((a) => a.at.startsWith(day))
            .reduce((v, a) => v + (a.reservedUSD || 0), 0),
        0,
      );
      if (
        attempts.length >= config.dailyCallCap ||
        reserve + config.reservePerCallUSD > config.dailyBudgetUSD + 1e-9
      ) {
        run.status = run.attempts.length ? 'failed' : 'blocked';
        run.error = '每日调用或预算预留上限';
        plan.status = 'paused';
        plan.lastError = run.error;
        await checkpoint(s);
        break;
      }
      const attempt = {
        number: retry + 1,
        at: clock().toISOString(),
        status: 'running',
        reservedUSD: config.reservePerCallUSD,
      };
      run.attempts.push(attempt);
      run.reservedUSD += config.reservePerCallUSD;
      run.status = 'running';
      await checkpoint(s);
      try {
        const result = await callSearch(config, prompt, { env, transport });
        Object.assign(run, result);
        attempt.status = 'succeeded';
        run.status = result.answer.trim() ? 'succeeded' : 'empty';
        run.annotation = annotate(
          run.answer,
          run.citations,
          config.workspace,
          s.products.filter((p) => config.productIds.includes(p.id)),
        );
        run.error = null;
        await checkpoint(s);
        break;
      } catch (error) {
        attempt.status = 'failed';
        attempt.error = error.message;
        attempt.httpStatus = error.httpStatus || null;
        run.status = 'failed';
        run.error = error.message;
        await checkpoint(s);
        if (!error.retryable || retry === config.retries) break;
        await sleep(Math.min(1000 * 2 ** retry, 4000));
      }
    }
  }
  const failed = results.filter((r) => r.status === 'failed').length;
  if (failed >= 3) {
    plan.status = 'paused';
    plan.lastError = '连续批次内失败达到 3 条，已暂停；检查通道后手动恢复';
  }
  plan.nextDueAt = new Date(clock().getTime() + config.cadenceHours * 3600000).toISOString();
  plan.lastRunAt = at;
  s.revision++;
  await checkpoint(s);
  return results;
}
