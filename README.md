# LinguaNex

[English](#english) | [中文](#中文)

---

## English

Look up words in local MDX/MDD dictionaries, build vocabulary lists, and review them with spaced repetition — on desktop and mobile.

LinguaNex is a privacy-first dictionary plugin for [Obsidian](https://obsidian.md/). It reads your own `.mdx` / `.mdd` dictionary files (the standard format used by MDict / GoldenDict), so lookups work fully offline. It also bundles online dictionaries, sentence translation, and optional AI-powered explanations for tricky entries.

### Features

- **Offline dictionary lookup** — parse local `.mdx` / `.mdd` files (MDict / GoldenDict format) with no network required.
- **Floating lookup popover** — hover over a word to see its definition right where you are reading.
- **Lookup panel** — open a dedicated word-lookup panel, docked into the content area for a clean reading experience.
- **Vocabulary book & spaced review** — save words to your own vocabulary list and review them later.
- **Online dictionaries** — 有道 (Youdao) and Free Dictionary as optional online sources.
- **Sentence translation** — translate selected sentences via online services.
- **AI-powered explanations** — optional AI definitions and example sentences, with configurable providers:
  - OpenAI
  - DeepSeek
  - Moonshot (Kimi)
  - Zhipu GLM
  - Qwen (Tongyi Qianwen)
  - Groq
  - Ollama (local models)
- **PDF word selection** — look up words selected inside PDFs.
- **Mobile friendly** — works on Obsidian mobile; no desktop-only API is required.

### Installation

#### Community plugins directory

LinguaNex is submitted to the [Obsidian community plugins](https://obsidian.md/plugins) directory. Once approved, install it from **Settings → Community plugins → Browse**, search for "LinguaNex", and enable it.

#### Manual installation

1. Download the latest release (`lingua-nex-<version>.zip`) from the [GitHub Releases](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases) page.
2. Unzip it into your vault's plugin folder: `<vault>/.obsidian/plugins/lingua-nex/`.
3. Restart Obsidian (or reload the plugin) and enable **LinguaNex** in **Settings → Community plugins**.

#### BRAT (for testing pre-release builds)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Run command **BRAT: Add a beta plugin for testing** and enter `https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin`.
3. Enable **LinguaNex** in **Settings → Community plugins**.

### Usage

#### Commands

| Command | Description |
| --- | --- |
| `LinguaNex: Look up word` | Open the lookup panel for the selected word (or the word at cursor). |
| `LinguaNex: Look up (hover)` | With a selection, show the definition in a floating popover next to it; without a selection, open the lookup panel. |
| `LinguaNex: Close lookup panel` | Close the current lookup panel. |
| `LinguaNex: Open dictionary manager` | Manage installed MDX/MDD dictionaries and online sources. |
| `LinguaNex: Open word review` | Open the spaced-repetition review for your vocabulary book. |
| `LinguaNex: Save selected word` | Add the selected word to your vocabulary book. |

Assign hotkeys to these commands in **Settings → Hotkeys** for fastest access.

#### Lookup flow

1. Select a word in any note (or PDF).
2. Trigger **Look up word** or **Look up (hover)**.
3. Read the definition from your local dictionary, online sources, or the AI provider — whichever is enabled.
4. Optionally save the word to your vocabulary book for later review.

#### Dictionaries

- **Local MDX/MDD**: drop your `.mdx` (and optional `.mdd` media) files into the folder configured in settings, then add them in the dictionary manager. Lookups are instant and offline.
- **Online sources**: enable 有道 (Youdao) or Free Dictionary in settings for fallback lookups.
- **Sentence translation**: enable the online translation source to translate full sentences.

#### AI explanations

In **Settings → AI**, choose a provider, enter your API key / base URL, and enable AI explanations. Lookup results will include AI-generated definitions, usage notes, or example sentences. Ollama users can point the base URL at a local model — no data leaves your machine.

### Development

The plugin is written in TypeScript and built with `tsc` + `esbuild`.

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd lingua-nex
npm install
npm run build
```

`npm run build` produces `main.js`, `manifest.json`, and `styles.css` for the release.

### Compatibility

- Obsidian `>= 1.4.0` (desktop and mobile).
- MDX/MDD dictionaries must be in MDict / GoldenDict format.

### License

[MIT](LICENSE)

---

## 中文

在本地 MDX/MDD 词典中查词、构建生词本，并通过间隔重复复习——桌面端与移动端均可用。

LinguaNex 是一款注重隐私的 [Obsidian](https://obsidian.md/) 词典插件。它直接读取你自己的 `.mdx` / `.mdd` 词典文件（MDict / GoldenDict 使用的标准格式），查词完全离线进行。同时内置在线词典、整句翻译，以及可选的 AI 释义功能，用于解释疑难词条。

### 功能特性

- **离线词典查词** — 解析本地 `.mdx` / `.mdd` 文件（MDict / GoldenDict 格式），无需联网。
- **悬浮查词浮窗** — 鼠标悬停单词即可在阅读位置直接查看释义。
- **查词面板** — 打开专属查词面板，停靠在内容区，获得干净的阅读体验。
- **生词本与间隔复习** — 将单词保存到自己的生词列表，之后按间隔重复复习。
- **在线词典** — 可选接入有道（Youdao）和 Free Dictionary 作为在线查询来源。
- **整句翻译** — 通过在线服务翻译选中的句子。
- **AI 释义** — 可选的 AI 释义与例句功能，支持可配置的提供商：
  - OpenAI
  - DeepSeek
  - Moonshot（Kimi）
  - 智谱 GLM
  - Qwen（通义千问）
  - Groq
  - Ollama（本地模型）
- **PDF 取词** — 在 PDF 中选中单词即可查词。
- **移动端友好** — 支持 Obsidian 移动端，不依赖桌面端专属 API。

### 安装

#### 社区插件目录

LinguaNex 已提交至 [Obsidian 社区插件](https://obsidian.md/plugins) 目录。审核通过后，可在 **设置 → 社区插件 → 浏览** 中搜索 "LinguaNex" 并启用。

#### 手动安装

1. 从 [GitHub Releases](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases) 页面下载最新发行版（`lingua-nex-<version>.zip`）。
2. 解压到你的仓库插件目录：`<vault>/.obsidian/plugins/lingua-nex/`。
3. 重启 Obsidian（或重新加载插件），并在 **设置 → 社区插件** 中启用 **LinguaNex**。

#### BRAT（用于测试预发布版本）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 运行命令 **BRAT: Add a beta plugin for testing** 并输入 `https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin`。
3. 在 **设置 → 社区插件** 中启用 **LinguaNex**。

### 使用方法

#### 命令

| 命令 | 说明 |
| --- | --- |
| `LinguaNex: Look up word` | 为选中的单词（或光标处的单词）打开查词面板。 |
| `LinguaNex: Look up (hover)` | 有选中内容时，在选区旁边以悬浮浮窗显示释义；无选中内容时打开查词面板。 |
| `LinguaNex: Close lookup panel` | 关闭当前查词面板。 |
| `LinguaNex: Open dictionary manager` | 管理已安装的 MDX/MDD 词典与在线词源。 |
| `LinguaNex: Open word review` | 打开生词本的间隔重复复习。 |
| `LinguaNex: Save selected word` | 将选中的单词加入生词本。 |

可在 **设置 → 快捷键** 中为这些命令分配快捷键，以便快速使用。

#### 查词流程

1. 在任意笔记（或 PDF）中选中一个单词。
2. 触发 **Look up word** 或 **Look up (hover)**。
3. 从本地词典、在线词源或 AI 提供商（视启用情况而定）读取释义。
4. 可选择将单词保存到生词本，供日后复习。

#### 词典

- **本地 MDX/MDD**：将你的 `.mdx`（及可选的 `.mdd` 媒体文件）放入设置中配置的目录，然后在词典管理器中添加。查询即时完成且完全离线。
- **在线词源**：在设置中启用有道（Youdao）或 Free Dictionary 作为兜底查询来源。
- **整句翻译**：启用在线翻译来源以翻译完整句子。

#### AI 释义

在 **设置 → AI** 中选择提供商，填写 API 密钥 / Base URL，并启用 AI 释义。查询结果将包含 AI 生成的释义、用法说明或例句。Ollama 用户可将 Base URL 指向本地模型——数据不会离开你的设备。

### 开发

插件使用 TypeScript 编写，通过 `tsc` + `esbuild` 构建。

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd lingua-nex
npm install
npm run build
```

`npm run build` 会生成用于发布的 `main.js`、`manifest.json` 和 `styles.css`。

### 兼容性

- Obsidian `>= 1.4.0`（桌面端与移动端）。
- MDX/MDD 词典必须是 MDict / GoldenDict 格式。

### 许可证

[MIT](LICENSE)
