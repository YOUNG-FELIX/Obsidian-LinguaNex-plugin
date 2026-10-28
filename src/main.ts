import { Buffer } from "buffer";
import process from "process";
// Mobile WebView has no Node runtime: vendor mdict code relies on the
// global Buffer / process. Install browser-safe polyfills at the earliest point.
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
(globalThis as unknown as Record<string, unknown>).process = process;

import { Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	LinguaNexSettings,
	LinguaNexSettingTab,
	type DictItem,
	type OnlineSourceConfig,
} from "./settings";
import { LinguaNexMdict } from "./core/mdict";
import { scanDir, type ScanResult } from "./core/scanner";
import { DictResources } from "./core/resources";
import { VocabStore, VOCAB_ROOT } from "./core/vocab";
import { EudicService } from "./core/eudic";
import { LookupPanel, type LookupSource } from "./ui/lookupPanel";
import { FeatureBar } from "./ui/featureBar";
import { PdfSelectionHandler } from "./ui/pdfSelection";
import {
	DICT_MANAGER_VIEW,
	VOCAB_REVIEW_VIEW,
	makeDictManagerView,
	makeVocabReviewView,
} from "./ui/views";
import { extractSoundPath, playAudioUrl, playMddAudio, speakTTS } from "./core/audio";
import { YoudaoAPI, FreeDictAPI, buildOnlineDoc } from "./core/onlineDict";
import { translateSentence, buildTranslateDoc } from "./core/translate";

export const YOUDao_SOURCE_ID = "__youdao__";
export const FREE_DICT_SOURCE_ID = "__free_dict__";
export const TRANSLATE_SOURCE_ID = "__translate__";

export default class LinguaNexPlugin extends Plugin {
	declare settings: LinguaNexSettings;
	vocab: VocabStore;
	readonly youdao = new YoudaoAPI();
	readonly freeDict = new FreeDictAPI();
	readonly eudicService = new EudicService(() => this.settings.eudic);
	loadedDicts: LinguaNexMdict[] = [];
	/** 查词面板懒创建：Obsidian 启动（尤其移动端 WebView）不挂任何面板 DOM，
	 *  彻底避免启动首帧闪一下；只有命令/查词/选中取词首次触发时才创建挂载。 */
	private panel: LookupPanel | null = null;
	private ensurePanel(): LookupPanel {
		if (!this.panel) {
			this.panel = new LookupPanel(this);
			// 首次创建时补齐解释源列表（启动阶段 refreshSources 曾因面板未创建而跳过）
			this.refreshSources();
		}
		return this.panel;
	}
	/** 面板根节点（供选区监听判断选区是否位于面板内，避免面板内选中触发自动查词/工具条） */
	get panelEl(): HTMLElement {
		return this.ensurePanel().rootEl;
	}
	/** 词典书架点击生词本后待打开的复习生词本（VocabReviewView.onOpen 消费） */
	pendingReviewBook = "";
	/** 选中取词工具条懒创建：同样避免启动时挂载 DOM，首次选中文本时才创建 */
	private fbar: FeatureBar | null = null;
	private ensureFbar(): FeatureBar {
		if (!this.fbar) {
			this.fbar = new FeatureBar(this);
			this.fbar.setEnabled(this.settings.lookup.showFeatureBar);
		}
		return this.fbar;
	}
	private pdfHandler: PdfSelectionHandler;
	private resourcesByDict = new Map<string, DictResources>();
	private reloading = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		// 生词本存放在 vault 内固定目录，便于 Obsidian Sync / Git 同步；旧插件目录作为一次性搬迁来源
		this.vocab = new VocabStore(this.app.vault, VOCAB_ROOT, this.manifest.dir ?? "");
		await this.vocab.ensureBase();

		this.pdfHandler = new PdfSelectionHandler(this);
		this.pdfHandler.register();

