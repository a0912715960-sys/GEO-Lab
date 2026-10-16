# 实际执行与复现

工作目录为项目根 `geo-growth`。Node v24.19.0；Python 使用本机已安装的文档依赖。

```powershell
node scripts/format.mjs
node scripts/build.mjs
node --test tests/platform.test.mjs tests/monitor.test.mjs tests/api.test.mjs
node tests/browser.mjs
node scripts/report.mjs
node scripts/package.mjs
node scripts/verify-package.mjs
```

完整输出分别保存为 unit-integration.log、browser-launch-blocked.log。自动浏览器脚本在启动阶段受沙箱限制，未将其计为成功；随后通过内置浏览器连接实际本地 HTTP 服务执行操作，检查记录在 browser-ui.json、e2e.log 与 screenshots。

测试依赖先执行 npm install。文档解析测试需要本机 Python 和 openpyxl、python-docx、pdfplumber；重建演示文件还需 reportlab，运行 `python tests/make-fixtures.py`。可用 GEO_PYTHON 指定解释器。

执行报告生成前，需要实际浏览器验收记录与下载产物；脚本不会伪造这些证据。打包前提交源码和证据；打包后只生成 ZIP 和哈希收据，不再修改包内文件。verify 会逐文件检查本机文件、ZIP 清单、外层收据与共享 bundle 一致。

供应商协议测试使用明确标记的合成响应和注入传输；没有真实供应商请求、付费推理或引用提升验证。
