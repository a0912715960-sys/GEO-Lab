# GEO SIGNAL v3 实际测试报告

生成时间 2026-10-16T15:25:57.239Z · Node v24.19.0 · 平台 win32。

## 执行结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 单元与本机 HTTP 接口 | 48/48 通过、0 失败 | unit-integration.log，tests/*.test.mjs |
| 实际本地 HTTP 浏览器操作 | 13 个检查通过 | browser-ui.json、screenshots/v3-*.jpg |
| 人工修改/逐段审批/导出 | 实际下载 JSON 与批准前预览逐字段一致 | reviewed-preview.json、approved-export.json |
| CSV/XLSX/DOCX/PDF 文件解析 | 实际上传二进制与本机 Python 提取通过 | api.test.mjs、data/*-fixture.* |
| 独立案例漏斗 | N100/B32/R18/C12，R/B 56.25%；引用不要求提及品牌 | platform.test.mjs、v3-overview.jpg |
| 官方 API 协议与错误分支 | 合成响应契约通过；重试、限额、失败和无搜索过滤通过 | monitor.test.mjs 中标注的 fixture/transport |
| Edge/Playwright 自动启动 | 本环境未通过，Windows 沙箱阻止浏览器进程正常启动 | browser-launch-blocked.log；脚本保留在 tests/browser.mjs |
| file:// 浏览器启动 | 内置浏览器策略阻止读取，未完成此轮浏览器验收 | 离线 bundle 的一致性由 package/verify 验证；不把静态校验当浏览器启动 |
| 外部供应商真实调用 | 0 次；待用户在本机配置 API | 无外部引用效果结论 |

浏览器采用 Codex 内置浏览器，对实际监听 127.0.0.1 的 Node 服务点击、填表、审批和下载。不是对 UI 截图或静态设计稿断言。该交互记录与独立 Playwright 脚本分开报告，不能称脚本已通过。

## 已覆盖的关键风险

SKU 事实与多 SKU 监测归属隔离；原文/单位/条件/定位保留；冲突不覆盖、相同内容去重、来源撤回排除新检索；提示词版本与计划快照独立；中性采样不注入企业 RAG 或我方品牌；有效 N 去重并排除失败、无搜索和空回答；品牌推荐需针对我方、否定及竞品推荐不计入；网址精确域名检查；重试分离且占预算；缺密钥不执行 API；进程中断不静默重复调用；人工审批锁、完整预览、快照哈希和导出同一性；复测拒绝案例基线并检查模型/问题/配置变化。

三语推荐规则有正反例回归测试，但尚无独立规模化准确率评测，不能把测试通过率当模型准确率。内容生成是规则模板；人工自由编辑的新声明依靠审核人核验。复测引擎的测试输入也是合成记录，不是实际增长实验。

## 浏览器操作检查

1. HTTP real empty state — passed
2. Synthetic funnel — passed
3. C citation independent of brand — passed
4. Raw record to grounded diagnosis and draft — passed
5. Manual accept/reject + approved export equals reviewed preview — passed
6. Generate and approve four locale-versioned prompts — passed
7. Create immutable plan and missing-key blocked execution — passed
8. Missing-key records excluded from effective denominator — passed
9. Actual CSV form import, SKU isolation, review and retrieval — passed
10. 390px responsive layout no global overflow — passed
11. Sources drawer sanitized and reachable on short desktop — passed
12. Country filter changes denominator and excludes US fixture — passed
13. Retest UI blocks synthetic baseline from real improvement — passed

## 初始失败与修正

首轮 39 项中 37 项通过，2 项 HTTP 持久化测试在沙箱临时目录重命名时遭 EPERM；转用工作空间内临时测试目录后通过，保留 initial-unit-failure.log。此后补充单位/来源、品牌提示、多 SKU、文档解析和重启等回归检查，最终结果以上表为准。

浏览器检查发现短屏下底部来源入口被挤出，已增加侧栏滚动与短屏样式，修正后实际打开来源抽屉核对。窄屏测试核对页面没有全局横向溢出。浏览器定位器在窄屏隐藏图标、选择框完整 label 匹配等场景出现过定位失败，按当前可见状态重新定位后完成；不计为产品测试通过率中的模型结果。

## 仍需在线验收

配置密钥后分别执行 Gemini 和 OpenAI 搜索请求，确认账户模型支持工具、原始格式与解析匹配、实际搜索发生、引用可访问、搜索建议展示满足供应商条款，并与账单对账。保留成功、失败、无搜索与限流样本。消费者端曝光、站点发布、云端连续调度、CRM/询盘归因另行授权验收。当前没有线上排名、询盘转化或因果增长结论。

复现命令、依赖和运行方式见 README 与 COMMANDS.md；发布包最终哈希以交付根目录 DELIVERY-SHA256.txt 为准，逐文件清单在 manifest.json。清单和 ZIP 由同一次打包生成后再验证。