		// 悬浮窗生命周期：离开单词所在叶子（切换页面/标签）即关闭，防止悬浮窗残留
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.panel?.visible && this.panel?.floating) this.panel?.hide();
			}),
		);

		this.addRibbonIcon("book-open-check", "LinguaNex 查词", () =>
			this.ensurePanel().toggle(),
		);
		this.addRibbonIcon("circle-x", "LinguaNex 关闭查词面板", () => {
			if (this.panel?.visible) this.panel.hide();
		});

		this.addCommand({
			id: "lookup-word",
			name: "打开抽屉查词",
			callback: () => {
				// 命令是独立入口：不受设置中查词模式控制，用哪个命令就用哪种形态
				// 若当前为悬浮形态先收起，再以抽屉形态展示
				const p = this.ensurePanel();
				if (p.floating) p.hide();
				p.show();
			},
		});
		this.addCommand({
			id: "lookup-hover",
			name: "打开悬浮窗查词",
			callback: () => {
				// 命令是独立入口：不受设置中查词模式控制
				// 有选中词则在选区旁悬浮；无选中词则打开悬浮窗供手动输入
				const sel = window.getSelection();
				const text = sel?.toString().trim() ?? "";
				if (text && sel && sel.rangeCount > 0) {
					const rect = sel.getRangeAt(0).getBoundingClientRect();
					if (rect && (rect.width > 0 || rect.height > 0)) {
						void this.ensurePanel().showAt(text, rect);
						return;
					}
				}
				void this.ensurePanel().showFloating();
			},
		});
		this.addCommand({
			id: "close-panel",
			name: "关闭查词面板",
			callback: () => {
				if (this.panel?.visible) this.panel.hide();
			},
		});
		this.addCommand({
			id: "open-manager",
			name: "打开词典管理",
			callback: () => void this.openView(DICT_MANAGER_VIEW),
		});
		this.addCommand({
			id: "open-review",
			name: "打开生词复习",
			callback: () => void this.openView(VOCAB_REVIEW_VIEW),
		});
		this.addCommand({
			id: "fav-toggle",
			name: "收藏/取消收藏（当前词）",
			callback: () => {
				const p = this.panel;
				if (p?.visible) {
					void p.favCurrent();
				} else {
					const sel = window.getSelection()?.toString().trim() ?? "";
					if (sel) void this.favWord(sel, sel);
				}
			},
		});

		this.addCommand({
			id: "pronounce-current",
			name: "发音（当前词）",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "P" }],
			callback: () => {
				const p = this.panel;
				if (p?.visible) {
					void p.speakCurrent();
				} else {
					const sel = window.getSelection()?.toString().trim() ?? "";
					if (sel) void this.speakWord(sel);
				}
			},
		});

		this.registerView(DICT_MANAGER_VIEW, (leaf) =>
			makeDictManagerView(leaf, this),
		);
		this.registerView(VOCAB_REVIEW_VIEW, (leaf) =>
			makeVocabReviewView(leaf, this),
		);

		// Esc 关闭已迁移到 LookupPanel（capture 阶段，焦点在 CM6/iframe 也生效）
		this.addSettingTab(new LinguaNexSettingTab(this.app, this));

		// 选中功能条：抽屉保持懒创建；功能条启动 5s 后再创建实例并注册选区监听，
		// 既避开移动端启动首帧闪烁，又保证监听必然生效（不再依赖选中事件触发创建）
		window.setTimeout(() => {
			this.ensureFbar();
			this.registerDomEvent(document, "selectionchange", () => {
				this.ensureFbar().onSelectionChanged();
			});
		}, 5000);

		// 启动时自动加载已启用词典
		void this.reloadDictionaries();
	}

	onunload(): void {
		this.pdfHandler.unregister();
		this.panel?.dispose();
		this.fbar?.dispose();
		for (const r of this.resourcesByDict.values()) r.dispose();
		this.resourcesByDict.clear();
	}

	/** 查词方式切换（设置页调用）：hover 模式查词即悬浮面板完整复用抽屉，drawer 模式为贴顶抽屉 */
	setLookupMode(_mode: "drawer" | "hover"): void {
		// 面板已统一承载两种模式，无需额外启停
	}

	/** 查词面板当前是否可见（PDF 选区守卫等复用） */
	isPanelVisible(): boolean {
		return !!this.panel?.visible;
	}

	/** 取完整释义 HTML（悬浮窗复用抽屉同款渲染：完整资源解析 + 内联 CSS） */
	lookupDocHtml(word: string): string {
		for (const d of this.loadedDicts) {
			const r = d.lookup(word);
			if (r?.definition != null) {
				return this.ensurePanel().buildDoc(r.definition, d, this.resourcesByDict.get(d.dictPath));
			}
		}
		return "";
	}

	/** 取简洁纯文本释义（悬浮窗用）：首个命中的词典定义，去 HTML 后截断 */
	lookupDef(word: string, maxLen = 400): string {
		for (const d of this.loadedDicts) {
			const r = d.lookup(word);
			if (r?.definition != null) {
				return r.definition
					.replace(/<[^>]+>/g, " ")
					.replace(/sound:\/\/\S+/gi, "")
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, maxLen);
			}
		}
		return "";
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 兼容旧配置：Object.assign 对嵌套对象整体覆盖，补齐缺失的在线源配置项
		const online = this.settings.online as Partial<typeof DEFAULT_SETTINGS.online>;
		for (const key of Object.keys(DEFAULT_SETTINGS.online) as (keyof typeof DEFAULT_SETTINGS.online)[]) {
			if (!online[key]) {
				// online 段各 key 类型不同（translate 为 TranslateConfig），联合类型回填需断言
				(online as Record<string, unknown>)[key] = DEFAULT_SETTINGS.online[key];
			}
		}
		// 兼容旧配置：补齐 PDF 阅读查词配置
		if (!this.settings.pdf) {
			this.settings.pdf = { ...DEFAULT_SETTINGS.pdf };
		}
		// 兼容旧配置：补齐欧路同步配置
		if (!this.settings.eudic) {
			this.settings.eudic = { ...DEFAULT_SETTINGS.eudic };
		}
		// 兼容旧配置：补齐发音控制配置
		if (!this.settings.audio) {
			this.settings.audio = { ...DEFAULT_SETTINGS.audio };
		} else {
			const audio = this.settings.audio as Partial<typeof DEFAULT_SETTINGS.audio>;
			for (const key of Object.keys(DEFAULT_SETTINGS.audio) as (keyof typeof DEFAULT_SETTINGS.audio)[]) {
				if (audio[key] === undefined) {
					(audio as Record<string, unknown>)[key] = DEFAULT_SETTINGS.audio[key];
				}
			}
		}
		// 兼容旧配置：补齐生词本复习算法参数
		if (!this.settings.vocab) {
			this.settings.vocab = { ...DEFAULT_SETTINGS.vocab };
		} else {
			const vocab = this.settings.vocab as Partial<typeof DEFAULT_SETTINGS.vocab>;
			if (!vocab.review) {
				vocab.review = { ...DEFAULT_SETTINGS.vocab.review };
			} else {
				const rev = vocab.review as Partial<typeof DEFAULT_SETTINGS.vocab.review>;
				for (const key of Object.keys(DEFAULT_SETTINGS.vocab.review) as (keyof typeof DEFAULT_SETTINGS.vocab.review)[]) {
					if ((rev as Record<string, unknown>)[key] === undefined) {
						(rev as Record<string, unknown>)[key] = DEFAULT_SETTINGS.vocab.review[key];
					}
				}
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** 扫描已添加的词典目录并合并到配置，随后重载 */
	async scanAndRefresh(): Promise<void> {
		const results: ScanResult[] = [];
		for (const dir of this.settings.dictDirs) {
			results.push(...(await scanDir(this.app.vault, dir)));
		}
		const merged: DictItem[] = [];
		for (const r of results) {
			if (!r.valid) continue;
			const existing = this.settings.dictionaries.find(
				(d) => d.path === r.mdxPath,
			);
			const groupName = dirName(r.mdxPath);
			merged.push(
				existing
					? { ...existing, group: existing.group || groupName }
					: {
							path: r.mdxPath,
							mddPath: r.mddPath,
							name: baseName(r.mdxPath),
							enabled: true,
							priority: 0,
							group: groupName,
					  },
			);
		}
		this.settings.dictionaries = merged;
		await this.saveSettings();
		await this.reloadDictionaries();
		if (!merged.length) {
			new Notice("LinguaNex：目录中未发现有效 .mdx 词典");
		} else {
			new Notice(`LinguaNex：发现 ${merged.length} 个词典`);
		}
	}

	/** 按配置加载/卸载词典与配套资源（防重入：加载期间重复调用直接忽略） */
	async reloadDictionaries(): Promise<void> {
		if (this.reloading) return;
		this.reloading = true;
		try {
			for (const r of this.resourcesByDict.values()) r.dispose();
			this.resourcesByDict.clear();
			for (const m of this.loadedDicts) m.dispose();
			this.loadedDicts = [];

			const enabled = this.settings.dictionaries
				.filter((d) => d.enabled)
				.sort((a, b) => b.priority - a.priority);

			for (const d of enabled) {
				try {
					const mdict = new LinguaNexMdict(d.path, d.mddPath, d.name);
					await mdict.load(this.app.vault);
					this.loadedDicts.push(mdict);

					const dir = dirOf(d.path);
					const scans = await scanDir(this.app.vault, dir);
					const scan = scans.find((r) => r.mdxPath === d.path);
					if (scan) {
						const res = await DictResources.load(
							this.app.vault,
							dir,
							scan.resourceFiles,
						);
						this.resourcesByDict.set(d.path, res);
					}
				} catch (e: any) {
					new Notice(
						`LinguaNex 加载词典失败：${d.name}（${e?.message ?? "未知错误"}）。可尝试停用后重新启用，或重启 Obsidian`,
					);
				}
			}
			this.refreshSources();
		} finally {
			this.reloading = false;
		}
	}

	/** 重建查词源列表（本地词典 + 在线词典 + AI）：在线源与本地词典在同一列表统一按 priority 排序 */
	refreshSources(): void {
		const sources: LookupSource[] = [];
		for (const d of this.loadedDicts) {
			const item = this.settings.dictionaries.find(
				(x) => x.path === d.dictPath,
			);
			sources.push({
				id: d.dictPath,
				// 优先文件短名（header.title 可能超长，只在无短名时兜底）
				name: d.displayName || baseName(d.dictPath) || d.info.header?.title || "词典",
				mdict: d,
				resources: this.resourcesByDict.get(d.dictPath),
				priority: item?.priority ?? 0,
			});
		}
		// 在线词典并入同一列表：与本地词典一起按 priority 降序（默认 0 = 末位，可 ↑ 上移）
		for (const s of this.enabledOnlineSources()) {
			sources.push({
				id: s.id,
				name: s.name,
				isOnline: true,
				priority: s.cfg.priority ?? 0,
			});
		}
		// 统一按显示优先级降序排列（本地与在线同列表排序）；AI 恒为最后
		sources.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
		if (this.settings.ai.enabled) {
			sources.push({ id: "__ai__", name: "AI 释义", isAI: true });
		}
		if (this.panel) this.panel.setSources(sources);
	}

	/** 当前启用的在线词典源（按优先级降序，供列表与发音兜底共用） */
	enabledOnlineSources(): { id: string; name: string; cfg: OnlineSourceConfig }[] {
		const out: { id: string; name: string; cfg: OnlineSourceConfig }[] = [];
		const yo = this.settings.online?.youdao;
		if (yo?.enabled) out.push({ id: YOUDao_SOURCE_ID, name: "有道", cfg: yo });
		const fd = this.settings.online?.freeDict;
		if (fd?.enabled) out.push({ id: FREE_DICT_SOURCE_ID, name: "Free Dictionary", cfg: fd });
		const tr = this.settings.online?.translate;
		if (tr?.enabled) out.push({ id: TRANSLATE_SOURCE_ID, name: "在线翻译", cfg: tr });
		return out.sort((a, b) => (b.cfg.priority ?? 0) - (a.cfg.priority ?? 0));
	}

	/** 按在线源 ID 查词并渲染面板 HTML；sourceId 缺省时走有道 */
	async queryOnline(
		sourceId: string | undefined,
		word: string,
	): Promise<{
		doc: string;
		sourceName: string;
		audioBr: string | null;
		audioUs: string | null;
	} | null> {
		const id = sourceId ?? YOUDao_SOURCE_ID;
		if (id === YOUDao_SOURCE_ID) {
			const e = await this.youdao.query(word);
			return e
				? {
						doc: buildOnlineDoc(e, "有道词典（在线）"),
						sourceName: "有道词典（在线）",
						audioBr: e.audioBr,
						audioUs: e.audioUs,
					}
				: null;
		}
		if (id === FREE_DICT_SOURCE_ID) {
			const e = await this.freeDict.query(word);
			return e
				? {
						doc: buildOnlineDoc(e, "Free Dictionary"),
						sourceName: "Free Dictionary",
						audioBr: e.audioBr,
						audioUs: e.audioUs,
					}
				: null;
		}
		if (id === TRANSLATE_SOURCE_ID) {
			const tr = this.settings.online?.translate;
			const r = tr ? await translateSentence(tr, word) : null;
			return r
				? {
						doc: buildTranslateDoc(word, r.text, r.sourceName),
						sourceName: r.sourceName,
						audioBr: null,
						audioUs: null,
					}
				: null;
		}
		return null;
	}

	/** 打开查词面板（可带词）；带词时默认走词典源，避免默认消耗 AI Token */
	openLookup(word?: string): void {
		const p = this.ensurePanel();
		p.show();
		if (word) void p.lookup(word, true, true);
	}

	/** 按当前查词模式路由：hover 模式弹悬浮释义窗，drawer 模式打开抽屉面板 */
	lookupFromSelection(word: string, rect: DOMRect): void {
		if (this.settings.lookup.mode === "hover") {
			void this.ensurePanel().showAt(word, rect);
			return;
		}
		this.openLookup(word);
	}

	/** 打开面板并直接用 AI 解释（选中工具条的 AI 入口） */
	aiLookupWord(word: string): void {
		void this.ensurePanel().lookupAI(word);
	}

	/** AI 翻译（PDF 右键菜单入口）：整句翻译成中文 */
	aiTranslateText(text: string): void {
		void this.ensurePanel().lookupAIPrompt(
			text,
			"请将以下内容翻译成通顺自然的中文，只输出译文，不要解释：\n\n" + text,
		);
	}

	/** AI 详解（PDF 右键菜单入口）：整句/单词深度讲解 */
	aiExplainText(text: string): void {
		void this.ensurePanel().lookupAIPrompt(
			text,
			"请详细讲解以下内容：若是单词则给出词源、记忆技巧、词根词缀、用法例句；若是句子则逐句解释结构与含义。使用 Markdown 输出：\n\n" +
				text,
		);
	}

	/** 发音：mdd 音频（可关）→ 有道兜底（英/美可选）→ Free Dictionary 兜底（英/美可选）→ TTS */
	async speakWord(word: string): Promise<void> {
		const audio = this.settings.audio;
		// 1) 本地 mdd 音频
		if (audio.localEnabled) {
			for (const d of this.loadedDicts) {
				const r = d.lookup(word);
				if (r?.definition != null) {
					const sp = extractSoundPath(r.definition);
					if (sp && (await playMddAudio(d, sp))) return;
				}
			}
		}
		// 2) 有道在线兜底
		if (audio.youdaoEnabled && this.settings.online?.youdao?.enabled) {
			const entry = await this.youdao.query(word);
			if (entry) {
				const url =
					audio.youdaoVariant === 2
						? entry.audioUs || entry.audioBr
						: entry.audioBr || entry.audioUs;
				if (url && (await playAudioUrl(url))) return;
			}
		}
		// 3) Free Dictionary 轻量源兜底
		if (audio.freeEnabled && this.settings.online?.freeDict?.enabled) {
			const entry = await this.freeDict.query(word);
			if (entry) {
				const url =
					audio.freeVariant === "us"
						? entry.audioUs || entry.audioBr
						: entry.audioBr || entry.audioUs;
				if (url && (await playAudioUrl(url))) return;
			}
		}
		if (this.settings.tts.enabled) speakTTS(word, this.settings.tts.rate);
	}

	/** 收藏/取消收藏切换：未收藏则加入默认生词本，已收藏则从默认生词本移除 */
	async favWord(word: string, context?: string): Promise<void> {
		const faved = await this.isFavorited(word);
		if (faved) {
			await this.removeFromDefaultBook(word);
			return;
		}
		await this.addToDefaultBook(word, "", false, context);
		// auto 模式：收藏生词后自动同步到欧路（静默，失败不打断收藏）
		if (this.settings.eudic.enabled && this.settings.eudic.syncMode === "auto") {
			try {
				await this.eudicService.syncLocalToEudic([word]);
			} catch (error) {
				console.error("[LinguaNex] Auto eudic sync failed:", error);
			}
		}
	}

	/** 从默认生词本移除单词（取消收藏） */
	async removeFromDefaultBook(word: string): Promise<void> {
		const book = this.settings.vocab.defaultBook;
		if (!book || !word) return;
		await this.vocab.remove(book, word);
	}

	/** 取本地全部生词本单词（默认生词本优先，其余合并） */
	async allLocalWords(): Promise<string[]> {
		const books = await this.vocab.books();
		const words: string[] = [];
		for (const b of books) {
			const entries = await this.vocab.entries(b);
			for (const e of entries) {
				if (!words.includes(e.word)) words.push(e.word);
			}
		}
		return words;
	}

	/** 本地 → 欧路 手动同步（设置页调用），返回统计 */
	async syncLocalToEudicManual(): Promise<{ added: number; failed: number; skipped: number }> {
		const localWords = await this.allLocalWords();
		const res = await this.eudicService.syncLocalToEudic(localWords);
		return { added: res.added, failed: res.failed, skipped: res.skipped };
	}

	/** 欧路 → 本地 手动同步（设置页调用）：把欧路词导入默认生词本，返回统计 */
	async syncEudicToLocalManual(): Promise<{ imported: number; skipped: number }> {
		const res = await this.eudicService.syncEudicToLocal();
		const book = this.settings.vocab.defaultBook;
		const books = await this.vocab.books();
		if (!books.includes(book)) await this.vocab.createBook(book);
		const existing = (await this.vocab.entries(book)).map((e) => e.word.toLowerCase());
		let imported = 0;
		let skipped = 0;
		for (const w of res.words) {
			if (existing.includes(w.toLowerCase())) {
				skipped++;
				continue;
			}
			await this.vocab.add(book, {
				word: w,
				dictId: "__eudic__",
				definition: undefined,
				addedAt: Date.now(),
				reviewCount: 0,
			});
			imported++;
		}
		return { imported, skipped };
	}

	/** 判断单词是否已收藏到默认生词本（供收藏星标激活态显示） */
	async isFavorited(word: string): Promise<boolean> {
		const book = this.settings.vocab.defaultBook;
		if (!book || !word) return false;
		const list = await this.vocab.entries(book);
		return list.some((e) => e.word.toLowerCase() === word.toLowerCase());
	}

	async addToDefaultBook(
		word: string,
		definition?: string,
		silent = false,
		context?: string,
	): Promise<void> {
		const book = this.settings.vocab.defaultBook;
		const books = await this.vocab.books();
		if (!books.includes(book)) await this.vocab.createBook(book);
		// definition 不再写入词典原文 HTML —— 生词本只存单词 + 复习状态，复习时按词重新查词典
		const ctx = context
			? context.replace(/\s+/g, " ").trim().slice(0, 80)
			: undefined;
		await this.vocab.add(book, {
			word,
			dictId: "__manual__",
			addedAt: Date.now(),
			reviewCount: 0,
			context: ctx,
		});
		if (!silent) new Notice(`已收藏到「${book}」：${word}`);
	}

	private async openView(type: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type, active: true });
	}

	/** 打开生词复习页；book 指定时直接定位到该生词本 */
	async openReview(book?: string): Promise<void> {
		if (book) {
			const books = await this.vocab.books();
			if (books.includes(book)) {
				this.pendingReviewBook = book;
			}
		}
		await this.openView(VOCAB_REVIEW_VIEW);
	}
}

function baseName(p: string): string {
	const seg = p.split("/").filter(Boolean);
	return seg.length ? (seg[seg.length - 1] as string) : p;
}

function dirOf(p: string): string {
	const idx = p.lastIndexOf("/");
	return idx >= 0 ? p.slice(0, idx) : ".";
}

function dirName(p: string): string {
	const d = dirOf(p);
	const idx = d.lastIndexOf("/");
	const seg = idx >= 0 ? d.slice(idx + 1) : d;
	return seg || "未分组";
}
