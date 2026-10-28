# 贡献指南 / Contributing

感谢你想让 LinguaNex 变得更好。这份文件说明怎么提 Bug、怎么提需求、怎么发 PR。

> 简体中文在前面，英文在后面。Both languages are accepted for issues and PRs.

## 提 Bug

请开一个 Issue，用「Bug 反馈」模板，并尽量带上：

| 项 | 说明 |
| --- | --- |
| Obsidian 版本 | 设置 → 关于里可看到 |
| 平台 | Windows / macOS / Linux / iOS / Android |
| 插件版本 | 设置 → 第三方插件 → LinguaNex 显示的版本号 |
| 词典格式 | 涉及查词问题时，说明用的是哪个 `.mdx`（哪家的词典） |
| 复现步骤 | 从"打开 Obsidian"开始的每一步 |
| 期望 / 实际 | 你以为会发生什么，实际发生了什么 |
| 控制台日志 | 桌面端 `Ctrl/Cmd + Shift + I` 打开开发者工具 → Console，把报错贴出来 |

**不要**在 Issue 里贴你的 API Key、欧路 Token 或任何密钥。

## 提需求

用「功能建议」模板。说明你要解决什么问题，而不是只说要什么功能 —— 知道"为什么"才好判断怎么做。

## 发 Pull Request

1. Fork 仓库，从 `main` 拉分支（建议 `feat/xxx` 或 `fix/xxx`）
2. 装依赖并跑构建：

```bash
npm install
npm run dev     # 监听构建
npm run build   # 类型检查 + 生产打包，提交前必须通过
```

3. 提交信息用 Conventional Commits：

```
feat: 新增 xxx
fix: 修复 xxx
refactor: 重构 xxx
docs: 文档 xxx
chore: 构建/依赖 xxx
```

4. 改动涉及用户可见行为时，同步更新：
   - `README.md` 与 `README.zh-CN.md`（两处都要改）
   - `CHANGELOG.md`（在对应版本下补条目）
5. 版本号：功能新增改 minor，纯修复改 patch，同时更新 `manifest.json`、`package.json`、`versions.json`。**版本号由维护者在发布时处理，PR 里一般不用改。**

## 代码约定

- TypeScript 严格模式，提交前 `npm run build` 必须零报错
- 沿用现有代码风格：Tab 缩进、语义化类名前缀 `lx-`
- 新增 UI 样式写在 `styles.css`，跟随 Obsidian 的 CSS 变量（`--background-primary`、`--text-normal` 等），不要写死颜色，否则深浅色主题会错
- **安全相关**：任何进入 DOM 的外部内容（词典 HTML、接口返回）必须先转义/消毒；密钥不得硬编码，也不得写进日志

## 发布流程

维护者打标签即触发 `.github/workflows/release.yml`：自动 `npm run build` 并把 `main.js`、`manifest.json`、`styles.css` 发布到 GitHub Release。

## 许可证

提交即表示你同意你的贡献以 [MIT](LICENSE) 许可发布。
