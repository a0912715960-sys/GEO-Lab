import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../src/platform.mjs';
import { artifactHash, canonicalJson } from '../src/hash.mjs';
import { createHash } from 'node:crypto';
import { ready, approvedExample } from './helpers.mjs';
test('Chinese recommendation without spaces and German recommendation have explicit own-brand evidence', () => {
  const zh = { aliases: ['北极星'], domain: 'example.org', competitors: [] };
  assert.equal(p.annotate('建议选择北极星产品。', [], zh, []).recommended, true);
  assert.equal(p.annotate('不推荐北极星产品。', [], zh, []).recommended, false);
  assert.equal(
    p.annotate('Ich empfehle TestBrand.', [], { ...zh, aliases: ['TestBrand'] }, []).recommended,
    true,
  );
});

test('reimport deduplicates active source and keeps original facts', () => {
  const s = p.initialState(),
    before = s.facts.length,
    source = s.sources[0];
  const result = p.importProducts(s, {
    name: 'Same file renamed',
    origin: 'synthetic',
    rows: structuredClone(source.context),
  });
  assert.equal(result.id, source.id);
  assert.equal(s.facts.length, before);
});
test('unit, conditions and source page survive generation without creating metadata facts', () => {
  const s = p.initialState();
  p.importProducts(s, {
    name: 'Manual parameters',
    origin: 'authorized',
    context: 'page:7 Power 7 kW under rated load',
    rows: [
      {
        sku: 'UNIT-1',
        name: 'Unit Pump',
        category: 'pump',
        power: '7',
        power_unit: 'kW',
        power_conditions: 'rated load',
        source_locator: 'page:7',
      },
    ],
  });
  const product = s.products.at(-1),
    facts = s.facts.filter((f) => f.productId === product.id);
  assert.equal(facts.length, 1);
  p.reviewFact(s, { id: facts[0].id, decision: 'approve' });
  assert.equal(p.factText(facts[0]), 'power: 7 kW (rated load)');
  assert.equal(facts[0].locator, 'page:7/power');
  assert.ok(s.sources.at(-1).contextChecksum);
});
test('neutral discovery plan rejects edited own-brand leading question', () => {
  const { s, product } = ready();
  p.editPrompt(s, {
    id: s.prompts[0].id,
    question: 'Why is TestBrand the best supplier?',
    approve: true,
  });
  assert.throws(
    () =>
      p.createPlan(s, {
        name: 'Leading',
        productIds: [product.id],
        provider: 'gemini',
        model: 'x',
        language: 'en',
        country: 'US',
        cadenceHours: 24,
        dailyCallCap: 10,
        dailyBudgetUSD: 2,
        reservePerCallUSD: 0.1,
      }),
    /预先提示/,
  );
});

