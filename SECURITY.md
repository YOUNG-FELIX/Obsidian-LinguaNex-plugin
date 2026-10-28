# 安全策略 / Security Policy

## 支持版本

只维护最新发布版本。请升级到最新 Release 后再确认问题是否仍存在。

| 版本 | 是否维护 |
| --- | --- |
| 0.11.x | ✅ |
| ≤ 0.10.x | ❌ |

## 报告漏洞

**请不要开公开 Issue。** 发邮件或在 GitHub 上开一个私有安全公告（Private vulnerability reporting）：

> https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/security/advisories/new

请包含：影响版本、复现步骤、影响范围（是否能读取 vault 数据 / 外传密钥）。

我们会在 7 天内确认；确认后会先修复并发布补丁版本，再公开公告并致谢（除非你要求匿名）。

## 已知的安全边界（设计限制，非漏洞）

LinguaNex 是 Obsidian 插件，受平台能力约束，以下几点属于**已知限制**：

1. **密钥无法加密存储。** Obsidian 不提供系统钥匙串 API，插件只能写 vault 内文件，因此 AI API Key 与欧路 Token 默认以明文存在
   `<vault>/.obsidian/plugins/lingua-nex/data.json`。该文件**可能随 Obsidian Sync / Git 一起同步**。
   缓解方式：设置 → 隐私与安全 → 关闭「持久化保存密钥」，密钥将只存于内存、不写盘。
2. **不校验词典文件来源。** `.mdx` 由用户自行获取。插件会对注入的释义 HTML 做消毒（剥离脚本、事件属性、伪协议 URL），
   但仍建议只使用来源可信的词典。
3. **在线查词会向第三方接口发送查询词。** 有道 / Free Dictionary / 翻译引擎 / 你配置的 AI 服务都会收到你查的词。
   介意的话请只使用离线词典。

## 已实施的防护

| 层面 | 措施 |
| --- | --- |
| 注入 | 词典与在线 HTML 注入 `srcdoc` iframe 前统一消毒（`src/core/sanitize.ts`），剥离 `<script>`、内联 `on*=` 事件、`javascript:` / `data:text/html` 伪协议、`iframe/object/embed/form/base` |
| 传输 | API Base URL 为非本地/内网的明文 `http` 时拒绝请求，避免密钥在明文链路裸奔 |
| 持久化 | 「持久化保存密钥」开关，关闭后写盘副本中清空 AI API Key 与欧路 Token |
| 遥测 | 无任何遥测、无埋点；除你自己配置的词典与 AI 服务外不发起任何外部请求 |
