import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { approvedExample, ready, geminiFixture, response } from './helpers.mjs';
test('actual scheduler timer executes due active plan once with injected API transport', async (t) => {
  fs.mkdirSync('runtime', { recursive: true });
  const folder = fs.mkdtempSync(path.resolve('runtime', 'test-scheduler-')),
    stateFile = path.join(folder, 'state.json');
  const { s, plan } = ready();
  plan.status = 'active';
  let calls = 0;
  fs.writeFileSync(stateFile, JSON.stringify(s));
  const server = createApp({
    stateFile,
    env: { GEMINI_API_KEY: 'test-secret' },
    transport: async () => {
      calls++;
      return response(geminiFixture);
    },
    schedulerIntervalMs: 20,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  for (let i = 0; i < 30 && calls < 4; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 4);
  const fresh = await (await fetch(base + '/api/metrics')).json();
  assert.equal(fresh.N, 4);
});
for (const [filename, expected] of [
  ['catalog-fixture.xlsx', 'XLS-1'],
  ['manual-fixture.docx', 'DOC-1'],
  ['manual-fixture.pdf', 'PDF-1'],
])
  test('actual uploaded ' + filename + ' extraction', async (t) => {
    const { post } = await fixture(t);
    const res = await post('/api/extract', {
      name: filename,
      base64: fs.readFileSync(path.resolve('data', filename)).toString('base64'),
    });
    const result = await res.json();
    assert.equal(res.status, 200, JSON.stringify(result));
    assert.ok(JSON.stringify(result).includes(expected));
    assert.equal(result.fileChecksum.length, 64);
    if (filename.endsWith('.pdf')) assert.equal(result.pages[0].locator, 'page:1');
  });
async function fixture(t, state) {
  fs.mkdirSync('runtime', { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('runtime', 'test-api-')),
    stateFile = path.join(directory, 'state.json');
  if (state) fs.writeFileSync(stateFile, JSON.stringify(state));
  const server = createApp({
    stateFile,
    env: { ...process.env, GEMINI_API_KEY: '', OPENAI_API_KEY: '' },
    scheduler: false,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (url) => fetch(base + url);
  const post = (url, data, headers = {}) =>
    fetch(base + url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  return { server, stateFile, get, post, base };
}
test('HTTP state, transactional import, persistence and stale-write 409', async (t) => {
  const { get, post, stateFile } = await fixture(t);
  const initial = await (await get('/api/state')).json();
  const input = {
    stateRevision: initial.state.revision,
    name: 'Uploaded CSV',
    origin: 'authorized',
    csv: 'sku,name,category,power\nAPI-1,API Pump,pump,9 kW',
  };
  assert.equal((await post('/api/import', input)).status, 201);
  const fresh = await (await get('/api/state')).json();
  assert.ok(fresh.state.products.some((x) => x.sku === 'API-1'));
  assert.equal((await post('/api/import', input)).status, 409);
  assert.ok(JSON.parse(fs.readFileSync(stateFile)).products.some((x) => x.sku === 'API-1'));
  const before = fresh.state.sources.length;
  const invalid = await post('/api/import', {
    ...input,
    stateRevision: fresh.state.revision,
    rows: [{ sku: 'x' }],
    csv: null,
  });
  assert.equal(invalid.status, 400);
  assert.equal((await (await get('/api/state')).json()).state.sources.length, before);
});
test('HTTP cross-site writes, bad content type, unknown routes and runtime file access are rejected', async (t) => {
  const { get, post } = await fixture(t);
  assert.equal((await post('/api/example', {}, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await post('/api/example', {}, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await get('/api/not-found')).status, 404);
  assert.equal((await get('/runtime/platform-v3.json')).status, 404);
  assert.equal((await get('/deliverables/server.mjs')).status, 404);
});
test('HTTP export identity and immutable approval gate', async (t) => {
  const { s, r } = approvedExample();
  const { get, post } = await fixture(t, s);
  const exported = await (await get('/api/export?id=' + r.id)).json();
  assert.deepEqual(exported.artifact, r.approved.artifact);
  assert.equal(
    (
      await post('/api/approve-content', {
        id: r.id,
        expectedRevision: r.revision,
        stateRevision: s.revision,
        confirmClaims: true,
      })
    ).status,
    409,
  );
  assert.equal((await get('/api/export?id=not-existing')).status, 404);
});
test('backend health exposes flags, no keys, real blocked runs persist', async (t) => {
  const { s, plan } = await import('./helpers.mjs').then((m) => m.ready());
  const { get, post } = await fixture(t, s);
  const health = await (await get('/api/health')).json();
  assert.equal(health.providers[0].configured, false);
  const response = await post('/api/execute', { id: plan.id });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.every((r) => r.status === 'blocked'));
  const m = await (await get('/api/metrics')).json();
  assert.equal(m.N, 0);
  assert.equal(m.attempts, 0);
});
test('uploaded CSV uses actual Python extraction without network', async (t) => {
  const { post } = await fixture(t);
  const res = await post('/api/extract', {
    name: 'catalog.csv',
    base64: Buffer.from('sku,name,category,power\nF-1,File Pump,pump,6 kW').toString('base64'),
  });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const parsed = await res.json();
  assert.equal(parsed.rows[0].sku, 'F-1');
  assert.equal(parsed.fileChecksum.length, 64);
  assert.equal((await post('/api/extract', { name: 'catalog.exe', base64: 'WA==' })).status, 400);
});
test('restart marks in-flight records interrupted without silently retrying', async (t) => {
  const { s } = approvedExample();
  const run = s.runs[0];
  run.origin = 'real';
  run.status = 'running';
  run.attempts = [{ status: 'running', at: new Date().toISOString() }];
  const { get, stateFile } = await fixture(t, s);
  const fresh = await (await get('/api/state')).json();
  assert.equal(fresh.state.runs[0].status, 'failed');
  assert.equal(fresh.state.runs[0].attempts[0].status, 'interrupted');
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).runs[0].status, 'failed');
});
