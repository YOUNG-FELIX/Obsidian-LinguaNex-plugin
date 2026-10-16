# LinguaNex

![GitHub Release](https://img.shields.io/github/v/release/YOUNG-FELIX/Obsidian-LinguaNex-plugin?style=flat)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0%2B-7c3aed?logo=obsidian&logoColor=white)
![Downloads](https://img.shields.io/github/downloads/YOUNG-FELIX/Obsidian-LinguaNex-plugin/total?style=flat)

[English](#english) | [中文](#中文)

---

## English

LinguaNex brings a dictionary into Obsidian. It reads the MDX/MDD dictionaries you already have — the format MDict and GoldenDict use, and the one most Chinese–English dictionary packs ship in — so you can look a word up without leaving your note, and without a network connection. When the built-in sources aren't enough, you can add online dictionaries, sentence translation, or an AI model for a fuller explanation.

Everything hangs off a lookup panel you can open from the ribbon, a hotkey, or simply by selecting text. Dictionary management, the vocabulary book, and spaced review live in two side views.

### Preview
<img width="220" height="150" alt="image_1792135121925" src="https://github.com/user-attachments/assets/819c80dc-a934-49a3-ad8b-1adb13984e37" />


<img width="140" height="338" alt="image_1792135123740" src="https://github.com/user-attachments/assets/f4739382-7518-4676-9aa2-f0f17993343b" />
<img width="140" height="338" alt="image_1792135126795" src="https://github.com/user-attachments/assets/a6ac8264-4e22-4e9c-b9fe-dddd68dd4097" />
<img width="140" height="338" alt="image_1792135152034" src="https://github.com/user-attachments/assets/4501ddbd-8bd9-43fc-bb44-a2d7a0b4522d" />

### What it does

**Look words up**
- Reads `.mdx` dictionaries, together with the matching `.mdd` archive for audio and images, plus any `css` / `js` / `ini` files the entries reference. The format is MDict / GoldenDict.
- Exact lookup with basic lemmatization. Entries render with their own HTML, so styling and media come through.
- Dictionary folders are scanned for you. Local dictionaries and online sources appear in one list you can toggle and reorder.

**Pick how it opens**
- Drawer — a panel docked at the top of the content area (`打开抽屉查词`, default `Mod+Shift+D`).
- Popover — a compact window floating next to the word you selected (`打开悬浮窗查词`).
- Selecting any text also raises a small toolbar with 查词 / AI / 发音 / 收藏 buttons. If you prefer, lookups can fire automatically on selection.

**Add online sources**
- 有道词典 (Youdao) — Chinese definitions, part-of-speech groups, phonetics and UK/US audio.
- Free Dictionary (dictionaryapi.dev) — English definitions and audio.

**Hear the word**
- Audio embedded in your local dictionary is played first, then Youdao, then Free Dictionary, with the system text-to-speech voice as a last resort. Both online sources have UK/US variants.

**Translate whole sentences**
- MyMemory needs no key; 百度翻译 (Baidu) is available if you have an app ID and secret.

**Ask an AI (optional)**
- Works with any OpenAI-compatible endpoint. Presets cover OpenAI, DeepSeek, Moonshot (Kimi), 智谱 GLM, 通义千问 (Qwen), Groq, and a local Ollama server — that last one keeps everything on your machine.
- Replies stream in, and the panel falls back to the AI explanation when no dictionary matches.
- Prompt templates: a default dictionary layout, a Collins-style one, an Oxford-style one, or your own custom prompt.

**Save and review words**
- Words are saved to a vocabulary book, stored as JSON inside your vault (so it moves with the vault).
- Review with a trimmed-down SM-2 schedule: rate each word 忘记 (forgotten), 模糊 (shaky) or 认识 (known), and the plugin works out the next interval — 1 / 3 / 7 days by default — and shows what is coming up. Intervals and ease parameters are adjustable.
- Words you look up can be added to the book automatically, if you turn that on.

**Sync with 欧路词典 (Eudic)**
- Push your vocabulary to Eudic's study list, or pull words back from it — on demand, or automatically each time you save a word. Requires an Eudic OpenAPI token.

**In PDFs**
- Double-click a word in a PDF to look it up. Selected text also gets a right-click menu for 查词 / 生词本 / AI.

**On mobile**
- No desktop-only APIs are used, and `manifest.json` sets `isDesktopOnly: false`.

### Installation

**Community plugins** — LinguaNex has been submitted to the official directory. Once it is approved, search for "LinguaNex" under Settings → Community plugins → Browse.

**Manual** — download the latest `lingua-nex-<version>.zip` from the [Releases page](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases), unzip it into `<vault>/.obsidian/plugins/lingua-nex/`, then enable LinguaNex under Settings → Community plugins.

**BRAT** — add `https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin` as a beta plugin to try pre-release builds.

### Commands

The command names are in Chinese, matching the plugin's UI.

| Command | What it does | Default |
| --- | --- | --- |
| LinguaNex: 打开抽屉查词 | Open the drawer lookup panel | `Mod+Shift+D` |
| LinguaNex: 打开悬浮窗查词 | Show a popover next to the selection, or a floating input | |
| LinguaNex: 关闭查词面板 | Close the current panel | |
| LinguaNex: 打开词典管理 | Open the dictionary manager | |
| LinguaNex: 打开生词复习 | Open the vocabulary review | |
| LinguaNex: 收藏选中单词 | Add the selected word to your vocabulary book | |

You can rebind all of these under Settings → Hotkeys.

### Local dictionaries

Put your `.mdx` files — and the matching `.mdd`, if there is one — anywhere in the vault, add that folder in the plugin settings, and LinguaNex scans it. Each dictionary then appears in the manager, where you can enable it, remove it, or change its priority. Lookups from these files run entirely offline.

### Settings

The settings tab covers: the dictionary folders and the combined source list; lookup behaviour (drawer or popover, the selection toolbar, auto-lookup, and the key that closes the panel); translation engine and credentials; pronunciation sources and variants; PDF options; the AI provider, endpoint and prompt; the default vocabulary book; and Eudic sync.

### Development

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd Obsidian-LinguaNex-plugin
npm install
npm run build
```

`npm run build` type-checks the sources and bundles `main.js`, `manifest.json` and `styles.css`.

### Notes

- Requires Obsidian 1.4.0 or newer. Dictionaries must be in MDict / GoldenDict format.
- The plugin UI is currently in Chinese.
- MDX/MDD parsing builds on [mdict-js](https://www.npmjs.com/package/mdict-js); the review scheduling follows the SM-2 approach used by fleurdict. Thanks to both.

### License

[MIT](LICENSE)

---

## 中文

LinguaNex 把词典搬进了 Obsidian。它直接读取你手头已有的 MDX/MDD 词典——也就是 MDict、GoldenDict 使用的格式，多数中英词典包都是这个格式——让你不必离开笔记、也不必联网就能查词。当内置来源不够用时，还可以接入在线词典、整句翻译，或让 AI 给出更完整的解释。

插件的入口是一块查词面板：可以从侧边栏图标、快捷键打开，选中文本也会触发。词典管理、生词本和间隔复习则放在两个独立视图中。

### 部分效果展示
<img width="220" height="150" alt="image_1792135121925" src="https://github.com/user-attachments/assets/819c80dc-a934-49a3-ad8b-1adb13984e37" />


<img width="140" height="338" alt="image_1792135123740" src="https://github.com/user-attachments/assets/f4739382-7518-4676-9aa2-f0f17993343b" />
<img width="140" height="338" alt="image_1792135126795" src="https://github.com/user-attachments/assets/a6ac8264-4e22-4e9c-b9fe-dddd68dd4097" />
<img width="140" height="338" alt="image_1792135152034" src="https://github.com/user-attachments/assets/4501ddbd-8bd9-43fc-bb44-a2d7a0b4522d" />

### 功能

**查词**
- 读取 `.mdx` 词典，并配套读取同名的 `.mdd` 归档（用于音频与图片），以及词条引用的 `css` / `js` / `ini` 文件。格式为 MDict / GoldenDict。
- 精确查找并做基础词形还原，词条按自身 HTML 渲染，样式与媒体都能正常显示。
- 词典目录会被自动扫描。本地词典与在线来源显示在同一个列表中，可启用/停用并调整顺序。

**选择打开方式**
- 抽屉 —— 停靠在内容区顶部的面板（`打开抽屉查词`，默认快捷键 `Mod+Shift+D`）。
- 悬浮窗 —— 浮在所选单词旁边的紧凑窗口（`打开悬浮窗查词`）。
- 选中任意文本还会弹出一个小工具条，含 查词 / AI / 发音 / 收藏 四个按钮。如果愿意，也可以开启选中后自动查词。

**接入在线来源**
- 有道词典 —— 中文释义、词性分组、音标与英/美发音。
- Free Dictionary（dictionaryapi.dev）—— 英文释义与发音。

**发音**
- 优先播放本地词典内嵌音频，其次是有道，再次是 Free Dictionary，最后兜底到系统语音合成。两个在线来源都支持英式 / 美式发音变体。

**整句翻译**
- MyMemory 免 Key 可用；如果申请了百度翻译开放平台的 APP ID 与密钥，也可以选用百度翻译。

**AI 释义（可选）**
- 兼容任意 OpenAI 格式接口。内置预设包括 OpenAI、DeepSeek、Moonshot（Kimi）、智谱 GLM、通义千问、Groq，以及本地 Ollama —— 用 Ollama 时数据不出本机。
- 回复流式返回；词典都查不到时，面板会兜底用 AI 解释。
- 提示词模板提供默认词典版式、柯林斯式、牛津式，也可完全自定义。

**生词与复习**
- 收藏的单词存入生词本，以 JSON 文件保存在仓库内，随仓库一起同步。
- 复习采用精简版 SM-2：给每个词评「忘记 / 模糊 / 认识」，插件据此算出下次复习间隔（默认 1 / 3 / 7 天）并展示后续计划。间隔与难度系数都可调整。
- 可以把查过的词自动加入生词本（默认关闭）。

**与欧路词典同步**
- 把生词推送到欧路的学习记录，或从欧路拉取单词，可手动执行，也可在收藏单词时自动同步。需要欧路 OpenAPI 的 Token。

**PDF**
- 在 PDF 中双击单词即可查词；选中文本也有右键菜单，提供 查词 / 生词本 / AI。

**移动端**
- 不依赖任何桌面端专属 API，`manifest.json` 中 `isDesktopOnly: false`。

### 安装

**社区插件** —— LinguaNex 已提交至官方插件目录。审核通过后，在 设置 → 社区插件 → 浏览 中搜索 "LinguaNex" 即可。

**手动安装** —— 从 [Releases 页面](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases) 下载最新的 `lingua-nex-<version>.zip`，解压到 `<vault>/.obsidian/plugins/lingua-nex/`，然后在 设置 → 社区插件 中启用 LinguaNex。

**BRAT** —— 将 `https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin` 添加为测试版插件，即可安装预发布版本。

### 命令

命令名称与插件界面一致，均为中文。

| 命令 | 说明 | 默认快捷键 |
| --- | --- | --- |
| LinguaNex: 打开抽屉查词 | 打开顶部抽屉查词面板 | `Mod+Shift+D` |
| LinguaNex: 打开悬浮窗查词 | 在选区旁弹出悬浮释义窗，或打开悬浮输入框 | |
| LinguaNex: 关闭查词面板 | 关闭当前查词面板 | |
| LinguaNex: 打开词典管理 | 打开词典管理器 | |
| LinguaNex: 打开生词复习 | 打开生词复习 | |
| LinguaNex: 收藏选中单词 | 把选中的单词加入生词本 | |

以上命令都可以在 设置 → 快捷键 中另行绑定。

### 本地词典

把 `.mdx` 文件（以及配套的 `.mdd`，如果有）放到仓库任意位置，在插件设置里添加该文件夹，LinguaNex 就会扫描它。之后每本词典都会出现在管理器中，可启用、移除或调整优先级。用这些文件查词完全离线。

### 设置

设置页涵盖：词典目录与合并后的来源列表；查词行为（抽屉或悬浮窗、选中工具条、自动查词、关闭面板的按键）；翻译引擎与凭据；发音来源与变体；PDF 选项；AI 提供商、接口与提示词；默认生词本；以及欧路同步。

### 开发

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd Obsidian-LinguaNex-plugin
npm install
npm run build
```

`npm run build` 会做类型检查，并打包出 `main.js`、`manifest.json` 和 `styles.css`。

### 说明

- 需要 Obsidian 1.4.0 及以上。词典须为 MDict / GoldenDict 格式。
- 插件界面目前为中文。
- MDX/MDD 解析基于 [mdict-js](https://www.npmjs.com/package/mdict-js)；复习调度参考了 fleurdict 采用的 SM-2 方案。在此致谢。

### 许可证

[MIT](LICENSE)
