import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, geminiFixture, openaiFixture, response } from './helpers.mjs';
import {
  capabilities,
  neutralRequest,
  parseGemini,
  parseOpenAI,
  callSearch,
  executePlan,
} from '../monitor.mjs';
import { metrics, planAction, generatePrompts, editPrompt, createPlan } from '../src/platform.mjs';
const env = { GEMINI_API_KEY: 'contract-secret', OPENAI_API_KEY: 'contract-secret' };
test('multi-SKU plan assigns each monitoring question to its own product', async () => {
  const { s, product } = ready();
  const valve = s.products.find((p) => p.sku === 'V-100');
  generatePrompts(s, { productId: valve.id });
  s.prompts
    .filter((q) => q.productId === valve.id)
    .forEach((q) => editPrompt(s, { id: q.id, approve: true }));
  const plan = createPlan(s, {
    name: 'Multi SKU',
    productIds: [product.id, valve.id],
    provider: 'gemini',
    model: 'x',
    language: 'en',
    country: 'US',
    cadenceHours: 24,
    dailyCallCap: 20,
    dailyBudgetUSD: 5,
    reservePerCallUSD: 0.1,
  });
  await executePlan(s, plan.id, { env, transport: async () => response(geminiFixture) });
  assert.equal(metrics(s, { productId: product.id }).N, 4);
  assert.equal(metrics(s, { productId: valve.id }).N, 4);
  assert.ok(
    s.runs.every((r) => r.productIds.length === 1 && r.productIds[0] === r.prompt.productId),
  );
});
test('capabilities never expose credentials', () => {
  const result = capabilities(env);
  assert.equal(result[0].configured, true);
  assert.ok(!JSON.stringify(result).includes('contract-secret'));
});
test('monitor request excludes private facts, SKU, brand and workspace evidence', () => {
  const { plan } = ready();
  const text = neutralRequest(plan.config, plan.config.prompts[0]);
  for (const secret of ['3 kW', '20 m³/h', 'TestBrand', 'P-200', 'example.org'])
    assert.ok(!text.includes(secret));
  assert.ok(text.includes('US'));
});
test('Gemini parser retains search steps and citation offsets', () => {
  const r = parseGemini(geminiFixture);
  assert.equal(r.searchPerformed, true);
  assert.equal(r.citations[0].start, 0);
  assert.ok(r.answer.includes('TestBrand'));
  const noSearch = structuredClone(geminiFixture);
  noSearch.steps = noSearch.steps.filter((x) => x.type !== 'google_search_result');
  assert.equal(parseGemini(noSearch).searchPerformed, false);
});
test('OpenAI requires completed search, text alone is not network evidence', () => {
  assert.equal(parseOpenAI(openaiFixture).searchPerformed, true);
  assert.equal(parseOpenAI({ output: openaiFixture.output.slice(1) }).searchPerformed, false);
});
test('Gemini REST transport contract and returned secrets are redacted', async () => {
  const { plan } = ready();
  let request;
  const fixture = structuredClone(geminiFixture);
  fixture.extra = 'echo contract-secret';
  const result = await callSearch(plan.config, plan.config.prompts[0], {
    env,
    transport: async (url, init) => {
      request = { url, init };
      return response(fixture);
    },
  });
  assert.ok(request.url.endsWith('/v1beta/interactions'));
  assert.equal(request.init.headers['x-goog-api-key'], 'contract-secret');
  assert.deepEqual(JSON.parse(request.init.body).tools, [{ type: 'google_search' }]);
  assert.ok(!JSON.stringify(result).includes('contract-secret'));
  assert.equal(result.raw.extra, 'echo [REDACTED]');
});
test('OpenAI REST contract selects web_search and no storage', async () => {
  const { plan } = ready('openai');
  let request;
  await callSearch(plan.config, plan.config.prompts[0], {
    env,
    transport: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return response(openaiFixture);
    },
  });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.store, false);
  assert.equal(request.body.tools[0].type, 'web_search');
});
test('missing API blocks with zero attempts and cannot produce fake success', async () => {
  const { s, plan } = ready();
  const runs = await executePlan(s, plan.id, {
    env: {},
    transport: () => {
      throw new Error('must never call');
    },
  });
  assert.ok(runs.every((r) => r.status === 'blocked'));
  assert.equal(metrics(s).attempts, 0);
  assert.equal(metrics(s).N, 0);
});
test('429 retry stores two attempts for one effective answer and charges budget reservations', async () => {
  const { s, plan } = ready();
  let count = 0;
  const runs = await executePlan(s, plan.id, {
    env,
    transport: async () => {
      count++;
      return count === 1
        ? response({ error: 'do not log contract-secret' }, 429)
        : response(geminiFixture);
    },
    sleep: async () => {},
  });
  assert.equal(runs[0].attempts.length, 2);
  assert.equal(runs[0].status, 'succeeded');
  assert.equal(metrics(s).N, 4);
  assert.equal(metrics(s).attempts, 5);
  assert.equal(Number(metrics(s).reservedUSD.toFixed(1)), 0.5);
  assert.ok(!JSON.stringify(s).includes('contract-secret'));
});
test('logical idempotency does not execute same prompt twice in same cycle', async () => {
  const { s, plan } = ready();
  let count = 0;
  const options = {
    env,
    cycleKey: 'same',
    transport: async () => {
      count++;
      return response(geminiFixture);
    },
  };
  await executePlan(s, plan.id, options);
  await executePlan(s, plan.id, options);
  assert.equal(count, 4);
  assert.equal(s.runs.length, 4);
});
test('daily cap includes retries; budget exhaustion pauses and excludes incomplete results', async () => {
  const { s, plan } = ready('gemini', { dailyCallCap: 2 });
  let calls = 0;
  await executePlan(s, plan.id, {
    env,
    transport: async () => {
      calls++;
      return response({ error: 'server' }, 500);
    },
    sleep: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(plan.status, 'paused');
  assert.equal(metrics(s).N, 0);
  assert.equal(metrics(s).attempts, 2);
});
test('HTTP 401 is not retried and cannot leak raw provider errors', async () => {
  const { s, plan } = ready();
  await executePlan(s, plan.id, {
    env,
    transport: async () => response({ error: 'contract-secret' }, 401),
    sleep: async () => {},
  });
  assert.ok(s.runs.every((r) => r.attempts.length === 1));
  assert.equal(metrics(s).N, 0);
  assert.ok(!JSON.stringify(s).includes('contract-secret'));
  assert.equal(plan.status, 'paused');
});
test('successful response with no search is retained but excluded from N', async () => {
  const { s, plan } = ready();
  const body = structuredClone(geminiFixture);
  body.steps = body.steps.filter((x) => x.type !== 'google_search_result');
  await executePlan(s, plan.id, { env, transport: async () => response(body) });
  assert.equal(s.runs[0].status, 'succeeded');
  assert.equal(metrics(s).N, 0);
});
test('configuration tampering is rejected before any API request', async () => {
  const { s, plan } = ready();
  plan.config.model = 'tampered';
  await assert.rejects(executePlan(s, plan.id, { env }), /快照/);
});
test('plan lifecycle pause, resume, clone preserves immutable configuration', () => {
  const { s, plan } = ready();
  planAction(s, { id: plan.id, action: 'resume' });
  assert.equal(plan.status, 'active');
  planAction(s, { id: plan.id, action: 'pause' });
  assert.equal(plan.status, 'paused');
  const cloned = planAction(s, { id: plan.id, action: 'clone' });
  assert.notEqual(cloned.id, plan.id);
  assert.deepEqual(cloned.config, plan.config);
});
test('transport timeout and malformed JSON are actual error paths, no synthetic fallback', async () => {
  const { plan } = ready();
  await assert.rejects(
    callSearch(plan.config, plan.config.prompts[0], {
      env,
      transport: async () => {
        throw new DOMException('Timeout', 'TimeoutError');
      },
    }),
    /超时/,
  );
  await assert.rejects(
    callSearch(plan.config, plan.config.prompts[0], {
      env,
      transport: async () => new Response('not-json'),
    }),
    /不是 JSON/,
  );
});
