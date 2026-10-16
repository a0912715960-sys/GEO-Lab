# 技术来源核实与数据说明

核实日期：2026-10-16。只列与当前产品实现相关的官方技术文档和公开商品规格。

| 来源 | 可确认内容 | 对产品的约束 |
| --- | --- | --- |
| [Gemini Google Search](https://ai.google.dev/gemini-api/docs/google-search) | 当前 REST 示例使用 `/v1beta/interactions` 与 google_search；steps 保存 search call/result，文本 annotations 保存 url_citation | 不能因请求启用工具就认定发生搜索；解析实际搜索步骤和引用。API 与消费者端区分 |
| [OpenAI Web search](https://developers.openai.com/api/docs/guides/tools-web-search) | Responses API 的 web_search 工具、搜索调用和文本引用 | 仅完成的搜索调用计入搜索样本；保存原始注释和响应 |
| [OpenAI Crawlers](https://developers.openai.com/api/docs/bots) | 搜索、训练和用户触发抓取的代理不同 | 允许抓取不等于收录、排序或引用保证 |
| [Google AI features and website](https://developers.google.com/search/docs/appearance/ai-features) | Google Search AI 功能中的网站实践 | Google Search 与 Gemini API 的指标不可混为一谈；不虚构 GEO 专属排名开关 |
| [Raspberry Pi 5 官方规格](https://www.raspberrypi.com/products/raspberry-pi-5/) | BCM2712 2.4GHz 四核 Cortex-A76、5V/5A 供电等少量公开事实 | 不据此推断供应商报价、MOQ、交期或认证 |

Gemini 文档示例包含搜索建议展示要求。当前原始响应保留 search_suggestions，并在证据视图提供原始 JSON 与引用链接；尚未完成面向公网的完整品牌/建议展示合规验收，正式发布前应按当前条款进一步校验与安全呈现。

Perplexity 的旧 Sonar 文档已出现 Agent API 迁移信息，当前版本没有实现其供应商适配。没有把简单搜索接口冒充生成式推荐接口。未采用未核实的 Bing 特定功能链接。

## 数据分类

public：厂商页面上的少量公开规格。authorized：用户声明有权使用的上传资料，仍需人工审核。synthetic：虚构工业商品、品牌与回答，只用于案例演示和可重复测试。real：后端实际执行计划产生的记录，可能 blocked/failed/no-search；不等于有效回答，只有满足 N 口径才进统计。

100 条案例回答与单元测试用的官方协议响应均是合成夹具，分别验证漏斗逻辑和适配协议，不证明外部引用表现、模型质量或任何商业转化。

供应商在线调用需用户在本机配置可用密钥、模型、额度与联网搜索工具权限，并积累原始证据。后续验证至少覆盖两种通道的成功、有搜索/无搜索、限流、授权失败和账单对照。消费者端表现、站点上线与询盘归因需要另外的账户、站点和数据授权。
