# LinguaNex

**English** · [简体中文](README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/YOUNG-FELIX/Obsidian-LinguaNex-plugin?label=release&sort=semver)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases)
[![Manifest version](https://img.shields.io/github/manifest-json/v/YOUNG-FELIX/Obsidian-LinguaNex-plugin?filename=manifest.json&label=manifest)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/blob/main/manifest.json)
[![Downloads](https://img.shields.io/github/downloads/YOUNG-FELIX/Obsidian-LinguaNex-plugin/total?label=downloads)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A5%201.4.0-483699?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Platform](https://img.shields.io/badge/platform-desktop%20%7C%20mobile-blue)](#compatibility)
[![License](https://img.shields.io/github/license/YOUNG-FELIX/Obsidian-LinguaNex-plugin?label=license)](LICENSE)
[![Build](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/actions/workflows/release.yml)
[![Last commit](https://img.shields.io/github/last-commit/YOUNG-FELIX/Obsidian-LinguaNex-plugin)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/commits/main)
[![Stars](https://img.shields.io/github/stars/YOUNG-FELIX/Obsidian-LinguaNex-plugin?style=social)](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/stargazers)

Offline-first dictionary lookup, vocabulary collection and spaced-repetition review for [Obsidian](https://obsidian.md) — on desktop and mobile.

LinguaNex reads your own `.mdx` / `.mdd` files (the MDict / GoldenDict format), so lookups work fully offline. Online dictionaries, sentence translation and optional AI definitions can be layered on top.

---

## Features

- **Offline MDX/MDD lookup** — parse local `.mdx` (and optional `.mdd` media) dictionaries with no network required.
- **Drawer panel** — a bottom sheet with multi-dictionary tabs, keyboard tab switching, and Esc to close.
- **Floating popover** — compact definition popover anchored next to the selected word.
- **Vocabulary books** — save words to one or more books; entries stay small (word + review state), definitions are resolved live at review time.
- **Two-step spaced review** — rate a card once to reveal the definition, rate again to commit the result and advance. Scheduling uses ease factor, streak and per-proficiency intervals.
- **Learning heatmap** — month view of daily review volume (capped at 3 reviews per word per day), with a day detail panel: words reviewed, unique words, forgot / fuzzy / known split, average proficiency, accuracy and the word list.
- **Pronunciation** — local `.mdd` audio first, then Youdao / Free Dictionary audio, then system TTS. A dedicated command (default `Mod+Shift+P`) speaks the panel word or the current selection.
- **Online sources** — Youdao, Free Dictionary, and sentence translation (MyMemory / Baidu Translate), each toggleable.
- **AI explanations** — OpenAI-compatible providers: OpenAI, DeepSeek, Moonshot (Kimi), Zhipu GLM, Qwen, Groq, Ollama (local). Save your own provider presets, then hit "Fetch models" to pick an available model from a dropdown (or type it manually).
- **Per-word notes** — jot down thoughts from the 📝 button in the lookup panel footer or the top-right corner of review list rows / cards. Fixed height, scrolls internally, stored in the entry's `note` field (saved only for favourited words).
- **Selection toolbar toggle** — the sidebar ✕ icon or the "Toggle selection toolbar" command temporarily disables the floating toolbar for the current session; the persistent switch still lives in settings.
- **PDF selection lookup** — look up words selected inside PDFs.
- **Eudic sync** — push vocabulary to Eudic (manual).
- **Privacy-first** — no telemetry; settings and API keys stay in your vault.

## Installation

### Community plugins

LinguaNex is being submitted to the Obsidian community plugin directory. Once listed, install it from **Settings → Community plugins → Browse**, search for “LinguaNex”, then enable it.

### Manual installation

1. Download `main.js`, `manifest.json`, `styles.css` (or `lingua-nex-<version>.zip`) from [Releases](https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin/releases).
2. Copy them into `<vault>/.obsidian/plugins/lingua-nex/`.
3. Reload Obsidian and enable **LinguaNex** in **Settings → Community plugins**.

### BRAT (pre-release builds)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. Run **BRAT: Add a beta plugin for testing** and enter `YOUNG-FELIX/Obsidian-LinguaNex-plugin`.
3. Enable **LinguaNex** in **Settings → Community plugins**.

## Getting started

1. Put your dictionaries anywhere in the vault, then add that folder in **Settings → LinguaNex → Add dictionary folder**. The folder search runs against Obsidian's in-memory file tree, so it is instant.
2. Enable the dictionaries you want under **Discovered dictionaries**; reorder them to set lookup priority.
3. Select a word in a note or PDF and run **Look up word** (drawer) or **Look up (hover)** (popover).

> Dictionary files can live in any vault folder — only the folders you explicitly add are scanned. Nothing is scanned automatically at startup.

## Commands

| Command | ID | Description |
| --- | --- | --- |
| Look up word | `lookup-word` | Open the drawer lookup panel. |
| Look up (hover) | `lookup-hover` | Popover next to the selection; opens the panel when nothing is selected. |
| Close lookup panel | `close-panel` | Close the current panel. |
| Toggle selection toolbar (this session) | `toggle-feature-bar` | Temporarily disable / restore the floating selection toolbar; resets to the setting value after restarting Obsidian. |
| Open dictionary manager | `open-manager` | Manage local / online dictionaries and ordering. |
| Open word review | `open-review` | Open spaced-repetition review. |
| Toggle favorite | `fav-toggle` | Toggle the panel word (or the selection) in your vocabulary book. |
| Pronounce | `pronounce-current` | Speak the panel word (or the selection). Default hotkey: `Mod+Shift+P`. |

All commands can be rebound in **Settings → Hotkeys**.

## Data & sync

- Vocabulary books: `<vault>/linguanex/vocab/<book>.json` (vault-relative, so any vault name works).
- The folder is created once when the plugin is enabled; if it is later removed, it is recreated when you next add a word.
- Review history lives in each entry's `hist` field as `[date, rating, proficiency]`; there is no separate log file.
- Because data lives inside the vault, it syncs with Obsidian Sync / Git like normal notes. Back up the json to keep your history.

## Settings overview

| Section | What it controls |
| --- | --- |
| LinguaNex dictionaries | Dictionary folders, discovered dictionaries, enable/disable and priority. |
| Lookup | Drawer vs. hover mode, selection toolbar, auto lookup. |
| Sentence translation | Translation engine and credentials. |
| Pronunciation | Local `.mdd` audio, Youdao, Free Dictionary, TTS, accent variant. |
| PDF lookup | Enable PDF selection lookup and context menu. |
| AI explanations | Provider, base URL, model, API key, prompt, ratio. |
| Vocabulary | Default book, review algorithm parameters, new-word limits. |
| Eudic sync | Token, language, category, sync mode. |

## Development

TypeScript + `tsc` (type check) + `esbuild` (bundle).

```bash
git clone https://github.com/YOUNG-FELIX/Obsidian-LinguaNex-plugin.git
cd Obsidian-LinguaNex-plugin
npm install
npm run dev     # watch mode
npm run build   # type check + production bundle
```

`npm run build` emits `main.js`, `manifest.json` and `styles.css`.

## Compatibility

- Obsidian `>= 1.4.0`, desktop and mobile.
- Dictionaries must be valid MDict / GoldenDict `.mdx` files (`.mdd` optional, for audio and images).

## Troubleshooting

- **No dictionaries found** — confirm the folder was added in settings and contains `.mdx` files; the scan is not recursive into folders you did not add.
- **Lookup misses a word** — try another dictionary tab, or check that the dictionary is enabled and ordered above others.
- **No audio** — enable the pronunciation sources you want; `.mdd` audio is used first, then online audio, then TTS.

## Contributing

Issues and pull requests are welcome. Please include your Obsidian version, platform and steps to reproduce. Run `npm run build` before opening a PR.

## License

[MIT](LICENSE)
