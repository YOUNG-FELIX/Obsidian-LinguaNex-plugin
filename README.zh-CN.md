# LinguaNex

[English](README.md) · **简体中文**

[![Release](https://img.shields.io/github/v/release/YOUNG-FELIX/Obsidian-LinguaNex-plugin?label=release&sort=semver)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases)
[![Manifest version](https://img.shields.io/github/manifest-json/v/YOUNG-FELIX/Obsidian-LinguaNex-plugin?filename=manifest.json&label=manifest)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/blob/main/manifest.json)
[![Downloads](https://img.shields.io/github/downloads/YOUNG-FELIX/Obsidian-LinguaNex-plugin/total?label=downloads)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A5%201.4.0-483699?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Platform](https://img.shields.io/badge/platform-desktop%20%7C%20mobile-blue)](#兼容性)
[![License](https://img.shields.io/github/license/YOUNG-FELIX/Obsidian-LinguaNex-plugin?label=license)](LICENSE)
[![Build](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/actions/workflows/release.yml)
[![Last commit](https://img.shields.io/github/last-commit/YOUNG-FELIX/Obsidian-LinguaNex-plugin)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/commits/main)
[![Stars](https://img.shields.io/github/stars/YOUNG-FELIX/Obsidian-LinguaNex-plugin?style=social)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/stargazers)

面向 [Obsidian](https://obsidian.md) 的离线词典查词、生词收集与间隔复习插件，桌面端与移动端通用。

LinguaNex 直接读取你自己的 `.mdx` / `.mdd` 文件（MDict / GoldenDict 格式），查词完全离线。可在此基础上叠加在线词典、整句翻译与可选的 AI 释义。

---

## 功能

- **离线 MDX/MDD 查词** —— 解析本地 `.mdx`（以及可选的 `.mdd` 音频/图片资源），无需联网。
- **抽屉查词面板** —— 底部抽屉，多词典 tab、键盘切换 tab、Esc 关闭。
- **悬浮查词窗** —— 在选中词旁边弹出简洁释义。
- **生词本** —— 支持多本生词本；词条只存单词与复习状态，释义在复习时实时查词典，体积小。
- **两段式间隔复习** —— 第一次点评级展开释义，看释义后第二次点评级写入数据并进入下一词；调度基于 ease factor、连对次数与各熟练度区间。
- **学习热力图** —— 按月展示每日复习量（同词同日最多计 3 次），点击日期查看当日详情：复习词数、去重词数、忘记 / 模糊 / 认识分布、平均熟练度、正确率与词条列表。
- **发音** —— 优先本地 `.mdd` 音频，其次有道 / Free Dictionary 在线音频，最后系统 TTS。新增发音命令（默认 `Mod+Shift+P`），朗读面板当前词或选中文字。
- **在线源** —— 有道、Free Dictionary、整句翻译（MyMemory / 百度翻译），均可单独开关。
- **AI 释义** —— 兼容 OpenAI 协议的多家服务：OpenAI、DeepSeek、Moonshot (Kimi)、智谱 GLM、通义千问、Groq、Ollama（本地）。
- **PDF 选区查词** —— 支持在 PDF 内选中单词查词。
- **欧路词典同步** —— 手动推送生词到欧路。
- **隐私优先** —— 无任何遥测；设置与 API Key 仅保存在本地 vault 中。

## 安装

### 社区插件市场

LinguaNex 正在提交 Obsidian 社区插件市场。上架后可在 **设置 → 第三方插件 → 浏览** 中搜索 “LinguaNex” 安装并启用。

### 手动安装

1. 从 [Releases](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases) 下载 `main.js`、`manifest.json`、`styles.css`（或整包 `lingua-nex-<version>.zip`）。
2. 放到 `<库>/.obsidian/plugins/lingua-nex/` 目录。
3. 重启 Obsidian，在 **设置 → 第三方插件** 中启用 **LinguaNex**。

### BRAT（尝鲜版）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 执行 **BRAT: Add a beta plugin for testing**，输入 `YOUNG-FELIX/Obsidian-LinguaNex-plugin`。
3. 在 **设置 → 第三方插件** 中启用 **LinguaNex**。

## 快速上手

1. 把词典放到 vault 内任意文件夹，然后在 **设置 → LinguaNex → 添加词典目录** 中搜索并添加该文件夹。搜索走 Obsidian 内存文件树，即时返回。
2. 在 **已发现词典** 中启用需要的词典，并调整顺序决定查词优先级。
3. 在笔记或 PDF 中选中单词，执行 **打开抽屉查词** 或 **打开悬浮窗查词**。

> 插件不会在启动时自动扫描任何目录，只有你在设置中显式添加的文件夹才会被扫描。

## 命令

| 命令 | ID | 说明 |
| --- | --- | --- |
| 打开抽屉查词 | `lookup-word` | 打开底部抽屉查词面板。 |
| 打开悬浮窗查词 | `lookup-hover` | 在选区旁弹悬浮窗；无选中时打开面板。 |
| 关闭查词面板 | `close-panel` | 关闭当前查词面板。 |
| 打开词典管理 | `open-manager` | 管理本地 / 在线词典与排序。 |
| 打开生词复习 | `open-review` | 打开间隔复习界面。 |
| 收藏/取消收藏（当前词） | `fav-toggle` | 切换面板当前词（或选中词）的收藏状态。 |
| 发音（当前词） | `pronounce-current` | 朗读面板当前词（或选中文字），默认热键 `Mod+Shift+P`。 |

所有命令均可在 **设置 → 快捷键** 中改键。

## 数据与同步

- 生词本路径：`<库根>/linguanex/vocab/<生词本名>.json`（相对库根，不含库名，任何库通用）。
- 该目录仅在插件**启用时创建一次**；若之后被删除，下次添加生词时会自动补建。
- 复习历史写在词条的 `hist` 字段中，格式 `[日期, 评级, 当次熟练度]`，不再生成独立日志文件。
- 数据位于 vault 内，可随 Obsidian Sync / Git 正常同步；备份该 json 即可保留全部复习历史。

## 设置项概览

| 分区 | 作用 |
| --- | --- |
| LinguaNex 词典 | 词典目录、已发现词典、启用/停用与优先级。 |
| 查词 | 抽屉 / 悬浮窗模式、选中工具条、选中自动查词。 |
| 句子翻译引擎 | 翻译引擎与相关配置。 |
| 发音 | 本地 `.mdd` 音频、有道、Free Dictionary、TTS、英/美音变体。 |
| PDF 阅读查词 | PDF 选区查词开关与右键菜单。 |
| AI 释义 | Provider、Base URL、模型、API Key、Prompt、占比。 |
| 生词本 | 默认生词本、复习算法参数、每日新词上限。 |
| 欧路词典同步 | Token、语言、分类、同步模式。 |

## 开发

TypeScript + `tsc`（类型检查）+ `esbuild`（打包）。

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd Obsidian-LinguaNex-plugin
npm install
npm run dev     # 监听构建
npm run build   # 类型检查 + 生产打包
```

`npm run build` 产出 `main.js`、`manifest.json`、`styles.css`。

## 兼容性

- Obsidian `>= 1.4.0`，桌面端与移动端均可用。
- 词典需为合法的 MDict / GoldenDict `.mdx` 文件（`.mdd` 可选，用于音频与图片资源）。

## 常见问题

- **找不到词典** —— 确认已在设置中添加该文件夹且其中含 `.mdx`；未添加的目录不会被扫描（不做全库递归）。
- **某个词查不到** —— 切换到其他词典 tab，或确认该词典已启用且优先级更高。
- **没有声音** —— 检查「发音」分区中对应音源是否开启；顺序为 `.mdd` → 在线音频 → TTS。

## 贡献

欢迎提交 Issue 与 Pull Request。请注明 Obsidian 版本、操作系统与复现步骤；提交 PR 前请先运行 `npm run build`。

## 许可证

[MIT](LICENSE)
