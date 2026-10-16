import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  initialState,
  mutate,
  check,
  metrics,
  retrieve,
  exportRevision,
  evaluateExperiment,
} from './src/platform.mjs';
import { capabilities, executePlan } from './monitor.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp({
  stateFile = path.join(root, 'runtime/platform-v3.json'),
  env = process.env,
  transport = fetch,
  scheduler = true,
  schedulerIntervalMs = 15000,
} = {}) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  let state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    : initialState();
  check(state.schemaVersion === 3, '状态版本不兼容');
  let recovered = false;
  for (const r of state.runs)
    if (['running', 'queued'].includes(r.status)) {
      recovered = true;
      r.status = 'failed';
      r.error = '本地服务中断；该次调用结果未知，不自动重复扣费';
      for (const a of r.attempts) if (a.status === 'running') a.status = 'interrupted';
    }
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  };
  const save = (next) => {
    const temp = stateFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next, null, 2));
    fs.renameSync(temp, stateFile);
    state = next;
  };
  const execute = (id) => executePlan(state, id, { env, transport, checkpoint: save });
  if (recovered) save(state);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const json = (value, status = 200) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    try {
      check(
        [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`].includes(
          req.headers.host,
        ),
        '仅允许本机访问',
        403,
      );
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET') {
          if (url.pathname === '/api/health')
            return json({
              ok: true,
              version: '3.0.0',
              mode: 'local-backend',
              providers: capabilities(env),
              scheduler,
            });
          if (url.pathname === '/api/state') return json({ state, providers: capabilities(env) });
          if (url.pathname === '/api/metrics')
            return json(metrics(state, Object.fromEntries(url.searchParams)));
          if (url.pathname === '/api/export')
            return json(exportRevision(state, url.searchParams.get('id')));
          if (url.pathname === '/api/retrieve')
            return json(
              retrieve(state, url.searchParams.get('productId'), url.searchParams.get('q')),
            );
          if (url.pathname === '/api/experiment')
            return json(evaluateExperiment(state, url.searchParams.get('id')));
          check(false, '接口不存在', 404);
        }
        check(req.method === 'POST', '方法不支持', 405);
        check(
          !req.headers.origin || req.headers.origin === `http://${req.headers.host}`,
          '拒绝跨站写入',
          403,
        );
        check(
          (req.headers['content-type'] || '').startsWith('application/json'),
          '需要 JSON 请求',
          415,
        );
        let body = '';
        for await (const c of req) {
          body += c;
          check(Buffer.byteLength(body) <= 8 * 1024 * 1024, '文件或请求超过 8 MB', 413);
        }
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          check(false, 'JSON 无效');
        }
        check(input && typeof input === 'object' && !Array.isArray(input), '请求必须为对象');
        if (url.pathname === '/api/extract') {
          check(
            ['.csv', '.xlsx', '.docx', '.pdf'].includes(
              path.extname(input.name || '').toLowerCase(),
            ),
            '支持 CSV/XLSX/DOCX/PDF',
          );
          check(
            typeof input.base64 === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(input.base64),
            '文件编码无效',
          );
          return json(await extract(input, env));
        }
        if (url.pathname === '/api/execute') return json(await enqueue(() => execute(input.id)));
        const action = url.pathname.slice('/api/'.length);
        const result = await enqueue(() => {
          check(input.stateRevision === state.revision, '数据已变化，请刷新重试', 409);
          const next = structuredClone(state);
          const result = mutate(next, action, input);
          save(next);
          return result;
        });
        return json(result, 201);
      }
      check(req.method === 'GET' || req.method === 'HEAD', '方法不支持', 405);
      const decoded = decodeURIComponent(url.pathname);
      let file;
      if (decoded.startsWith('/deliverables/')) {
        const name = decoded.slice(14);
        check(
          [
            'README.md',
            'docs/PRD.md',
            'docs/ARCHITECTURE.md',
            'docs/RESEARCH.md',
            'docs/DEMO-SCRIPT.md',
            'evidence/TEST-REPORT.md',
          ].includes(name),
          '文件不存在',
          404,
        );
        file = path.join(root, name);
      } else {
        file = path.resolve(root, 'dist', '.' + (decoded === '/' ? '/index.html' : decoded));
        check(file.startsWith(path.resolve(root, 'dist') + path.sep), '路径无效', 403);
      }
      check(fs.existsSync(file) && fs.statSync(file).isFile(), '文件不存在', 404);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.md': 'text/markdown; charset=utf-8',
        '.zip': 'application/zip',
      };
      res.writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    } catch (error) {
      if (!res.headersSent) json({ error: error.message }, error.status || 500);
      else res.end();
    }
  });
  let ticking = false;
  const timer = scheduler
    ? setInterval(async () => {
        if (ticking) return;
        ticking = true;
        try {
          await enqueue(async () => {
            for (const p of state.plans.filter(
              (p) => p.status === 'active' && Date.parse(p.nextDueAt) <= Date.now(),
            ))
              await execute(p.id);
          });
        } catch (error) {
          console.error('Scheduler:', error.message);
        } finally {
          ticking = false;
        }
      }, schedulerIntervalMs)
    : null;
  timer?.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}
async function extract(input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.GEO_PYTHON || 'python', [path.join(root, 'scripts/extract.py')], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => child.kill(), 30000);
    child.stdout.on('data', (c) => {
      output += c;
      if (output.length > 2e6) child.kill();
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('未找到 Python；请配置 GEO_PYTHON 和文档解析依赖，或改用 CSV/JSON'));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code) return reject(new Error('文件解析失败；检查文件格式及 Python 文档依赖'));
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error('解析结果无效'));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  createApp().listen(Number(process.env.PORT || 4173), '127.0.0.1', () =>
    console.log('GEO Platform: http://127.0.0.1:' + (process.env.PORT || 4173)),
  );
