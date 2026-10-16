import { artifactHash as digest } from './hash.mjs';

export const VERSION = '3.0.0';
export const copy = (value) => structuredClone(value);
export function check(ok, message, status = 400) {
  if (!ok) throw Object.assign(new Error(message), { status });
}
const now = () => new Date().toISOString();
const uid = (prefix) => prefix + '-' + globalThis.crypto.randomUUID();
const event = (s, action, entity) => s.events.push({ id: uid('evt'), at: now(), action, entity });
const find = (list, id) => {
  const item = list.find((x) => x.id === id);
  check(item, '记录不存在', 404);
  return item;
};
const text = (value, max = 4000) => {
  check(typeof value === 'string' && value.trim() && value.length <= max, '必填文本为空或超长');
  return value.trim();
};
export const technicalSources = [
  {
    title: 'OpenAI · Web search',
    url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
    note: '官方 API 搜索与引用格式；API 样本不等于消费者端曝光。',
  },
  {
    title: 'Gemini · Google Search grounding',
    url: 'https://ai.google.dev/gemini-api/docs/google-search',
    note: '官方联网工具与来源标注。',
  },
  {
    title: 'OpenAI · Crawlers',
    url: 'https://developers.openai.com/api/docs/bots',
    note: '允许抓取不保证收录、排序或引用。',
  },
  {
    title: 'Google · AI features and your website',
    url: 'https://developers.google.com/search/docs/appearance/ai-features',
    note: 'Google Search AI 功能与 Gemini API 分开评估。',
  },
  {
    title: 'Raspberry Pi 5 · 官方规格',
    url: 'https://www.raspberrypi.com/products/raspberry-pi-5/',
    note: '仅保存少量公开规格事实。',
  },
];
export function initialState() {
  const s = {
    schemaVersion: 3,
    revision: 0,
    workspace: {
      brand: 'Northstar',
      aliases: ['Northstar'],
      domain: 'northstar.example',
      competitors: ['RivalWorks'],
      provenance: 'synthetic',
    },
    products: [],
    sources: [],
    facts: [],
    prompts: [],
    plans: [],
    runs: [],
    diagnoses: [],
    revisions: [],
    experiments: [],
    events: [],
  };
  importProducts(s, {
    origin: 'synthetic',
    name: '内置工业商品案例',
    rows: [
      {
        sku: 'P-200',
        name: '304 不锈钢离心泵',
        category: 'stainless steel centrifugal pump',
        series: '泵系列',
        material: 'Stainless steel 304',
        flow: '20 m³/h',
        power: '3 kW',
      },
      {
        sku: 'V-100',
        name: '不锈钢球阀',
        category: 'industrial ball valve',
        series: '阀系列',
        material: 'Stainless steel 304',
        size: 'DN25',
        pressure: 'PN16',
      },
    ],
  });
  importProducts(s, {
    origin: 'public',
    name: 'Raspberry Pi 5 官方规格摘录',
    url: technicalSources[4].url,
    rows: [
      {
        sku: 'PI5',
        name: 'Raspberry Pi 5',
        category: 'single-board computer',
        brand: 'Raspberry Pi',
        processor: 'Broadcom BCM2712, 2.4GHz quad-core Arm Cortex-A76',
        power: '5V/5A DC via USB-C',
      },
    ],
  });
  s.facts.forEach((f) => {
    f.status = 'approved';
    f.reviewedAt = now();
  });
  s.events = [];
  return s;
}
export function parseCSV(input) {
  check(typeof input === 'string' && input.length <= 1000000, 'CSV 太大');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  check(!quoted, 'CSV 引号未闭合');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map((x) => x.replace(/^\uFEFF/, '').trim());
  check(
    headers.includes('sku') && headers.includes('name') && headers.includes('category'),
    'CSV 必须包含 sku,name,category',
  );
  check(new Set(headers).size === headers.length, 'CSV 表头重复');
  check(
    rows.every((r) => r.length === headers.length),
    'CSV 列数不一致',
  );
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
export function importProducts(s, input) {
  const rows = input.csv ? parseCSV(input.csv) : input.rows;
  check(Array.isArray(rows) && rows.length > 0 && rows.length <= 500, '导入需要 1–500 行商品');
  check(['public', 'authorized', 'synthetic'].includes(input.origin), '必须声明资料来源类型');
  check(
    !input.context || (typeof input.context === 'string' && input.context.length <= 1000000),
    '原文上下文过长',
  );
  const source = {
    id: uid('src'),
    name: text(input.name, 200),
    origin: input.origin,
    url: input.url || null,
    checksum: digest(rows),
    contextChecksum: input.context ? digest(input.context) : null,
    status: 'active',
    version:
      1 + s.sources.filter((src) => src.name === input.name && src.origin === input.origin).length,
    at: now(),
    context: input.context || copy(rows),
  };
  const duplicate = s.sources.find(
    (src) =>
      src.status === 'active' &&
      src.origin === source.origin &&
      src.checksum === source.checksum &&
      src.contextChecksum === source.contextChecksum,
  );
  if (duplicate) {
    event(s, 'import:duplicate', duplicate.id);
    return duplicate;
  }
  s.sources.push(source);
  for (const [index, row] of rows.entries()) {
    const sku = text(row.sku, 100);
    text(row.name, 300);
    text(row.category, 200);
    let p = s.products.find((x) => x.sku === sku);
    if (!p) {
      p = {
        id: uid('prod'),
        sku,
        name: row.name,
        category: row.category,
        series: row.series || row.category,
        brand: row.brand || s.workspace.brand,
        origin: input.origin,
        description: row.description || '',
      };
      s.products.push(p);
    }
    for (const [attribute, value] of Object.entries(row)) {
      if (
        ['sku', 'name', 'category', 'series', 'brand', 'description', 'source_locator'].includes(
          attribute,
        ) ||
        /_(unit|conditions)$/.test(attribute) ||
        value === '' ||
        value == null
      )
        continue;
      check(typeof value === 'string' || typeof value === 'number', '商品字段仅接受文本或数字');
      const conflict = s.facts.some(
        (f) =>
          f.productId === p.id &&
          f.attribute === attribute &&
          (f.value !== String(value) || f.unit !== (row[attribute + '_unit'] || '')) &&
          f.conditions === (row[attribute + '_conditions'] || '') &&
          f.status !== 'rejected' &&
          s.sources.find((src) => src.id === f.sourceId)?.status === 'active',
      );
      s.facts.push({
        id: uid('fact'),
        productId: p.id,
        attribute,
        value: String(value),
        unit: row[attribute + '_unit'] || '',
        conditions: row[attribute + '_conditions'] || '',
        sourceId: source.id,
        locator: (row.source_locator || 'row:' + (index + 2)) + '/' + attribute,
        originalText: attribute + ': ' + value,
        sourceChecksum: source.checksum,
        version:
          1 + s.facts.filter((f) => f.productId === p.id && f.attribute === attribute).length,
        status: conflict ? 'conflict' : 'pending',
        at: now(),
      });
    }
  }
  event(s, 'import', source.id);
  return source;
}
export function usableFacts(s, productId) {
  return s.facts.filter(
    (f) =>
      f.productId === productId &&
      f.status === 'approved' &&
      s.sources.some((x) => x.id === f.sourceId && x.status === 'active'),
  );
}
export function retrieve(s, productId, query) {
  find(s.products, productId);
  const tokens =
    String(query)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || [];
  return usableFacts(s, productId)
    .map((f) => ({
      ...f,
      score: tokens.reduce(
        (n, t) => n + ((f.attribute + ' ' + f.value).toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
      method: 'SKU exact scope + lexical ranking',
    }))
    .sort((a, b) => b.score - a.score);
}
export function reviewFact(s, { id, decision }) {
  const f = find(s.facts, id);
  check(['approve', 'reject'].includes(decision), '审批动作无效');
  if (decision === 'approve')
    for (const other of s.facts)
      if (
        other.id !== id &&
        other.productId === f.productId &&
        other.attribute === f.attribute &&
        (other.value !== f.value || other.unit !== f.unit) &&
        other.conditions === f.conditions &&
        other.status === 'approved'
      )
        other.status = 'superseded';
  f.status = decision === 'approve' ? 'approved' : 'rejected';
  f.reviewedAt = now();
  event(s, 'fact:' + decision, id);
  return f;
}
export function withdrawSource(s, { id }) {
  find(s.sources, id).status = 'withdrawn';
  event(s, 'source:withdraw', id);
}
export function configureWorkspace(s, input) {
  const domain = text(input.domain, 253).toLowerCase();
  check(
    /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !domain.includes('..'),
    '输入域名，例如 example.com，不含协议',
  );
  s.workspace = {
    brand: text(input.brand, 100),
    aliases: [
      ...new Set(
        [input.brand, ...(input.aliases || '').split(',')].map((x) => x.trim()).filter(Boolean),
      ),
    ],
    domain,
    competitors: (input.competitors || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    provenance: input.provenance === 'synthetic' ? 'synthetic' : 'user-declared',
  };
  event(s, 'workspace:update', domain);
  return s.workspace;
}
export function generatePrompts(s, { productId, language = 'en', country = 'US' }) {
  const p = find(s.products, productId);
  check(['en', 'de', 'zh'].includes(language), '当前模板支持 en / de / zh');
  check(usableFacts(s, productId).length, '先审核商品事实');
  const templates = {
    en: [
      ['supplier', `Which suppliers offer ${p.category} for industrial procurement?`],
      ['selection', `How should a buyer select a ${p.category}?`],
      ['specification', `What technical specifications should I compare for ${p.category}?`],
      ['commercial', `What should I verify about MOQ and delivery when sourcing ${p.category}?`],
    ],
    de: [
      ['supplier', `Welche Lieferanten bieten ${p.category} für die industrielle Beschaffung an?`],
      ['selection', `Wie wählt man ${p.category} für die Beschaffung aus?`],
      [
        'specification',
        `Welche technischen Spezifikationen sind bei ${p.category} zu vergleichen?`,
      ],
      ['commercial', `Was ist bei Mindestbestellmenge und Lieferung für ${p.category} zu prüfen?`],
    ],
    zh: [
      ['supplier', `${p.category}有哪些可选供应商？`],
      ['selection', `采购${p.category}应如何选型？`],
      ['specification', `${p.category}采购需比较哪些技术参数？`],
      ['commercial', `采购${p.category}时如何核实起订量和交期？`],
    ],
  };
  const created = [];
  for (const [intent, question] of templates[language]) {
    if (
      s.prompts.some(
        (x) => x.productId === productId && x.question === question && x.country === country,
      )
    )
      continue;
    const prompt = {
      id: uid('prompt'),
      productId,
      question,
      language,
      country,
      intent,
      priority: intent === 'supplier' ? 90 : 70,
      priorityBasis: '采购意图人工规则；不是搜索量',
      source: 'category-template',
      factIds: usableFacts(s, productId).map((f) => f.id),
      version: 1,
      status: 'draft',
    };
    s.prompts.push(prompt);
    created.push(prompt);
  }
  event(s, 'prompts:generate', productId);
  return created;
}
export function editPrompt(s, { id, question, approve = false }) {
  const p = find(s.prompts, id);
  if (question && question !== p.question) {
    p.question = text(question, 2000);
    p.version++;
    p.status = 'draft';
  }
  if (approve) p.status = 'approved';
  event(s, 'prompt:update', id);
  return p;
}
export function createPlan(s, input) {
  const selected = input.productIds || [input.productId];
  check(selected.length && selected.length <= 50, '请选择商品');
  selected.forEach((id) => find(s.products, id));
  const prompts = s.prompts.filter(
    (p) =>
      selected.includes(p.productId) &&
      p.status === 'approved' &&
      p.language === input.language &&
      p.country === input.country,
  );
  check(prompts.length, '没有符合国家和语言的已批准问题');
  check(
    !prompts.some((p) => matchingSpan(p.question, s.workspace.aliases)),
    '当前只支持中性发现问题；问题不能预先提示我方品牌',
  );
  check(['gemini', 'openai'].includes(input.provider), '当前仅支持 Gemini / OpenAI 搜索通道');
  check([1, 4, 24].includes(Number(input.cadenceHours)), '监测频率为 1/4/24 小时');
  const config = {
    productIds: selected,
    prompts: copy(prompts),
    provider: input.provider,
    model: text(input.model, 120),
    country: text(input.country, 2),
    language: input.language,
    cadenceHours: Number(input.cadenceHours),
    dailyCallCap: Number(input.dailyCallCap),
    dailyBudgetUSD: Number(input.dailyBudgetUSD),
    reservePerCallUSD: Number(input.reservePerCallUSD),
    concurrency: 1,
    retries: 2,
    search: true,
    workspace: copy(s.workspace),
  };
  check(/^[A-Z]{2}$/.test(config.country), '国家须使用两位大写代码');
  check(
    Number.isInteger(config.dailyCallCap) && config.dailyCallCap > 0 && config.dailyCallCap <= 1000,
    '每日调用上限 1–1000',
  );
  check(
    config.dailyBudgetUSD > 0 &&
      config.dailyBudgetUSD <= 1000 &&
      config.reservePerCallUSD > 0 &&
      config.reservePerCallUSD <= config.dailyBudgetUSD,
    '预算及每次预留金额必须大于零',
  );
  const p = {
    id: uid('plan'),
    name: text(input.name, 120),
    config,
    configHash: digest(config),
    version: 1,
    status: 'paused',
    createdAt: now(),
    nextDueAt: now(),
    lastError: null,
  };
  s.plans.push(p);
  event(s, 'plan:create', p.id);
  return p;
}
export function planAction(s, { id, action }) {
  const p = find(s.plans, id);
  check(['pause', 'resume', 'clone'].includes(action), '计划动作无效');
  if (action === 'clone') {
    const cloned = copy(p);
    cloned.id = uid('plan');
    cloned.name += ' · 副本';
    cloned.status = 'paused';
    cloned.createdAt = now();
    cloned.nextDueAt = now();
    s.plans.push(cloned);
    return cloned;
  }
  p.status = action === 'pause' ? 'paused' : 'active';
  p.lastError = null;
  event(s, 'plan:' + action, id);
  return p;
}
function matchingSpan(answer, aliases) {
  for (const alias of aliases) {
    if (!alias) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      /[\u3400-\u9fff]/.test(alias)
        ? escaped
        : '(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])',
      'iu',
    );
    const m = re.exec(answer);
    if (m) return { text: m[0], start: m.index, end: m.index + m[0].length };
  }
  return null;
}
export function annotate(answer, citations, workspace, products) {
  const brandSpan = matchingSpan(answer, workspace.aliases);
  const productSpan = matchingSpan(
    answer,
    products.flatMap((p) => [p.sku, p.name]),
  );
  const sentences = answer.split(/[.!?。！？\n,;；]+/);
  const recommendation = sentences.find(
    (sentence) =>
      workspace.aliases.some((alias) => {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return (
          matchingSpan(sentence, [alias]) &&
          new RegExp(
            '(?:recommend(?:ed)?|choose|empfehle[n]?|推荐|建议选择)\\s+(?:(?:the|using|evaluating|choosing|supplier|brand|considering)\\s+){0,3}' +
              escaped +
              '|(?:推荐|建议选择)\\s*' +
              escaped +
              '|' +
              escaped +
              '\\s+(?:(?:is|was|can be)\\s+)?(?:recommended|empfohlen|值得推荐)',
            'iu',
          ).test(sentence)
        );
      }) &&
      !/not\s+(?:\w+\s+){0,2}recommend|do not|cannot|avoid|nicht|不推荐|不建议/i.test(sentence),
  );
  const ownCitations = citations.filter((c) => {
    try {
      const u = new URL(c.url);
      return (
        ['http:', 'https:'].includes(u.protocol) &&
        (u.hostname === workspace.domain || u.hostname.endsWith('.' + workspace.domain))
      );
    } catch {
      return false;
    }
  });
  return {
    brand: !!brandSpan,
    product: !!productSpan,
    recommended: !!brandSpan && !!recommendation,
    ownCitation: ownCitations.length > 0,
    brandSpan,
    productSpan,
    recommendation: recommendation || null,
    ownCitations,
    competitors: workspace.competitors.filter((c) => matchingSpan(answer, [c])),
    method: 'auditable-rule-v1',
    reviewStatus: 'pending',
  };
}
export function effectiveRuns(s, filter = {}) {
  const origin = filter.origin || 'real';
  check(['real', 'synthetic'].includes(origin), '数据来源筛选无效');
  const seen = new Set();
  return s.runs.filter((r) => {
    if (r.origin !== origin || r.status !== 'succeeded' || !r.searchPerformed || !r.answer?.trim())
      return false;
    if (
      (filter.planId && r.planId !== filter.planId) ||
      (filter.productId && !r.productIds.includes(filter.productId)) ||
      (filter.provider && r.provider !== filter.provider) ||
      (filter.country && r.country !== filter.country) ||
      (filter.language && r.language !== filter.language) ||
      (filter.from && r.at < filter.from) ||
      (filter.to && r.at > filter.to) ||
      (filter.intent && r.prompt.intent !== filter.intent)
    )
      return false;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
export function metrics(s, filter = {}) {
  const origin = filter.origin || 'real';
  const relevant = s.runs.filter(
    (r) =>
      r.origin === origin &&
      (!filter.planId || r.planId === filter.planId) &&
      (!filter.productId || r.productIds.includes(filter.productId)) &&
      (!filter.provider || r.provider === filter.provider) &&
      (!filter.country || r.country === filter.country) &&
      (!filter.language || r.language === filter.language) &&
      (!filter.from || r.at >= filter.from) &&
      (!filter.to || r.at <= filter.to) &&
      (!filter.intent || r.prompt.intent === filter.intent),
  );
  const rows = effectiveRuns(s, filter);
  const N = rows.length,
    B = rows.filter((r) => r.annotation.brand).length,
    R = rows.filter((r) => r.annotation.recommended && r.annotation.brand).length,
    P = rows.filter((r) => r.annotation.product).length,
    C = rows.filter((r) => r.annotation.ownCitation).length;
  const rate = (n, d) => (d ? n / d : null);
  return {
    planned: relevant.length,
    attempts: relevant.reduce((n, r) => n + r.attempts.length, 0),
    N,
    B,
    R,
    P,
    C,
    brandRate: rate(B, N),
    recommendationRate: rate(R, B),
    overallRecommendationRate: rate(R, N),
    citationRate: rate(C, N),
    productRate: rate(P, N),
    reservedUSD: relevant.reduce((n, r) => n + (r.reservedUSD || 0), 0),
    costLabel: '预算预留，非供应商账单',
    failed: relevant.filter((r) => r.status === 'failed').length,
    blocked: relevant.filter((r) => r.status === 'blocked').length,
    competitors: Object.fromEntries(
      s.workspace.competitors.map((c) => [
        c,
        rows.filter((r) => r.annotation.competitors.includes(c)).length,
      ]),
    ),
    ids: rows.map((r) => r.id),
  };
}
export function addExample(s) {
  if (s.runs.some((r) => r.fixture === 'prd-100')) return { count: 0 };
  const product = s.products.find((p) => p.sku === 'P-200');
  check(product, '示例商品 P-200 已不存在');
  const workspace = {
    brand: 'Northstar',
    aliases: ['Northstar'],
    domain: 'northstar.example',
    competitors: ['RivalWorks'],
  };
  for (let i = 0; i < 100; i++) {
    const answer =
      i < 18
        ? 'I recommend Northstar P-200 for evaluation; verify suitability.'
        : i < 32
          ? 'Northstar P-200 is mentioned as an option.'
          : 'Compare technical evidence from suppliers including RivalWorks.';
    const citations =
      i >= 40 && i < 52
        ? [{ url: 'https://northstar.example/pump', title: 'Synthetic fixture source' }]
        : [];
    s.runs.push({
      id: 'example-' + i,
      fixture: 'prd-100',
      origin: 'synthetic',
      at: now(),
      status: 'succeeded',
      searchPerformed: true,
      provider: 'fixture',
      model: 'synthetic-fixture-v1',
      country: 'US',
      language: 'en',
      productIds: [product.id],
      planId: 'example-plan',
      configHash: 'fixture-v1',
      prompt: {
        id: 'example-q',
        version: 1,
        question: 'Which suppliers offer stainless steel centrifugal pumps?',
        intent: 'supplier',
      },
      answer,
      citations,
      annotation: annotate(answer, citations, workspace, [product]),
      attempts: [{ status: 'fixture', at: now() }],
      reservedUSD: 0,
      raw: { fixture: 'Explicitly synthetic; no external API request', index: i },
    });
  }
  event(s, 'example:load', 'prd-100');
  return { count: 100 };
}
export function diagnose(s, { runId, productId }) {
  const run = find(s.runs, runId);
  check(run.productIds.includes(productId), '诊断商品不在样本范围');
  check(run.status === 'succeeded' && run.searchPerformed, '需要有效联网样本或独立案例样本');
  const facts = usableFacts(s, productId);
  check(facts.length, '无已审核事实可用于诊断');
  const components = {
    impact: run.annotation.recommended ? 2 : 4,
    intentWeight: run.prompt.intent === 'supplier' ? 3 : 2,
    confidence: 0.5,
    effort: 2,
    risk: 1,
  };
  const d = {
    id: uid('diag'),
    runId,
    productId,
    origin: run.origin,
    type: 'hypothesis',
    issue: run.annotation.recommended
      ? '补充可核验的商品参数和来源'
      : '该样本未识别到我方推荐；检查商品参数和采购问答的可验证性',
    explanation: '样本表现是观察；内容不足是否导致未推荐尚未证实。当前建议由本地规则生成。',
    factIds: facts.map((f) => f.id),
    components,
    priority:
      (components.impact * components.intentWeight * components.confidence) /
      (components.effort + components.risk),
    status: 'open',
    at: now(),
  };
  s.diagnoses.push(d);
  event(s, 'diagnosis:create', d.id);
  return d;
}
export function factText(f) {
  return (
    f.attribute +
    ': ' +
    f.value +
    (f.unit && !f.value.includes(f.unit) ? ' ' + f.unit : '') +
    (f.conditions ? ' (' + f.conditions + ')' : '')
  );
}
export function createRevision(s, { diagnosisId }) {
  const d = find(s.diagnoses, diagnosisId),
    p = find(s.products, d.productId),
    facts = usableFacts(s, p.id);
  check(facts.length, '可用事实已撤回');
  const segments = [
    {
      id: 'specs',
      label: '参数段落',
      before: p.description,
      after: facts.map(factText).join('\n'),
      factIds: facts.map((f) => f.id),
      decision: 'pending',
    },
    {
      id: 'faq',
      label: '采购 FAQ',
      before: '',
      after:
        'Verified specifications:\n' +
        facts.map(factText).join('\n') +
        '\nMOQ, delivery and certification require supplier confirmation.',
      factIds: facts.map((f) => f.id),
      decision: 'pending',
    },
  ];
  const r = {
    id: uid('rev'),
    productId: p.id,
    diagnosisId: d.id,
    origin: d.origin,
    version: s.revisions.filter((r) => r.productId === p.id).length + 1,
    status: 'draft',
    segments,
    revision: 0,
    at: now(),
    generator: 'grounded-template-v1',
    missingTasks: ['核实 MOQ', '核实交付条款', '核实认证证据'],
    approved: null,
  };
  s.revisions.push(r);
  event(s, 'content:create', r.id);
  return r;
}
export function editRevision(s, { id, segmentId, after, decision, expectedRevision }) {
  const r = find(s.revisions, id);
  check(r.status === 'draft', '已审批版本不可编辑', 409);
  check(r.revision === expectedRevision, '版本冲突，请刷新', 409);
  const segment = find(r.segments, segmentId);
  check(['accept', 'reject'].includes(decision), '先接受或拒绝片段');
  check(
    typeof after === 'string' && after.length <= 20000 && (decision === 'reject' || after.trim()),
    '接受片段不能空白或超过 20000 字符',
  );
  segment.after = after;
  segment.decision = decision;
  segment.reviewedManually = true;
  r.revision++;
  event(s, 'content:edit', id);
  return r;
}
export function approveRevision(s, { id, expectedRevision, confirmClaims }) {
  const r = find(s.revisions, id);
  check(r.status === 'draft' && r.revision === expectedRevision, '审批状态或版本冲突', 409);
  check(confirmClaims === true, '请确认人工核验新增声明');
  check(
    r.segments.every((x) => x.decision !== 'pending'),
    '每个片段都需接受或拒绝',
  );
  const accepted = r.segments.filter((x) => x.decision === 'accept');
  check(accepted.length, '至少接受一个片段');
  check(
    accepted.every((x) =>
      x.factIds.every((id) => usableFacts(s, r.productId).some((f) => f.id === id)),
    ),
    '引用事实已失效，需重新生成',
  );
  const artifact = previewRevision(s, id);
  r.approved = { artifact, hash: digest(artifact), at: now() };
  r.status = 'approved';
  r.revision++;
  event(s, 'content:approve', id);
  return r;
}
export function previewRevision(s, id) {
  const r = find(s.revisions, id),
    accepted = r.segments.filter((x) => x.decision === 'accept');
  return {
    product: copy(find(s.products, r.productId)),
    version: r.version,
    origin: r.origin,
    segments: copy(r.segments),
    missingTasks: copy(r.missingTasks),
    facts: copy(usableFacts(s, r.productId)),
    sourceSnapshots: copy(
      s.sources.filter((src) =>
        accepted.some((seg) =>
          seg.factIds.some((id) => s.facts.find((f) => f.id === id)?.sourceId === src.id),
        ),
      ),
    ),
  };
}
export function exportRevision(s, id) {
  const r = find(s.revisions, id);
  check(r.status === 'approved' && r.approved, '先批准完整内容', 409);
  check(digest(r.approved.artifact) === r.approved.hash, '审批快照校验失败', 409);
  return copy({ ...r.approved, revisionId: id });
}
export function rollbackRevision(s, { id }) {
  const old = find(s.revisions, id);
  check(old.status === 'approved', '只能以批准版本创建回退草稿');
  const r = copy(old);
  r.id = uid('rev');
  r.version = s.revisions.filter((x) => x.productId === old.productId).length + 1;
  r.status = 'draft';
  r.approved = null;
  r.revision = 0;
  r.rollbackOf = id;
  r.at = now();
  r.segments.forEach((x) => (x.decision = 'pending'));
  s.revisions.push(r);
  return r;
}
export function createExperiment(s, { planId, revisionId, baselineIds, changeAt }) {
  const plan = find(s.plans, planId);
  const revision = find(s.revisions, revisionId);
  check(revision.status === 'approved', '先批准内容');
  check(plan.config.productIds.includes(revision.productId), '内容商品不在计划范围');
  const baseline = effectiveRuns(s, { origin: 'real', planId }).filter(
    (r) => baselineIds.includes(r.id) && r.productIds.includes(revision.productId),
  );
  check(baseline.length, '需要该计划的真实有效基线');
  check(
    changeAt && !Number.isNaN(Date.parse(changeAt)) && Date.parse(changeAt) <= Date.now(),
    '填写已发生的内容上线时间',
  );
  check(
    baseline.every((r) => r.at < changeAt),
    '基线必须早于内容上线',
  );
  const e = {
    id: uid('exp'),
    planId,
    revisionId,
    productId: revision.productId,
    contentHash: revision.approved.hash,
    configHash: plan.configHash,
    config: copy(plan.config),
    baselineIds: baseline.map((r) => r.id),
    changeAt,
    at: now(),
  };
  s.experiments.push(e);
  event(s, 'experiment:create', e.id);
  return e;
}
export function evaluateExperiment(s, id) {
  const e = find(s.experiments, id);
  const base = s.runs.filter((r) => e.baselineIds.includes(r.id));
  const post = effectiveRuns(s, {
    origin: 'real',
    planId: e.planId,
    productId: e.productId,
  }).filter((r) => r.at >= e.changeAt);
  const compatible = (r) =>
    r.configHash === e.configHash &&
    r.model === e.config.model &&
    e.config.prompts.some(
      (p) =>
        p.id === r.prompt.id && p.version === r.prompt.version && p.question === r.prompt.question,
    );
  if ([...base, ...post].some((r) => !compatible(r)))
    return { status: '不可比较', reason: '问题、模型或采样配置发生变化' };
  if (new Set([...base, ...post].map((r) => r.providerModel || r.model)).size > 1)
    return { status: '不可比较', reason: '供应商返回的模型版本发生变化' };
  const ratio = (rs) =>
    rs.length ? rs.filter((r) => r.annotation.recommended).length / rs.length : null;
  const citation = (rs) =>
    rs.length ? rs.filter((r) => r.annotation.ownCitation).length / rs.length : null;
  const low = base.length < 30 || post.length < 30;
  const delta = post.length ? ratio(post) - ratio(base) : null;
  const se =
    delta === null
      ? null
      : Math.sqrt(
          (ratio(base) * (1 - ratio(base))) / base.length +
            (ratio(post) * (1 - ratio(post))) / post.length,
        );
  return {
    status: low ? '样本不足' : delta > 0 ? '观察到改善' : delta < 0 ? '观察到下降' : '未观察到变化',
    baselineN: base.length,
    postN: post.length,
    recommendationDelta: delta,
    citationDelta: post.length ? citation(post) - citation(base) : null,
    approximate95CI:
      se === null ? null : [Math.max(-1, delta - 1.96 * se), Math.min(1, delta + 1.96 * se)],
    limitation: '前后观察比较，不证明内容修改造成提升；区间为独立样本正态近似，小样本不可依赖。',
  };
}
export function mutate(s, action, input) {
  const handlers = {
    workspace: configureWorkspace,
    import: importProducts,
    fact: reviewFact,
    withdraw: withdrawSource,
    prompts: generatePrompts,
    prompt: editPrompt,
    plan: createPlan,
    'plan-action': planAction,
    example: addExample,
    diagnose: diagnose,
    content: createRevision,
    'edit-content': editRevision,
    'approve-content': approveRevision,
    rollback: rollbackRevision,
    experiment: createExperiment,
  };
  check(handlers[action], '操作不存在', 404);
  const result = handlers[action](s, input);
  s.revision++;
  return result;
}
