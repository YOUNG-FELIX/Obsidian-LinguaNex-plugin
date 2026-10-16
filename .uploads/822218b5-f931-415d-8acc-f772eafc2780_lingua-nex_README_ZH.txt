# LinguaNex

在本地 MDX/MDD 词典中查词、构建生词本，并通过间隔重复复习——桌面端与移动端均可用。

LinguaNex 是一款注重隐私的 [Obsidian](https://obsidian.md/) 词典插件。它直接读取你自己的 `.mdx` / `.mdd` 词典文件（MDict / GoldenDict 使用的标准格式），查词完全离线进行。同时内置在线词典、整句翻译，以及可选的 AI 释义功能，用于解释疑难词条。

## 功能特性

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

## 安装

### 社区插件目录

LinguaNex 已提交至 [Obsidian 社区插件](https://obsidian.md/plugins) 目录。审核通过后，可在 **设置 → 社区插件 → 浏览** 中搜索 "LinguaNex" 并启用。

### 手动安装

1. 从 [GitHub Releases](https://github.com/YOUNG-FELIX/lingua-nex/releases) 页面下载最新发行版（`lingua-nex-<version>.zip`）。
2. 解压到你的仓库插件目录：`<vault>/.obsidian/plugins/lingua-nex/`。
3. 重启 Obsidian（或重新加载插件），并在 **设置 → 社区插件** 中启用 **LinguaNex**。

### BRAT（用于测试预发布版本）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 运行命令 **BRAT: Add a beta plugin for testing** 并输入 `https://github.com/YOUNG-FELIX/lingua-nex`。
3. 在 **设置 → 社区插件** 中启用 **LinguaNex**。

## 使用方法

### 命令

| 命令 | 说明 |
| --- | --- |
| `LinguaNex: Look up word` | 为选中的单词（或光标处的单词）打开查词面板。 |
| `LinguaNex: Look up (hover)` | 有选中内容时，在选区旁边以悬浮浮窗显示释义；无选中内容时打开查词面板。 |
| `LinguaNex: Close lookup panel` | 关闭当前查词面板。 |
| `LinguaNex: Open dictionary manager` | 管理已安装的 MDX/MDD 词典与在线词源。 |
| `LinguaNex: Open word review` | 打开生词本的间隔重复复习。 |
| `LinguaNex: Save selected word` | 将选中的单词加入生词本。 |

可在 **设置 → 快捷键** 中为这些命令分配快捷键，以便快速使用。

### 查词流程

1. 在任意笔记（或 PDF）中选中一个单词。
2. 触发 **Look up word** 或 **Look up (hover)**。
3. 从本地词典、在线词源或 AI 提供商（视启用情况而定）读取释义。
4. 可选择将单词保存到生词本，供日后复习。

### 词典

- **本地 MDX/MDD**：将你的 `.mdx`（及可选的 `.mdd` 媒体文件）放入设置中配置的目录，然后在词典管理器中添加。查询即时完成且完全离线。
- **在线词源**：在设置中启用有道（Youdao）或 Free Dictionary 作为兜底查询来源。
- **整句翻译**：启用在线翻译来源以翻译完整句子。

### AI 释义

在 **设置 → AI** 中选择提供商，填写 API 密钥 / Base URL，并启用 AI 释义。查询结果将包含 AI 生成的释义、用法说明或例句。Ollama 用户可将 Base URL 指向本地模型——数据不会离开你的设备。

## 开发

插件使用 TypeScript 编写，通过 `tsc` + `esbuild` 构建。

```bash
git clone https://github.com/YOUNG-FELIX/lingua-nex.git
cd lingua-nex
npm install
npm run build
```

`npm run build` 会生成用于发布的 `main.js`、`manifest.json` 和 `styles.css`。

## 兼容性

- Obsidian `>= 1.4.0`（桌面端与移动端）。
- MDX/MDD 词典必须是 MDict / GoldenDict 格式。

## 许可证

[MIT](LICENSE)
