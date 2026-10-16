import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, output, sourceHashes } from './build.mjs';
import { tool } from './tools.mjs';
import { hash, verifyPackage } from './verify-package.mjs';
const git = { cwd: root, encoding: 'utf8', windowsHide: true };
if (execFileSync('git', ['status', '--porcelain'], git).trim())
  throw new Error('Commit current source and evidence before packaging.');
const build = JSON.parse(fs.readFileSync(path.join(root, 'dist/build.json'), 'utf8'));
if (JSON.stringify(sourceHashes()) !== JSON.stringify(build.inputs))
  throw new Error('Source changed; rebuild first.');
const docList = [
  ['产品范围与 PRD 对照', 'docs/PRD.md'],
  ['架构与数据流', 'docs/ARCHITECTURE.md'],
  ['技术来源与数据分类', 'docs/RESEARCH.md'],
  ['实际测试报告', 'evidence/TEST-REPORT.md'],
  ['五分钟操作演示', 'docs/DEMO-SCRIPT.md'],
];
const marked = tool('marked').marked;
const img = (name) =>
  'data:image/jpeg;base64,' +
  fs.readFileSync(path.join(root, 'evidence/screenshots', name)).toString('base64');
const guide = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GEO SIGNAL · 产品与技术指南</title><style>body{margin:0;background:#f4f6fb;color:#263853;font:14px/1.9 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;padding:30px}header{background:#16233f;color:white;padding:38px;border-radius:14px}header p{color:#aabbd8}h1{font-size:30px;line-height:1.5;margin:0}a{color:#5167da}header a{color:#b9caff;margin-right:20px}nav{display:flex;gap:15px;flex-wrap:wrap;padding:22px 0;font-size:12px}section{background:white;border:1px solid #e0e6f0;border-radius:10px;padding:28px;margin:24px 0;overflow:auto}h2{font-size:21px;color:#344c7b}h3{font-size:16px}img{width:100%;border-radius:10px;border:1px solid #e0e6f0}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e0e6f0;padding:10px;text-align:left;vertical-align:top}th{background:#f0f3fa}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5fb;padding:20px;border-radius:7px;font-size:11px}p,li{color:#708099}.flow{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;margin:20px 0}.flow span{background:#eef1ff;padding:12px;border-radius:6px}.caption{font-size:11px;color:#8b98ab}@media(max-width:600px){main{padding:15px}header,section{padding:20px}h1{font-size:24px}table{display:block;overflow:auto}}</style></head><body><main><header><div>GEO SIGNAL / V3.0</div><h1>商品事实、AI 曝光与内容修改<br>连成可检查的运营闭环</h1><p>单用户本地 MVP · 官方 API 接入准备 · 严格区分公开资料、授权资料、案例与真实监测</p><a href="GEO-Growth-Demo.html">打开离线工作台 →</a><a href="GEO-Growth-Lab.zip">下载源码与验证证据 →</a></header><nav>${docList.map(([title], i) => `<a href="#doc${i}">${title}</a>`).join('')}</nav><div class="flow">${['商品原文 → 事实审核', '批准采购问题 → 冻结计划', '官方搜索 API → 原始证据', '诊断假设 → 片段修改', '批准快照 → 导出 → 复测'].map((x) => `<span>${x}</span>`).join('')}</div><img src="${img('v3-overview.jpg')}" alt="实际浏览器页面"><p class="caption">界面截图来自本地 HTTP 服务。案例数值只验证计算与操作；API 在线效果待本机配置后验证。</p>${docList.map(([title, name], i) => `<section id="doc${i}"><h2>${title}</h2>${marked.parse(fs.readFileSync(path.join(root, name), 'utf8'))}</section>`).join('')}<section><h2>完整内容审批</h2><img src="${img('v3-content-approved.jpg')}" alt="实际批准界面"></section></main></body></html>`;
fs.writeFileSync(path.join(output, 'GEO-Platform-Guide.html'), guide);
const excluded = new Set(['.git', '.openai', 'node_modules', 'runtime']);
const files = [];
function walk(directory, relative = '') {
  for (const e of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relative ? relative + '/' + e.name : e.name;
    if (
      excluded.has(e.name) ||
      (/^\.env(?:\.|$)/.test(e.name) && e.name !== '.env.example') ||
      rel === 'evidence/manifest.json' ||
      rel === 'dist/downloads'
    )
      continue;
    if (e.isDirectory()) walk(path.join(directory, e.name), rel);
    else if (!/\.(zip|bundle)$/.test(rel))
      files.push({ path: 'geo-growth/' + rel, local: path.join(directory, e.name) });
  }
}
walk(root);
for (const name of ['GEO-Growth-Demo.html', 'GEO-Platform-Guide.html'])
  files.push({ path: name, local: path.join(output, name) });
const manifest = {
  schemaVersion: 3,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], git).trim(),
  bundleSha256: build.bundleSha256,
  excluded: [...excluded, '.env', '.env.local', 'Git history bundles', 'historical attachments'],
  files: files.map((file) => {
    const bytes = fs.readFileSync(file.local);
    return { path: file.path, bytes: bytes.length, sha256: hash(bytes) };
  }),
};
fs.writeFileSync(path.join(root, 'evidence/manifest.json'), JSON.stringify(manifest, null, 2));
const zip = new (tool('jszip'))();
for (const file of files) zip.file(file.path, fs.readFileSync(file.local));
zip.file('geo-growth/evidence/manifest.json', JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(output, 'GEO-Growth-Lab.zip'),
  await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 7 },
  }),
);
const result = await verifyPackage({ receipts: false });
fs.writeFileSync(path.join(output, 'ZIP-VERIFICATION.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(
  path.join(output, 'DELIVERY-SHA256.txt'),
  `${result.sha256}  ${result.zip}\nbytes: ${result.bytes}\nentries: ${result.zipEntries}\n`,
);
console.log(JSON.stringify(await verifyPackage(), null, 2));
