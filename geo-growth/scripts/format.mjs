import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool } from './tools.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  prettier = tool('prettier');
const files = ['server.mjs', 'monitor.mjs', 'package.json'];
for (const directory of ['src', 'scripts', 'tests'])
  for (const name of fs.readdirSync(path.join(root, directory)))
    if (/\.(mjs|js|css|html|json)$/.test(name)) files.push(directory + '/' + name);
for (const name of files) {
  const file = path.join(root, name);
  fs.writeFileSync(
    file,
    await prettier.format(fs.readFileSync(file, 'utf8'), {
      filepath: file,
      printWidth: 100,
      singleQuote: true,
    }),
  );
}
console.log(`Formatted ${files.length} source files`);
