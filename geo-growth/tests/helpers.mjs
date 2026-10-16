import {
  initialState,
  configureWorkspace,
  generatePrompts,
  editPrompt,
  createPlan,
  addExample,
  diagnose,
  createRevision,
  editRevision,
  approveRevision,
} from '../src/platform.mjs';
export function ready(provider = 'gemini', overrides = {}) {
  const s = initialState();
  configureWorkspace(s, {
    brand: 'TestBrand',
    aliases: 'TestBrand',
    domain: 'example.org',
    competitors: 'RivalWorks',
  });
  const product = s.products.find((p) => p.sku === 'P-200');
  generatePrompts(s, { productId: product.id });
  s.prompts.forEach((p) => editPrompt(s, { id: p.id, approve: true }));
  const plan = createPlan(s, {
    name: 'Contract fixture plan',
    productIds: [product.id],
    provider,
    model: 'test-model',
    country: 'US',
    language: 'en',
    cadenceHours: 24,
    dailyCallCap: 20,
    dailyBudgetUSD: 5,
    reservePerCallUSD: 0.1,
    ...overrides,
  });
  return { s, product, plan };
}
export const geminiFixture = {
  model: 'test-model',
  steps: [
    { type: 'google_search_call', arguments: { queries: ['synthetic contract fixture'] } },
    { type: 'google_search_result', result: [{ search_suggestions: 'fixture' }] },
    {
      type: 'model_output',
      content: [
        {
          type: 'text',
          text: 'I recommend TestBrand P-200 for evaluation.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://example.org/pump',
              title: 'Synthetic fixture',
              start_index: 0,
              end_index: 41,
            },
          ],
        },
      ],
    },
  ],
  usage: { total_tokens: 50 },
};
export const openaiFixture = {
  model: 'test-model',
  output: [
    { type: 'web_search_call', status: 'completed' },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'I recommend TestBrand P-200 for evaluation.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://example.org/pump',
              title: 'Synthetic fixture',
              start_index: 0,
              end_index: 41,
            },
          ],
        },
      ],
    },
  ],
  usage: { total_tokens: 50 },
};
export const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function approvedExample() {
  const s = initialState();
  addExample(s);
  const product = s.products.find((p) => p.sku === 'P-200');
  const d = diagnose(s, { runId: 'example-50', productId: product.id });
  const r = createRevision(s, { diagnosisId: d.id });
  for (const seg of r.segments)
    editRevision(s, {
      id: r.id,
      segmentId: seg.id,
      after: seg.after,
      decision: 'accept',
      expectedRevision: r.revision,
    });
  approveRevision(s, { id: r.id, expectedRevision: r.revision, confirmClaims: true });
  return { s, r, product };
}