test('PRD fixture: N100/B32/R18/C12 and citation outside brand funnel', () => {
  const s = p.initialState();
  p.addExample(s);
  const m = p.metrics(s, { origin: 'synthetic' });
  assert.deepEqual([m.N, m.B, m.R, m.C, m.recommendationRate], [100, 32, 18, 12, 0.5625]);
  assert.equal(p.metrics(s).N, 0);
  assert.equal(s.runs.filter((r) => r.annotation.ownCitation && !r.annotation.brand).length, 12);
  assert.equal(p.addExample(s).count, 0);
});
test('effective denominator excludes failure, no search, blank, duplicate and other origin', () => {
  const s = p.initialState();
  p.addExample(s);
  s.runs.push(structuredClone(s.runs[0]));
  s.runs[1].status = 'failed';
  s.runs[2].searchPerformed = false;
  s.runs[3].answer = ' ';
  assert.equal(p.metrics(s, { origin: 'synthetic' }).N, 97);
});
test('filters apply to denominator and request accounting', () => {
  const s = p.initialState();
  p.addExample(s);
  assert.equal(p.metrics(s, { origin: 'synthetic', provider: 'gemini' }).N, 0);
  assert.equal(p.metrics(s, { origin: 'synthetic', country: 'DE' }).attempts, 0);
  assert.equal(p.metrics(s, { origin: 'synthetic', intent: 'supplier' }).N, 100);
});
test('CSV supports quoted comma, escaped quotes, multiline and BOM', () => {
  const rows = p.parseCSV('\uFEFFsku,name,category,note\r\nA,"Pump, A",pump,"Line 1\n""quoted"""');
  assert.equal(rows[0].name, 'Pump, A');
  assert.equal(rows[0].note, 'Line 1\n"quoted"');
  assert.throws(() => p.parseCSV('sku,name,category\nA,"b,c'));
  assert.throws(() => p.parseCSV('sku,name,category\nA,b'));
});
test('imported facts retain provenance, require review and do not mix SKU', () => {
  const s = p.initialState();
  const src = p.importProducts(s, {
    origin: 'authorized',
    name: 'Customer table',
    rows: [
      { sku: 'NEW1', name: 'One', category: 'pump', power: '7 kW' },
      { sku: 'NEW2', name: 'Two', category: 'pump', power: '11 kW' },
    ],
  });
  const a = s.products.find((x) => x.sku === 'NEW1'),
    b = s.products.find((x) => x.sku === 'NEW2');
  assert.equal(p.retrieve(s, a.id, 'power').length, 0);
  const f = s.facts.find((x) => x.productId === a.id);
  p.reviewFact(s, { id: f.id, decision: 'approve' });
  assert.equal(p.retrieve(s, a.id, 'power')[0].value, '7 kW');
  assert.equal(p.retrieve(s, b.id, 'power').length, 0);
  assert.equal(f.sourceId, src.id);
  assert.equal(f.sourceChecksum, src.checksum);
});
test('conflicting values stay visible until explicit review supersedes old value', () => {
  const s = p.initialState(),
    product = s.products.find((x) => x.sku === 'P-200');
  p.importProducts(s, {
    origin: 'authorized',
    name: 'Changed spec',
    rows: [{ sku: 'P-200', name: product.name, category: product.category, power: '8 kW' }],
  });
  const f = s.facts.at(-1);
  assert.equal(f.status, 'conflict');
  assert.equal(p.usableFacts(s, product.id).find((x) => x.attribute === 'power').value, '3 kW');
  p.reviewFact(s, { id: f.id, decision: 'approve' });
  assert.equal(p.usableFacts(s, product.id).filter((x) => x.attribute === 'power').length, 1);
  assert.equal(p.usableFacts(s, product.id).find((x) => x.attribute === 'power').value, '8 kW');
});
test('withdrawn source is excluded from new retrieval and content', () => {
  const { s, r, product } = approvedExample();
  p.withdrawSource(s, { id: s.facts.find((x) => x.productId === product.id).sourceId });
  assert.equal(p.retrieve(s, product.id, 'power').length, 0);
  assert.throws(() => p.createRevision(s, { diagnosisId: r.diagnosisId }), /撤回/);
  assert.ok(
    p.exportRevision(s, r.id).artifact.facts.length > 0,
    'historical approved evidence remains immutable',
  );
});
test('prompt edit increments version, old plan snapshot does not change', () => {
  const { s, plan } = ready();
  const frozen = structuredClone(plan.config);
  p.editPrompt(s, { id: s.prompts[0].id, question: 'What evidence should a pump buyer verify?' });
  assert.equal(s.prompts[0].version, 2);
  assert.equal(s.prompts[0].status, 'draft');
  assert.deepEqual(plan.config, frozen);
});
test('plan requires approved prompts for exact locale and positive budget', () => {
  const { s, product } = ready();
  assert.throws(
    () =>
      p.createPlan(s, {
        name: 'Bad',
        productIds: [product.id],
        provider: 'gemini',
        model: 'x',
        language: 'de',
        country: 'DE',
        cadenceHours: 24,
      }),
    /没有符合/,
  );
  assert.throws(
    () =>
      p.createPlan(s, {
        name: 'Bad',
        productIds: [product.id],
        provider: 'gemini',
        model: 'x',
        language: 'en',
        country: 'US',
        cadenceHours: 24,
        dailyCallCap: 10,
        dailyBudgetUSD: 0,
        reservePerCallUSD: 0,
      }),
    /预算/,
  );
});
test('recommendation has to refer to own brand, negative and competing recommendation do not count', () => {
  const w = { aliases: ['TestBrand'], domain: 'example.org', competitors: ['Other'] };
  assert.equal(p.annotate('I recommend TestBrand.', [], w, []).recommended, true);
  assert.equal(p.annotate('TestBrand is not recommended.', [], w, []).recommended, false);
  assert.equal(p.annotate('TestBrand is listed; I recommend Other.', [], w, []).recommended, false);
  assert.equal(
    p.annotate('TestBrand and Other are options. I recommend Other.', [], w, []).recommended,
    false,
  );
  assert.equal(p.annotate('TestBranding is recommended.', [], w, []).brand, false);
});
test('own citation checks hostname, excludes deceptive suffix and javascript', () => {
  const w = { aliases: ['TestBrand'], domain: 'example.org', competitors: [] };
  assert.equal(
    p.annotate('Evidence.', [{ url: 'https://docs.example.org/a' }], w, []).ownCitation,
    true,
  );
  assert.equal(
    p.annotate(
      'Evidence.',
      [{ url: 'https://example.org.attacker.test/a' }, { url: 'javascript:example.org' }],
      w,
      [],
    ).ownCitation,
    false,
  );
});
test('diagnosis stays a hypothesis bound to a raw run and facts, bad SKU rejected', () => {
  const s = p.initialState();
  p.addExample(s);
  const prod = s.products.find((x) => x.sku === 'P-200');
  const d = p.diagnose(s, { runId: 'example-50', productId: prod.id });
  assert.equal(d.type, 'hypothesis');
  assert.equal(d.runId, 'example-50');
  assert.ok(d.factIds.length);
  assert.throws(
    () =>
      p.diagnose(s, {
        runId: 'example-50',
        productId: s.products.find((x) => x.sku === 'V-100').id,
      }),
    /范围/,
  );
});
test('approval equals complete preview; export never rebuilds from current catalogue', () => {
  const { s, r, product } = approvedExample();
  const expected = structuredClone(r.approved);
  s.products.find((x) => x.id === product.id).name = 'changed catalogue';
  s.facts[0].value = 'changed later';
  assert.deepEqual(p.exportRevision(s, r.id).artifact, expected.artifact);
  assert.equal(artifactHash(expected.artifact), expected.hash);
  assert.equal(
    createHash('sha256').update(canonicalJson(expected.artifact)).digest('hex'),
    expected.hash,
  );
  assert.throws(
    () => p.approveRevision(s, { id: r.id, expectedRevision: r.revision, confirmClaims: true }),
    /冲突/,
  );
});
test('draft approval gate, segment decision, manual edits and optimistic conflict', () => {
  const s = p.initialState();
  p.addExample(s);
  const prod = s.products[0],
    d = p.diagnose(s, { runId: 'example-50', productId: prod.id }),
    r = p.createRevision(s, { diagnosisId: d.id });
  assert.throws(() => p.exportRevision(s, r.id), /批准/);
  assert.throws(
    () => p.approveRevision(s, { id: r.id, expectedRevision: 0, confirmClaims: true }),
    /每个/,
  );
  p.editRevision(s, {
    id: r.id,
    segmentId: 'specs',
    after: 'Human reviewed text',
    decision: 'accept',
    expectedRevision: 0,
  });
  assert.throws(
    () =>
      p.editRevision(s, {
        id: r.id,
        segmentId: 'faq',
        after: 'x',
        decision: 'accept',
        expectedRevision: 0,
      }),
    /版本冲突/,
  );
  p.editRevision(s, {
    id: r.id,
    segmentId: 'faq',
    after: '',
    decision: 'reject',
    expectedRevision: 1,
  });
  const preview = p.previewRevision(s, r.id);
  p.approveRevision(s, { id: r.id, expectedRevision: 2, confirmClaims: true });
  assert.deepEqual(p.exportRevision(s, r.id).artifact, preview);
  assert.equal(r.approved.artifact.segments[0].after, 'Human reviewed text');
});
test('approved hash detects tampering and rollback creates new pending version', () => {
  const { s, r } = approvedExample();
  const rollback = p.rollbackRevision(s, { id: r.id });
  assert.equal(rollback.status, 'draft');
  assert.equal(rollback.version, r.version + 1);
  assert.equal(rollback.approved, null);
  assert.equal(rollback.segments[0].decision, 'pending');
  r.approved.artifact.segments[0].after = 'tampered';
  assert.throws(() => p.exportRevision(s, r.id), /校验/);
});
test('source withdrawn after draft blocks approval', () => {
  const s = p.initialState();
  p.addExample(s);
  const prod = s.products[0],
    d = p.diagnose(s, { runId: 'example-50', productId: prod.id }),
    r = p.createRevision(s, { diagnosisId: d.id });
  for (const seg of r.segments)
    p.editRevision(s, {
      id: r.id,
      segmentId: seg.id,
      after: seg.after,
      decision: 'accept',
      expectedRevision: r.revision,
    });
  p.withdrawSource(s, { id: s.facts[0].sourceId });
  assert.throws(
    () => p.approveRevision(s, { id: r.id, expectedRevision: r.revision, confirmClaims: true }),
    /失效/,
  );
});
test('experiment rejects synthetic-only baseline instead of reporting fake uplift', () => {
  const { s, r, product } = approvedExample();
  p.generatePrompts(s, { productId: product.id });
  s.prompts.forEach((q) => p.editPrompt(s, { id: q.id, approve: true }));
  const plan = p.createPlan(s, {
    name: 'Exp',
    productIds: [product.id],
    provider: 'gemini',
    model: 'test',
    language: 'en',
    country: 'US',
    cadenceHours: 24,
    dailyCallCap: 10,
    dailyBudgetUSD: 2,
    reservePerCallUSD: 0.1,
  });
  assert.throws(
    () =>
      p.createExperiment(s, {
        planId: plan.id,
        revisionId: r.id,
        baselineIds: ['example-1'],
        changeAt: new Date().toISOString(),
      }),
    /真实有效基线/,
  );
});
test('experiment reports small N and incompatible sampling, no causal attribution', () => {
  const { s, plan, product } = ready();
  p.addExample(s);
  const d = p.diagnose(s, { runId: 'example-1', productId: product.id }),
    rev = p.createRevision(s, { diagnosisId: d.id });
  for (const seg of rev.segments)
    p.editRevision(s, {
      id: rev.id,
      segmentId: seg.id,
      after: seg.after,
      decision: 'accept',
      expectedRevision: rev.revision,
    });
  p.approveRevision(s, { id: rev.id, expectedRevision: rev.revision, confirmClaims: true });
  const base = {
    ...structuredClone(s.runs[0]),
    id: 'base',
    origin: 'real',
    planId: plan.id,
    configHash: plan.configHash,
    model: plan.config.model,
    prompt: structuredClone(plan.config.prompts[0]),
    at: '2026-01-01T00:00:00.000Z',
  };
  s.runs.push(base);
  s.runs.push({
    ...structuredClone(base),
    id: 'foreign-product',
    productIds: [s.products.find((p) => p.sku === 'V-100').id],
  });
  const e = p.createExperiment(s, {
    planId: plan.id,
    revisionId: rev.id,
    baselineIds: ['base', 'foreign-product'],
    changeAt: '2026-01-02T00:00:00Z',
  });
  assert.equal(p.evaluateExperiment(s, e.id).status, '样本不足');
  assert.deepEqual(e.baselineIds, ['base']);
  s.runs.push({
    ...structuredClone(base),
    id: 'post',
    at: '2026-01-03T00:00:00Z',
    model: 'different',
  });
  assert.equal(p.evaluateExperiment(s, e.id).status, '不可比较');
  s.runs.at(-1).model = plan.config.model;
  base.providerModel = 'version-A';
  s.runs.at(-1).providerModel = 'version-B';
  assert.equal(p.evaluateExperiment(s, e.id).reason, '供应商返回的模型版本发生变化');
});
