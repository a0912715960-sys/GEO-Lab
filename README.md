# GEO SIGNAL · 智能监测与优化平台

商品级 GEO 本地 MVP：可信事实 → 采购问题集 → 官方搜索 API 采样 → 原始证据 → 诊断 → 内容审批 → 复测。

- [产品与技术指南](GEO-Platform-Guide.html)
- [下载完整可运行交付包](GEO-Growth-Lab.zip)
- [源码与运行说明](geo-growth/README.md)
- [PRD 与实现范围](geo-growth/docs/PRD.md)
- [实际测试报告](geo-growth/evidence/TEST-REPORT.md)

## 本机启动

克隆或下载仓库后，双击 geo-growth/start-demo.cmd；需要 Node.js 22.9 或以上。也可在 geo-growth 目录运行 node --env-file-if-exists=.env server.mjs，然后打开 http://127.0.0.1:4173 。离线页面为 GEO-Growth-Demo.html。GitHub 文件预览不会执行该页面脚本，请下载后打开。

API 密钥只在本机 geo-growth/.env 中配置，参考 .env.example。不要提交密钥。

48 项单元/接口测试通过，13 项实际本地 HTTP 浏览器操作检查通过。API 协议测试使用合成响应；真实供应商联网调用待用户配置后验证。案例不代表真实 GEO 提升。Playwright 在原测试环境受沙箱限制，未标记为通过。

此仓库导入清理后的 v3 交付快照，不包含旧附件、运行状态、密钥或旧 Git 历史。完整生产功能与未完成项见 PRD 对照。
