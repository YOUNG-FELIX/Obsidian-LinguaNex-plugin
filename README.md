# LinguaNex

Look up words in local MDX/MDD dictionaries, build vocabulary lists, and review them with spaced repetition — on desktop and mobile.

LinguaNex is a privacy-first dictionary plugin for [Obsidian](https://obsidian.md/). It reads your own `.mdx` / `.mdd` dictionary files (the standard format used by MDict / GoldenDict), so lookups work fully offline. It also bundles online dictionaries, sentence translation, and optional AI-powered explanations for tricky entries.

## Features

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

## Installation

### Community plugins directory

LinguaNex is submitted to the [Obsidian community plugins](https://obsidian.md/plugins) directory. Once approved, install it from **Settings → Community plugins → Browse**, search for "LinguaNex", and enable it.

### Manual installation

1. Download the latest release (`lingua-nex-<version>.zip`) from the [GitHub Releases](https://github.com/<your-account>/lingua-nex/releases) page.
2. Unzip it into your vault's plugin folder: `<vault>/.obsidian/plugins/lingua-nex/`.
3. Restart Obsidian (or reload the plugin) and enable **LinguaNex** in **Settings → Community plugins**.

### BRAT (for testing pre-release builds)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. Run command **BRAT: Add a beta plugin for testing** and enter `https://github.com/<your-account>/lingua-nex`.
3. Enable **LinguaNex** in **Settings → Community plugins**.

## Usage

### Commands

| Command | Description |
| --- | --- |
| `LinguaNex: Look up word` | Open the lookup panel for the selected word (or the word at cursor). |
| `LinguaNex: Look up (hover)` | With a selection, show the definition in a floating popover next to it; without a selection, open the lookup panel. |
| `LinguaNex: Close lookup panel` | Close the current lookup panel. |
| `LinguaNex: Open dictionary manager` | Manage installed MDX/MDD dictionaries and online sources. |
| `LinguaNex: Open word review` | Open the spaced-repetition review for your vocabulary book. |
| `LinguaNex: Save selected word` | Add the selected word to your vocabulary book. |

Assign hotkeys to these commands in **Settings → Hotkeys** for fastest access.

### Lookup flow

1. Select a word in any note (or PDF).
2. Trigger **Look up word** or **Look up (hover)**.
3. Read the definition from your local dictionary, online sources, or the AI provider — whichever is enabled.
4. Optionally save the word to your vocabulary book for later review.

### Dictionaries

- **Local MDX/MDD**: drop your `.mdx` (and optional `.mdd` media) files into the folder configured in settings, then add them in the dictionary manager. Lookups are instant and offline.
- **Online sources**: enable 有道 (Youdao) or Free Dictionary in settings for fallback lookups.
- **Sentence translation**: enable the online translation source to translate full sentences.

### AI explanations

In **Settings → AI**, choose a provider, enter your API key / base URL, and enable AI explanations. Lookup results will include AI-generated definitions, usage notes, or example sentences. Ollama users can point the base URL at a local model — no data leaves your machine.

## Development

The plugin is written in TypeScript and built with `tsc` + `esbuild`.

```bash
git clone https://github.com/<your-account>/lingua-nex.git
cd lingua-nex
npm install
npm run build
```

`npm run build` produces `main.js`, `manifest.json`, and `styles.css` for the release.

## Compatibility

- Obsidian `>= 1.4.0` (desktop and mobile).
- MDX/MDD dictionaries must be in MDict / GoldenDict format.

## License

[MIT](LICENSE)
