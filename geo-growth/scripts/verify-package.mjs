import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { root, output } from './build.mjs';
import { tool } from './tools.mjs';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function verifyPackage({ receipts = true } = {}) {
  const bytes = fs.readFileSync(path.join(output, 'GEO-Growth-Lab.zip'));
  const zip = await tool('jszip').loadAsync(bytes);
  const manifest = JSON.parse(await zip.file('geo-growth/evidence/manifest.json').async('string'));
  const entries = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  assert.equal(entries.length, manifest.files.length + 1);
  for (const file of manifest.files) {
    const entry = zip.file(file.path);
    assert.ok(entry, 'Missing ' + file.path);
    const data = await entry.async('nodebuffer');
    assert.equal(data.length, file.bytes, file.path);
    assert.equal(hash(data), file.sha256, file.path);
    const local = file.path.startsWith('geo-growth/')
      ? path.join(root, file.path.slice(11))
      : path.join(output, file.path);
    assert.equal(hash(fs.readFileSync(local)), file.sha256, 'Local/ZIP mismatch ' + file.path);
  }
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'evidence/manifest.json'), 'utf8')),
    manifest,
  );
  const bundle = await zip.file('geo-growth/dist/app.js').async('string');
  assert.equal(hash(bundle), manifest.bundleSha256);
  for (const name of ['geo-growth/OFFLINE-DEMO.html', 'GEO-Growth-Demo.html']) {
    const html = await zip.file(name).async('string');
    const embedded = html.match(/<script data-geo-bundle>([\s\S]*?)<\/script>/)?.[1];
    assert.equal(embedded, bundle, name);
  }
  assert.ok(
    !entries.some((name) => /(^|\/)\.git\//.test(name) || /\.bundle$|(^|\/)\.env$/.test(name)),
  );
  const result = {
    schemaVersion: 3,
    ok: true,
    zip: 'GEO-Growth-Lab.zip',
    sha256: hash(bytes),
    bytes: bytes.length,
    verifiedFiles: manifest.files.length,
    zipEntries: entries.length,
    bundleSha256: manifest.bundleSha256,
    sourceCommit: manifest.sourceCommit,
  };
  if (receipts) {
    const receipt = JSON.parse(fs.readFileSync(path.join(output, 'ZIP-VERIFICATION.json'), 'utf8'));
    assert.deepEqual(receipt, result);
    assert.equal(
      fs.readFileSync(path.join(output, 'DELIVERY-SHA256.txt'), 'utf8'),
      `${result.sha256}  ${result.zip}\nbytes: ${result.bytes}\nentries: ${result.zipEntries}\n`,
    );
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await verifyPackage(), null, 2));
