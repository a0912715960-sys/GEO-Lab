# GEO SIGNAL · 智能监测与优化平台

v3.0 本地 MVP，面向跨境企业的品牌运营、外贸营销和商品运营人员。以商品事实为基础，管理采购问题、采集官方搜索 API 样本、检查曝光证据、审批内容修改并开展复测。

## 启动

双击 `OFFLINE-DEMO.html` 可使用本地事实库、问题集、案例分析与内容审批。浏览器需要启用 JavaScript；内置预览可能限制 file 协议。

完整后端：Node.js 22.9 或以上，运行时无需 npm 依赖。双击 `start-demo.cmd`，或运行：

```powershell
node --env-file-if-exists=.env server.mjs
```

打开 http://127.0.0.1:4173 。服务仅监听本机。关闭进程后，定时监测停止；这不是云端常驻服务。

## 配置真实 API

1. 复制 `.env.example` 为 `.env`，在本机填写 Gemini 或 OpenAI 密钥及账户可用的模型 ID。不要分享 `.env`。
2. 重启后端，在“工作空间与 API”中填写实际品牌、别名、域名和竞品。域名为用户声明，尚未自动验证所有权。
3. 导入实际商品，审核事实，生成采购问题并逐条批准。
4. 创建计划，填写与账户匹配的模型 ID、市场、语言、每日调用上限和每次请求预算预留。
5. 点击“运行本轮”。查看原始 JSON、搜索标记、回答与引用；只有成功、非空且实际搜索的唯一回答计入 N。

已有案例计划冻结了案例品牌。更换企业后应新建计划，旧计划不随工作空间更改而变化。相同计划、相同问题、同一采样周期保持幂等；本轮被阻止后可克隆计划或等待下一周期。

未配置时保存 blocked 记录，0 次请求。调用失败保留错误，不回退为案例回答。适配器代码与合成响应契约已测试；交付时未使用真实密钥，尚未完成供应商在线调用验收。

## 文件导入

CSV/JSON 可直接导入。必填列 `sku,name,category`；其他字段生成待审事实。可选 `power_unit,power_conditions,source_locator` 等元数据列。已有商品的描述等实体元数据不静默覆盖；需要更新描述时导入新 SKU 或后续通过实体编辑功能处理。

XLSX/PDF/DOCX 需要 Python 与 `openpyxl/pdfplumber/python-docx`。在 `.env` 中配置 `GEO_PYTHON` 可执行路径。文件限制 5 MB、文档压缩展开 30 MB、PDF 100 页，解析过程最长 30 秒。XLSX 按表头映射商品行；PDF/DOCX 只提取原文与页码/段落/表格定位，用户人工映射参数，避免把整段宣传文案当作已核实事实。扫描 PDF 的 OCR、URL 自动抓取尚未实现。

## 数据与能力

内置 P-200/V-100、Northstar、RivalWorks 和 100 条回答都是明确标注的案例。PI5 的少量规格来自厂商公开页面。上传资料的 public/authorized 标签是用户声明，审核仍由用户负责。

监测数据分 real/synthetic，不能混算。案例仅验证计算与操作流程；不能证明 GEO 增长。API 搜索结果也不代表 ChatGPT/Gemini 消费者端排名。

当前检索是 SKU 范围内的精确字段与关键词排序；采购问题为可编辑类目模板；诊断为证据关联的规则假设；内容为事实约束模板与人工编辑。向量检索、LLM 问题挖掘及智能原因判断仍待接入。界面不把这些基线包装成已验证的模型能力。

## 验证与打包

```powershell
npm install
npm run format
npm run build
npm test
npm run test:e2e
npm run package
npm run verify
```

`tests/browser.mjs` 是可复现的 Edge/Playwright 脚本，本环境受沙箱启动限制未通过启动。已另外在内置浏览器对真实本地 HTTP 服务完成交互验收，见 `evidence/browser-ui.json`、截图、审批前后 JSON。详细边界和日志见测试报告。

状态保存在 `runtime/platform-v3.json`，离线文件使用独立浏览器存储；二者不会自动同步。并发写入使用工作空间版本锁和串行队列。不要把此单用户本地服务直接部署成多租户 SaaS。

文档：`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/RESEARCH.md`、`docs/DEMO-SCRIPT.md`、`evidence/TEST-REPORT.md`。发布包不包含运行数据、密钥、历史附件或 Git 历史包。
