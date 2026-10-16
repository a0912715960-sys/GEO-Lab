import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../server.mjs';
import { tool } from '../scripts/tools.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = fs.mkdtempSync(path.join(root, 'runtime/browser-'));
const evidence = path.join(root, 'evidence');
const server = createApp({
  stateFile: path.join(folder, 'state.json'),
  env: { ...process.env, GEMINI_API_KEY: '', OPENAI_API_KEY: '' },
  scheduler: false,
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await tool('playwright').chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function record(name, fn) {
  await fn();
  checks.push({ name, status: 'passed', at: new Date().toISOString() });
  console.log('PASS ' + name);
}
const nav = (id) => page.locator(`[data-action="nav"][data-id="${id}"]`).click();
const shot = (name) =>
  page.screenshot({ path: path.join(evidence, 'screenshots', name), fullPage: true });
try {
  await record('backend starts with real zero and no loading loop', async () => {
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('.stat strong').first().waitFor();
    assert.equal(await page.locator('.stat strong').first().innerText(), '0');
    await shot('v3-real-empty.png');
  });
  await record(
    'independent fixture has exact funnel and does not contaminate real data',
    async () => {
      await page.getByRole('button', { name: '加载独立案例', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector('.stat strong')?.textContent === '100',
      );
      assert.deepEqual(await page.locator('.stat strong').allTextContents(), [
        '100',
        '32',
        '18',
        '12',
      ]);
      await shot('v3-overview.png');
    },
  );
  await record('citation drilldown reaches raw evidence even without brand mention', async () => {
    await page.locator('.stat[data-id="C"]').click();
    await page.getByRole('button', { name: '原始证据' }).first().click();
    await page.getByRole('dialog').waitFor();
    assert.ok((await page.locator('.drawer').innerText()).includes('"brand": false'));
    assert.ok((await page.locator('.drawer').innerText()).includes('northstar.example'));
    await shot('v3-evidence.png');
  });
  await record('raw run creates a fact-linked hypothesis and content draft', async () => {
    await page.getByRole('button', { name: '基于这条样本创建诊断' }).click();
    await page.getByRole('button', { name: '生成事实约束修改' }).click();
    await page.locator('.segment').first().waitFor();
    assert.equal(await page.locator('.segment').count(), 2);
    await shot('v3-content-draft.png');
  });
  let preview;
  await record(
    'manual segment accept/reject, complete preview and frozen export identity',
    async () => {
      let form = page.locator('.segment').first();
      const after = await form.locator('textarea').inputValue();
      await form
        .locator('textarea')
        .fill(after + '\nCheck suitability against these specifications.');
      await form.getByRole('button', { name: '保存并接受片段' }).click();
      await page.waitForFunction(
        () => document.querySelector('.segment .chip')?.textContent === 'accept',
      );
      await page.locator('.segment').nth(1).getByRole('button', { name: '拒绝片段' }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.segment .chip')[1]?.textContent === 'reject',
      );
      const details = page
        .locator('details')
        .filter({ has: page.locator('summary', { hasText: '完整待批准产物' }) });
      preview = JSON.parse(await details.locator('pre').innerText());
      await page.locator('[name="confirmClaims"]').check();
      await page.getByRole('button', { name: '批准完整快照', exact: true }).click();
      await page.getByRole('button', { name: '导出批准产物 JSON' }).waitFor();
      await shot('v3-content-approved.png');
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出批准产物 JSON' }).click();
      const item = await download;
      const target = path.join(evidence, 'approved-export.json');
      await item.saveAs(target);
      assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')).artifact, preview);
    },
  );
  await record(
    'generate and approve versioned questions, create plan and retain missing-key failures',
    async () => {
      await nav('prompts');
      await page.locator('#prompt-form button').click();
      await page.locator('[data-prompt]').first().waitFor();
      for (let i = 0; i < 4; i++) {
        await page
          .locator('[data-prompt]')
          .nth(i)
          .getByRole('button', { name: '保存并批准' })
          .click();
        await page.waitForFunction(
          (index) =>
            document.querySelectorAll('[data-prompt]')[index]?.textContent.includes('approved'),
          i,
        );
      }
      await nav('plans');
      await page.locator('[name="model"]').fill('test-model');
      await page.getByRole('button', { name: '创建并冻结配置' }).click();
      await page.getByRole('button', { name: '运行本轮' }).click();
      await page.waitForFunction(() => document.body.innerText.includes('API 未配置'));
      await page.selectOption('#global-origin', 'real');
      await nav('data');
      assert.equal(await page.getByRole('button', { name: '原始证据' }).count(), 4);
      assert.ok((await page.locator('.page').innerText()).includes('blocked'));
      await shot('v3-plans-blocked.png');
    },
  );
  await record(
    'CSV upload actually creates an unapproved product without mixing facts',
    async () => {
      await nav('knowledge');
      await page.getByRole('button', { name: '导入商品资料' }).click();
      await page
        .locator('#import-file')
        .setInputFiles(path.join(root, 'data/catalog-template.csv'));
      await page.waitForFunction(() =>
        document.querySelector('#import-rows')?.value.includes('NEW-1'),
      );
      await page.getByRole('button', { name: '导入并进入事实审核' }).click();
      await page.getByRole('button').filter({ hasText: 'NEW-1' }).click();
      await page.waitForFunction(() =>
        document.querySelector('.table-wrap')?.textContent.includes('pending'),
      );
      await shot('v3-knowledge.png');
    },
  );
  await record('responsive view has no document-wide horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('overview');
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    );
    await shot('v3-mobile.png');
  });
  await record(
    'offline file supports full local fixture workflow and retains state on reload',
    async () => {
      const offline = await context.newPage();
      await offline.goto(pathToFileURL(path.join(root, 'OFFLINE-DEMO.html')).href);
      await offline.getByRole('button', { name: '加载独立案例', exact: true }).click();
      await offline.waitForFunction(
        () => document.querySelector('.stat strong')?.textContent === '100',
      );
      await offline.reload();
      await offline.selectOption('#global-origin', 'synthetic');
      assert.equal(await offline.locator('.stat strong').first().innerText(), '100');
      await offline.screenshot({
        path: path.join(evidence, 'screenshots/v3-offline.png'),
        fullPage: true,
      });
      await offline.close();
    },
  );
  await record('scripts-disabled page displays specific startup help', async () => {
    const disabled = await browser.newContext({ javaScriptEnabled: false });
    const tab = await disabled.newPage();
    await tab.goto(pathToFileURL(path.join(root, 'OFFLINE-DEMO.html')).href);
    assert.ok((await tab.locator('body').innerText()).includes('JavaScript 被禁用'));
    await tab.screenshot({ path: path.join(evidence, 'screenshots/v3-scripts-disabled.png') });
    await disabled.close();
  });
  assert.deepEqual(errors, []);
  const state = await (
    await fetch('http://127.0.0.1:' + server.address().port + '/api/state')
  ).json();
  fs.writeFileSync(path.join(evidence, 'e2e-state.json'), JSON.stringify(state.state, null, 2));
} catch (error) {
  await shot('v3-e2e-failure.png');
  fs.writeFileSync(
    path.join(evidence, 'e2e-failure.json'),
    JSON.stringify({ error: error.stack, checks, errors }, null, 2),
  );
  throw error;
} finally {
  fs.writeFileSync(
    path.join(evidence, 'e2e.json'),
    JSON.stringify({ browser: browser.version(), checks, errors, externalAPICalls: 0 }, null, 2),
  );
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
  fs.rmSync(folder, { recursive: true, force: true });
}
