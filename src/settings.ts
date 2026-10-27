import { App, Modal, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";
import type LinguaNexPlugin from "./main";
import type { AIConfig } from "./core/ai";
import { DEFAULT_PROMPT } from "./core/ai";

/** AI 预设 Provider：选择后自动填充 Base URL 与模型 */
export const AI_PROVIDERS: { name: string; baseUrl: string; model: string }[] = [
	{ name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
	{ name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
	{ name: "Moonshot (Kimi)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
	{ name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
	{ name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
	{ name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
	{ name: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "llama3" },
];

/** 柯林斯模板：一整套柯林斯 COBUILD 风格的嵌入提示词 */
export const COLLINS_PROMPT =
	"你是柯林斯 COBUILD 词典的资深编辑。请用 Markdown 解释给定单词，直接给出内容，不要序号列表，严格按以下标题组织输出：\n\n" +
	"## 单词\n用一级标题（# 单词）大号加粗展示英文单词本身，下一行用间隔点 · 自动分音节展示读音节奏（如 # dictionary，下方写 dic·tion·ar·y）。\n\n" +
	"## 音标\n英式/美式音标。\n\n" +
	"## 释义\n逐条给出中文释义：词性一律用英文缩写直接接中文解释，如 adj. 形容词释义 / n. 名词释义 / v. 动词释义，不要使用“词性：”等中文标注；多条义项用无序列表分行列出。\n\n" +
	"## 柯林斯释义\n用柯林斯式完整句子给出英英释义（如 A cat is an animal which...），通俗易懂。\n\n" +
	"## 双语例句\n给出 2-3 个地道例句，逐条附中文翻译。\n\n" +
	"## 常用搭配\n列出常用搭配、短语或惯用法，帮助实际使用。\n\n" +
	"## 词根词缀\n拆解词根/前缀/后缀并说明含义，辅助记忆。\n\n" +
	"## 词源演变\n简要说明单词由来与含义演变，作为补充知识帮助理解。\n\n" +
	"要求：结构清晰、简明扼要，不要寒暄，直接输出内容。";

/** 牛津模板：一整套牛津风格的嵌入提示词 */
export const OXFORD_PROMPT =
	"你是牛津英语词典的资深编辑。请用 Markdown 解释给定单词，直接给出内容，不要序号列表，严格按以下标题组织输出：\n\n" +
	"## 单词\n用一级标题（# 单词）大号加粗展示英文单词本身，下一行用间隔点 · 自动分音节展示读音节奏（如 # dictionary，下方写 dic·tion·ar·y）。\n\n" +
	"## 音标\n英式/美式音标。\n\n" +
	"## 释义\n逐条给出中文释义：词性一律用英文缩写直接接中文解释，如 adj. 形容词释义 / n. 名词释义 / v. 动词释义，不要使用“词性：”等中文标注；多条义项用无序列表分行列出。\n\n" +
	"## 牛津释义\n按义项分条给出英英释义，条理清晰，标注常用/正式/口语等语域。\n\n" +
	"## 双语例句\n给出 2-3 个地道例句，逐条附中文翻译。\n\n" +
	"## 常用短语\n列出固定搭配、习语或短语动词。\n\n" +
	"## 词根词缀\n拆解词根/前缀/后缀并说明含义，辅助记忆。\n\n" +
	"## 词源演变\n简要说明单词由来与含义演变，作为补充知识帮助理解。\n\n" +
	"要求：结构清晰、简明扼要，不要寒暄，直接输出内容。";

export interface DictItem {
	/** mdx 绝对路径（桌面）或 vault 内相对路径（移动端） */
	path: string;
	/** 同名 mdd 路径 */
	mddPath: string | null;
	/** 展示名（取自文件名） */
	name: string;
	enabled: boolean;
	/** 优先级，越大越靠前 */
	priority: number;
	/** 分组名（默认取所在目录名），用于设置页分类容器整理 */
	group: string;
}

export interface OnlineSourceConfig {
	enabled: boolean;
	/** 显示优先级：越大越靠前；本地词典 priority 从 1 起，默认 0 = 排在所有本地词典之后 */
	priority: number;
}

/** 句子翻译引擎配置：provider=mymemory 免 Key；provider=baidu 需开放平台 appid+secret */
export interface TranslateConfig extends OnlineSourceConfig {
	provider: "mymemory" | "baidu";
	baiduAppid: string;
	baiduSecret: string;
}

export interface LinguaNexSettings {
	dictDirs: string[];
	dictionaries: DictItem[];
	online: {
		youdao: OnlineSourceConfig;
		/** Free Dictionary API（dictionaryapi.dev），英文释义兜底源 */
		freeDict: OnlineSourceConfig;
		/** 句子翻译引擎（MyMemory 免 Key / 百度翻译开放平台） */
		translate: TranslateConfig;
	};
	ai: AIConfig;
	tts: {
		enabled: boolean;
		rate: number;
	};
	audio: {
		/** 有道发音变体：1=英式 2=美式（喇叭与在线兜底发音使用） */
		youdaoVariant: 1 | 2;
		/** 本地词典（mdd 内置音频）发音开关 */
		localEnabled: boolean;
		/** 有道在线兜底发音开关 */
		youdaoEnabled: boolean;
		/** Free Dictionary 轻量源发音开关 */
		freeEnabled: boolean;
		/** Free Dictionary 发音变体：uk=英式 us=美式 */
		freeVariant: "uk" | "us";
	};
	vocab: {
		defaultBook: string;
		enabled: boolean;
		/** 查词命中后自动加入默认生词本 */
		autoAddOnLookup: boolean;
		/** SM-2 复习算法参数（复习页「算法参数设置」折叠面板可调） */
		review: {
			/** 陌生评级后的间隔天数 */
			intervalNew: number;
			/** 渐熟评级后的间隔天数 */
			intervalFamiliar: number;
			/** 熟悉评级后的间隔天数 */
			intervalKnown: number;
			/** 认识评级 easeFactor 增加步长 */
			easeStep: number;
			/** 忘记评级 easeFactor 扣减量 */
			easePenalty: number;
			/** 模糊评级晋级（渐熟）所需连对次数 */
			hardStreak: number;
			/** 认识评级晋级（熟悉）所需连对次数 */
			goodStreak: number;
			/** 复习数据面板展示的未来天数 */
			planDays: number;
		};
	};
	lookup: {
		showFeatureBar: boolean;
		closeOnEsc: boolean;
		/** 关闭面板的按键（默认 Escape），可在 Obsidian 快捷键面板另行绑定「关闭查词面板」命令 */
		closeKey: string;
		previewMode: boolean;
		/** 查词方式：drawer=底部抽屉面板，hover=单词上方简洁悬浮窗 */
		mode: "drawer" | "hover";
		/** 选中单词后自动查词并弹出对应形态（悬浮/抽屉），无需再点「查词」；默认关闭 */
		autoLookup: boolean;
		/** 词典/AI 共存时 AI 区高度占比（0.2-0.6） */
		aiRatio: number;
	};
	pdf: {
		/** PDF 阅读器 textLayer 内双击查词 */
		lookupEnabled: boolean;
		/** PDF 阅读器选区右键菜单（查词/生词本/AI） */
		contextMenu: boolean;
	};
	eudic: {
		enabled: boolean;
		token: string;
		language: string;
		/** 目标分类 id，'0' 为默认生词本 */
		categoryId: string;
		/** manual=手动；auto=收藏生词时自动同步 */
		syncMode: "manual" | "auto";
	};
}

export const DEFAULT_SETTINGS: LinguaNexSettings = {
	dictDirs: [],
	dictionaries: [],
	online: {
		// 默认置末位（priority=0），可在设置中 ↑ 上移调整显示优先级
		youdao: { enabled: true, priority: 0 },
		// Free Dictionary 默认关闭，可在「已发现词典」列表中启用并参与统一排序
		freeDict: { enabled: false, priority: 0 },
		// 句子翻译默认关闭（MyMemory 免 Key，无需额外配置）
		translate: {
			enabled: false,
			priority: 0,
			provider: "mymemory",
			baiduAppid: "",
			baiduSecret: "",
		},
	},
	ai: {
		enabled: false,
		baseUrl: "https://api.openai.com/v1",
		apiKey: "",
		model: "gpt-4o-mini",
		prompt: "",
	},
	tts: {
		enabled: true,
		rate: 1,
	},
	audio: {
		youdaoVariant: 1,
		localEnabled: true,
		youdaoEnabled: true,
		freeEnabled: true,
		freeVariant: "uk",
	},
	vocab: {
		defaultBook: "默认生词本",
		enabled: true,
		autoAddOnLookup: false,
		// SM-2 默认参数：陌生1天 / 渐熟3天 / 熟悉7天，连对2次晋级渐熟、3次晋级熟悉
		review: {
			intervalNew: 1,
			intervalFamiliar: 3,
			intervalKnown: 7,
			easeStep: 0.1,
			easePenalty: 0.2,
			hardStreak: 2,
			goodStreak: 3,
			planDays: 30,
		},
	},
	lookup: {
		showFeatureBar: true,
		closeOnEsc: true,
		closeKey: "Escape",
		previewMode: false,
		mode: "drawer",
		autoLookup: false,
		aiRatio: 0.35,
	},
	pdf: {
		lookupEnabled: true,
		contextMenu: true,
	},
	eudic: {
		enabled: false,
		token: "",
		language: "en",
		categoryId: "0",
		syncMode: "manual",
	},
};

export class LinguaNexSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LinguaNexPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("LinguaNex 词典").setHeading();

		new Setting(containerEl)
			.setName("添加词典目录")
			.setDesc("输入关键字搜索 vault 内文件夹，有匹配项才显示补全列表；添加后自动扫描其中的 .mdx 词典。词典启用/移除见下方「已发现词典」。")
			.addText((text) => {
				text.setPlaceholder("搜索文件夹…");
				let timer: number | undefined;
				text.inputEl.addEventListener("input", () => {
					window.clearTimeout(timer);
					timer = window.setTimeout(() => this.renderDirSuggest(text.inputEl, suggestEl), 120);
				});
				text.inputEl.addEventListener("blur", () => {
					window.clearTimeout(timer);
					window.setTimeout(() => suggestEl.empty(), 180);
				});
			});

		const suggestEl = containerEl.createDiv({ cls: "lx-dir-suggest" });

		new Setting(containerEl)
	const dicts = this.plugin.settings.dictionaries;
	// 在线词典并入「已发现词典」同一列表统一排序（名字带 online 小标签，可与本地词典一起 ↑/↓ 排序）
	const onlineEntries: {
		key: keyof LinguaNexSettings["online"];
		name: string;
		meta: string;
	}[] = [
		{
			key: "youdao",
			name: "有道词典（在线）",
			meta: "dict.youdao.com · 联网查中文释义与英/美发音",
		},
		{
			key: "freeDict",
			name: "Free Dictionary（在线）",
			meta: "dictionaryapi.dev · 联网查英文释义与发音",
		},
		{
			key: "translate",
			name: "句子翻译（在线）",
			meta: "MyMemory 免 Key / 百度翻译开放平台 · 整句翻译",
		},
	];
	type DictRow =
		| { kind: "local"; d: DictItem }
		| { kind: "online"; cfg: OnlineSourceConfig; entry: (typeof onlineEntries)[number] };
	const rows: DictRow[] = [
		...dicts.map((d) => ({ kind: "local" as const, d })),
		...onlineEntries.map((entry) => ({
			kind: "online" as const,
			cfg: this.plugin.settings.online[entry.key],
			entry,
		})),
	].sort((a, b) => {
		const pa = a.kind === "local" ? a.d.priority : a.cfg.priority;
		const pb = b.kind === "local" ? b.d.priority : b.cfg.priority;
		return pb - pa;
	});

	/** 按当前合并列表顺序统一重排优先级（本地与在线一起），越靠前 priority 越大 */
	const saveOrder = async (): Promise<void> => {
		rows.forEach((r, i) => {
			const pr = rows.length - i;
			if (r.kind === "local") r.d.priority = pr;
			else r.cfg.priority = pr;
		});
		await this.plugin.saveSettings();
		this.plugin.refreshSources();
	};

	if (!rows.length) {
		containerEl.createEl("p", {
			text: "尚未发现词典，先填写目录并扫描。",
			cls: "lingua-nex-empty",
		});
	} else {
		const listBox = containerEl.createDiv({ cls: "lx-dict-list" });
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i];
			const isOnline = r.kind === "online";
			const name = isOnline ? r.entry.name : r.d.name;
			const meta = isOnline
				? r.entry.meta
				: `${r.d.mddPath ? "含音频 · " : ""}${r.d.path}`;
			const enabled = isOnline ? r.cfg.enabled : r.d.enabled;
			const row = listBox.createDiv({ cls: "lx-dict-row" });
			const info = row.createDiv({ cls: "lx-dict-info" });
			const nameEl = info.createDiv({ cls: "lx-dict-name" });
			nameEl.createSpan({ text: name });
			if (isOnline) {
				nameEl.createSpan({ cls: "lx-online-tag", text: "online" });
			}
			info.createDiv({ cls: "lx-dict-meta", text: meta });
			const toggle = row.createEl("button", {
				cls: "lx-sort-btn" + (enabled ? " on" : ""),
				text: enabled ? "已启用" : "停用",
			});
			toggle.title = isOnline ? "启用/停用该在线词典" : "启用/停用该词典";
			toggle.addEventListener("click", async () => {
				if (isOnline) {
					r.cfg.enabled = !r.cfg.enabled;
					await this.plugin.saveSettings();
				} else {
					r.d.enabled = !r.d.enabled;
					await this.plugin.saveSettings();
					await this.plugin.reloadDictionaries();
				}
				this.display();
			});
			if (i > 0) {
				const up = row.createEl("button", {
					cls: "lx-sort-btn",
					text: "↑",
				});
				up.title = "上移（提高优先级）";
				up.addEventListener("click", async () => {
					[rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
					await saveOrder();
					this.display();
				});
			}
			if (i < rows.length - 1) {
				const down = row.createEl("button", {
					cls: "lx-sort-btn",
					text: "↓",
				});
				down.title = "下移（降低优先级）";
				down.addEventListener("click", async () => {
					[rows[i], rows[i + 1]] = [rows[i + 1], rows[i]];
					await saveOrder();
					this.display();
				});
			}
			// 拖拽排序（桌面端直接拖行；移动端仍可用 ↑/↓ 按钮）
			row.draggable = true;
			row.dataset.idx = String(i);
			row.addEventListener("dragstart", (ev) => {
				(ev as DragEvent).dataTransfer?.setData("text/plain", String(i));
				row.addClass("lx-drag-src");
			});
			row.addEventListener("dragend", () =>
				row.removeClass("lx-drag-src"),
			);
			row.addEventListener("dragover", (ev) => ev.preventDefault());
			row.addEventListener("drop", (ev) => {
				ev.preventDefault();
				const from = Number(
					(ev as DragEvent).dataTransfer?.getData("text/plain"),
				);
				const to = Number(row.dataset.idx ?? i);
				if (Number.isNaN(from) || from === to) return;
				const [moved] = rows.splice(from, 1);
				rows.splice(to, 0, moved);
				void saveOrder().then(() => this.display());
			});
			if (!isOnline) {
				const del = row.createEl("button", {
					cls: "lx-sort-btn lx-danger",
					text: "✕",
				});
				del.title = "移出列表（不删除词典文件）";
				del.addEventListener("click", async () => {
					this.plugin.settings.dictionaries =
						this.plugin.settings.dictionaries.filter(
							(x) => x.path !== r.d.path,
						);
					// 联动清理已无词典的目录，避免下次扫描又把词典加回来
					const rest = this.plugin.settings.dictionaries;
					this.plugin.settings.dictDirs =
						this.plugin.settings.dictDirs.filter((dir) => {
							const prefix = dir === "" ? "" : `${dir}/`;
							return rest.some((x) => x.path.startsWith(prefix));
						});
					await this.plugin.saveSettings();
					await this.plugin.reloadDictionaries();
					this.display();
				});
			}
		}
	}


		new Setting(containerEl).setName("查词").setHeading();

		new Setting(containerEl)
			.setName("查词方式")
			.setDesc("抽屉 = 从底部弹出查词面板；悬浮窗 = 在单词上方弹出简洁无阴影悬浮窗（适合边读边查）")
			.addDropdown((d) => {
				d.addOption("drawer", "抽屉面板");
				d.addOption("hover", "简洁悬浮窗");
				d.setValue(this.plugin.settings.lookup.mode);
				d.onChange(async (v) => {
					this.plugin.settings.lookup.mode = v === "hover" ? "hover" : "drawer";
					await this.plugin.saveSettings();
					this.plugin.setLookupMode(this.plugin.settings.lookup.mode);
				});
			});

		new Setting(containerEl)
			.setName("选中取词工具条")
			.setDesc("在编辑器中选中单词后显示查词/发音/收藏工具条")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.lookup.showFeatureBar)
					.onChange(async (v) => {
						this.plugin.settings.lookup.showFeatureBar = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("选中自动查词")
			.setDesc("开启后选中单词即自动查词并弹出对应形态（悬浮窗/抽屉面板），无需再点「查词」；默认关闭")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.lookup.autoLookup)
					.onChange(async (v) => {
						this.plugin.settings.lookup.autoLookup = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("按键关闭面板")
			.setDesc("开启后按下方捕获的按键关闭查词面板（默认 Escape）；也可在 Obsidian「快捷键」中给「关闭查词面板」命令绑定任意热键。")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.lookup.closeOnEsc)
					.onChange(async (v) => {
						this.plugin.settings.lookup.closeOnEsc = v;
						await this.plugin.saveSettings();
					}),
			)
			.addText((t) => {
				t
					.setPlaceholder("Escape")
					.setValue(this.plugin.settings.lookup.closeKey)
					.onChange(async (v) => {
						this.plugin.settings.lookup.closeKey = v.trim() || "Escape";
						await this.plugin.saveSettings();
					});
				const inp = t.inputEl;
				inp.addEventListener("focus", () => {
					inp.value = "";
					inp.addEventListener(
						"keydown",
						(e) => {
							e.preventDefault();
							const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
							inp.value = key;
							this.plugin.settings.lookup.closeKey = key;
							void this.plugin.saveSettings();
							inp.blur();
						},
						{ once: true },
					);
				});
				inp.addEventListener("blur", () => {
					if (!inp.value.trim()) {
						inp.value = this.plugin.settings.lookup.closeKey || "Escape";
					}
				});
			});

		new Setting(containerEl).setName("句子翻译引擎").setHeading();
		const trCfg = this.plugin.settings.online.translate;
		const trInfo = containerEl.createEl("p", {
			text:
				"在「词典管理」中启用「在线翻译」后，查词/复习面板会按启用排序显示翻译结果。" +
				(trCfg.provider === "mymemory"
					? "当前：MyMemory（免 Key，整句翻译，每日有免费额度）"
					: "当前：百度翻译开放平台（需 appid 与密钥）"),
			cls: "lingua-nex-empty",
		});
		trInfo.addClass("lx-tr-info");
		new Setting(containerEl)
			.setName("翻译引擎")
			.setDesc("MyMemory 免 Key 可直接用；百度翻译需前往 fanyi-api.baidu.com 申请开放平台密钥")
			.addDropdown((dd) => {
				dd.addOption("mymemory", "MyMemory（免 Key）");
				dd.addOption("baidu", "百度翻译");
				dd.setValue(trCfg.provider);
				dd.onChange(async (v) => {
					trCfg.provider = v as "mymemory" | "baidu";
					await this.plugin.saveSettings();
					this.display();
				});
			});
		if (trCfg.provider === "baidu") {
			new Setting(containerEl)
				.setName("百度翻译 APP ID")
				.setDesc("开放平台应用的 APP ID")
				.addText((t) => {
					t.setPlaceholder("请输入 APP ID").setValue(trCfg.baiduAppid);
					t.onChange(async (v) => {
						trCfg.baiduAppid = v.trim();
						await this.plugin.saveSettings();
					});
				});
			new Setting(containerEl)
				.setName("百度翻译密钥")
				.setDesc("开放平台应用的密钥（Secret Key）")
				.addText((t) => {
					t.inputEl.type = "password";
					t.setPlaceholder("请输入密钥").setValue(trCfg.baiduSecret);
					t.onChange(async (v) => {
						trCfg.baiduSecret = v.trim();
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl).setName("发音").setHeading();

		new Setting(containerEl)
			.setName("有道发音变体")
			.setDesc("点 🔊 或在线兜底发音时，有道默认用英式（英音）；切为美式则优先用美音")
			.addDropdown((dd) =>
				dd
					.addOption("1", "英式（默认）")
					.addOption("2", "美式")
					.setValue(String(this.plugin.settings.audio.youdaoVariant))
					.onChange(async (v) => {
						this.plugin.settings.audio.youdaoVariant = v === "2" ? 2 : 1;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("本地词典发音")
			.setDesc("使用 mdd 内置音频（词典带音频时优先于在线源）")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.audio.localEnabled)
					.onChange(async (v) => {
						this.plugin.settings.audio.localEnabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("有道在线兜底发音")
			.setDesc("本地词典无声时用有道 dictvoice 兜底（需「已发现词典」中有道在线源处于启用状态）")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.audio.youdaoEnabled)
					.onChange(async (v) => {
						this.plugin.settings.audio.youdaoEnabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("轻量源发音（Free Dictionary）")
			.setDesc("本地与有道都无声时，用 Free Dictionary 在线音频兜底（需「已发现词典」中 Free Dictionary 处于启用状态）")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.audio.freeEnabled)
					.onChange(async (v) => {
						this.plugin.settings.audio.freeEnabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Free Dictionary 发音变体")
			.setDesc("轻量源兜底发音的英式/美式选择")
			.addDropdown((dd) =>
				dd
					.addOption("uk", "英式（默认）")
					.addOption("us", "美式")
					.setValue(this.plugin.settings.audio.freeVariant)
					.onChange(async (v) => {
						this.plugin.settings.audio.freeVariant = v === "us" ? "us" : "uk";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("系统 TTS 兜底发音")
			.setDesc("mdd 无音频时使用浏览器语音合成朗读词头")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.tts.enabled)
					.onChange(async (v) => {
						this.plugin.settings.tts.enabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("PDF 阅读查词").setHeading();

		new Setting(containerEl)
			.setName("PDF 双击查词")
			.setDesc("在 PDF 阅读器（pdf.js textLayer）中双击英文单词直接查词，自动处理跨行断词/连字/软连字符")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.pdf.lookupEnabled)
					.onChange(async (v) => {
						this.plugin.settings.pdf.lookupEnabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("PDF 选区右键菜单")
			.setDesc("在 PDF 中选中英文后右键弹出菜单：查词 / 加入生词本 / AI 翻译 / AI 详解")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.pdf.contextMenu)
					.onChange(async (v) => {
						this.plugin.settings.pdf.contextMenu = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("AI 释义（OpenAI 兼容）").setHeading();

		new Setting(containerEl)
			.setName("启用 AI 释义")
			.setDesc("词典未命中时调用大模型补全释义（需自行配置）")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.ai.enabled)
					.onChange(async (v) => {
						this.plugin.settings.ai.enabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("预设 Provider")
			.setDesc("选择后自动填充 Base URL 与模型，再填入你的 API Key 即可使用")
			.addDropdown((d) => {
				d.addOption("", "选择预设…");
				for (const p of AI_PROVIDERS) d.addOption(p.name, p.name);
				d.onChange(async (v) => {
					const p = AI_PROVIDERS.find((x) => x.name === v);
					if (!p) return;
					this.plugin.settings.ai.baseUrl = p.baseUrl;
					this.plugin.settings.ai.model = p.model;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("API Base URL")
			.addText((t) =>
				t
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.ai.baseUrl)
					.onChange(async (v) => {
						this.plugin.settings.ai.baseUrl = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API Key")
			.addText((t) => {
				t
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.ai.apiKey)
					.onChange(async (v) => {
						this.plugin.settings.ai.apiKey = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("模型")
			.addText((t) =>
				t
					.setPlaceholder("gpt-4o-mini")
					.setValue(this.plugin.settings.ai.model)
					.onChange(async (v) => {
						this.plugin.settings.ai.model = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("温度 temperature（可选）")
			.setDesc("随机性：0 更稳定精确，1 更有创意；留空用默认 0.7")
			.addText((t) =>
				t
					.setPlaceholder("0.7")
					.setValue(
						this.plugin.settings.ai.temperature == null
							? ""
							: String(this.plugin.settings.ai.temperature),
					)
					.onChange(async (v) => {
						const n = parseFloat(v);
						this.plugin.settings.ai.temperature = Number.isFinite(n)
							? Math.min(2, Math.max(0, n))
							: undefined;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("最大输出 tokens（可选）")
			.setDesc("限制单次回答长度；留空由服务端默认")
			.addText((t) =>
				t
					.setPlaceholder("例如 1024")
					.setValue(
						this.plugin.settings.ai.maxTokens == null
							? ""
							: String(this.plugin.settings.ai.maxTokens),
					)
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						this.plugin.settings.ai.maxTokens = Number.isFinite(n) && n > 0
							? n
							: undefined;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("提示词模板")
			.setDesc("默认/柯林斯/牛津为内置提示词，选择后自动写入下方自定义框；「不使用模板」清空内容由你自行编写")
			.addDropdown((d) => {
				const cur = this.plugin.settings.ai.prompt;
				d.addOption("default", "默认标准提示词");
				d.addOption("collins", "柯林斯式提示词");
				d.addOption("oxford", "牛津式提示词");
				d.addOption("none", "不使用模板（自定义）");
				if (cur === DEFAULT_PROMPT) d.setValue("default");
				else if (cur === COLLINS_PROMPT) d.setValue("collins");
				else if (cur === OXFORD_PROMPT) d.setValue("oxford");
				else d.setValue("none");
				d.onChange(async (v) => {
					if (v === "default") {
						this.plugin.settings.ai.prompt = DEFAULT_PROMPT;
					} else if (v === "collins") {
						this.plugin.settings.ai.prompt = COLLINS_PROMPT;
					} else if (v === "oxford") {
						this.plugin.settings.ai.prompt = OXFORD_PROMPT;
					} else {
						this.plugin.settings.ai.prompt = "";
					}
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("自定义提示词（可选）")
			.setDesc("注入 AI 系统提示词，自定义解释风格；留空使用内置词典编辑风格")
			.addTextArea((t) =>
				t
					.setPlaceholder("你是资深英语词典编辑…")
					.setValue(this.plugin.settings.ai.prompt)
					.onChange(async (v) => {
						this.plugin.settings.ai.prompt = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("连通性检查")
			.setDesc("验证 Base URL + API Key 能否成功调用服务（请求 /models 列表，15 秒超时）")
			.addButton((b) =>
				b.setButtonText("测试连接").setCta().onClick(async () => {
					const btn = b.buttonEl;
					const oldText = btn.textContent ?? "测试连接";
					btn.textContent = "测试中…";
					btn.disabled = true;
					try {
						const info = await this.checkAiConnection();
						new Notice(`AI 连通成功：${info}`);
					} catch (e: any) {
						new Notice(`AI 连接失败：${e?.message ?? "未知错误"}`);
					} finally {
						btn.textContent = oldText;
						btn.disabled = false;
					}
				}),
			);

		new Setting(containerEl).setName("生词本").setHeading();

		new Setting(containerEl)
			.setName("默认生词本")
			.setDesc("搜索选择已有生词本；收藏单词时若生词本不存在会自动创建")
			.addText((text) => {
				text.setPlaceholder("搜索生词本…");
				text.inputEl.addEventListener("input", () => {
					void this.renderBookSuggest(text.inputEl, bookSuggestEl);
				});
				text.inputEl.addEventListener("blur", () => {
					window.setTimeout(() => bookSuggestEl.empty(), 180);
				});
			})
			.addExtraButton((b) => {
				b.setIcon("library-big");
				b.setTooltip("打开词典管理/生词本管理");
				b.onClick(() => void this.openView("lingua-nex-manager"));
			});

		const bookSuggestEl = containerEl.createDiv({ cls: "lx-dir-suggest" });

		new Setting(containerEl)
			.setName("查词自动加入生词本")
			.setDesc("查词命中词典释义后，自动将单词加入默认生词本")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.vocab.autoAddOnLookup)
					.onChange(async (v) => {
						this.plugin.settings.vocab.autoAddOnLookup = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("欧路词典同步").setHeading();

		containerEl.createEl("p", {
			text: "将 Obsidian 生词本与欧路词典 App 双向同步。Token 获取：欧路词典官网 → 个人中心 → 开放 API（https://my.eudic.net/OpenAPI）。",
			cls: "lingua-nex-hint",
		});

		new Setting(containerEl)
			.setName("启用欧路同步")
			.setDesc("开启后可手动或自动将生词同步到欧路词典 App，多端共享词库")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.eudic.enabled)
					.onChange(async (v) => {
						this.plugin.settings.eudic.enabled = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API Token")
			.setDesc("欧路词典 OpenAPI Token（含密钥，仅保存在本机 data.json，不会上传）")
			.addText((text) => {
				text
					.setPlaceholder("输入你的 API Token")
					.setValue(this.plugin.settings.eudic.token)
					.onChange(async (value) => {
						this.plugin.settings.eudic.token = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
			})
			.addButton((b) => {
				b.setButtonText("测试连接").onClick(async () => {
					b.setDisabled(true);
					b.setButtonText("测试中…");
					const res = await this.plugin.eudicService.testConnection();
					if (res.ok) {
						b.setButtonText("连接成功 ✓");
						b.setCta();
						new Notice(`✓ 欧路连接成功：${res.message}`);
					} else {
						b.setButtonText("连接失败 ✗");
						b.setWarning();
						new Notice(`✗ ${res.message}`);
					}
					window.setTimeout(() => {
						b.setDisabled(false);
						b.setButtonText("测试连接");
						b.removeCta();
					}, 3000);
				});
			});

		new Setting(containerEl)
			.setName("语言")
			.setDesc("生词本对应的语言")
			.addDropdown((d) => {
				d.addOption("en", "英语")
					.addOption("fr", "法语")
					.addOption("de", "德语")
					.addOption("es", "西班牙语")
					.addOption("ja", "日语")
					.setValue(this.plugin.settings.eudic.language)
					.onChange(async (v) => {
						this.plugin.settings.eudic.language = v;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("同步模式")
			.setDesc("手动：点击下方按钮同步；自动：每次收藏生词时自动同步到欧路")
			.addDropdown((d) => {
				d.addOption("manual", "手动同步")
					.addOption("auto", "自动同步")
					.setValue(this.plugin.settings.eudic.syncMode)
					.onChange(async (v) => {
						this.plugin.settings.eudic.syncMode = v as "manual" | "auto";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("同步操作")
			.setDesc("手动触发双向同步：本地 → 欧路（新增缺失词） / 欧路 → 本地（导入默认生词本）")
			.addButton((b) => {
				b.setButtonText("本地 → 欧路").onClick(async () => {
					b.setDisabled(true);
					b.setButtonText("同步中…");
					try {
						const r = await this.plugin.syncLocalToEudicManual();
						new Notice(
							r.added === 0
								? `✓ 已是最新（本地 ${r.skipped} 词已在欧路）`
								: `✓ 新增 ${r.added} 词${r.failed ? `，失败 ${r.failed}` : ""}`,
						);
					} catch (error) {
						new Notice(`同步失败：${(error as Error).message}`);
					}
					b.setDisabled(false);
					b.setButtonText("本地 → 欧路");
				});
			})
			.addButton((b) => {
				b.setButtonText("欧路 → 本地").onClick(async () => {
					b.setDisabled(true);
					b.setButtonText("同步中…");
					try {
						const r = await this.plugin.syncEudicToLocalManual();
						new Notice(`✓ 导入 ${r.imported} 词，跳过 ${r.skipped} 词`);
					} catch (error) {
						new Notice(`同步失败：${(error as Error).message}`);
					}
					b.setDisabled(false);
					b.setButtonText("欧路 → 本地");
				});
			});

		containerEl.createEl("p", {
			text: "提示：快捷键统一在 Obsidian「设置 → 快捷键」中搜索 LinguaNex 修改（默认：查词 Ctrl/Cmd+Shift+D；关闭面板 Escape；词典管理、生词复习、收藏选中词均有对应命令）。",
			cls: "lingua-nex-hint",
		});

		// 帮助与常见问题：问号入口，打开说明面板
		new Setting(containerEl).setName("帮助与常见问题").setHeading();
		new Setting(containerEl)
			.setName("插件介绍与问题解决")
			.setDesc("查看功能说明、手动/自动同步机制、常见问题与排查方法")
			.addButton((b) => {
				b.setButtonText("打开帮助 ?").onClick(() => {
					new LinguaNexHelpDrawer(this.app, this).open();
				});
			});
	}

	/** 帮助面板内容（公开给帮助弹窗复用） */
	buildHelpBody(containerEl: HTMLElement): void {
		const sec = (title: string): HTMLElement => {
			new Setting(containerEl).setName(title).setHeading();
			return containerEl;
		};
		const para = (text: string): void => {
			containerEl.createEl("p", { text, cls: "lx-help-p" });
		};
		const list = (items: string[]): void => {
			const ul = containerEl.createEl("ul", { cls: "lx-help-ul" });
			for (const it of items) ul.createEl("li", { text: it });
		};

		sec("这是什么");
		para(
			"LinguaNex 是一款本地优先的词典查词插件：加载 .mdx/.mdd 词典离线查词，可叠加在线词典（有道、Free Dictionary）与 AI 释义，支持生词本与 SM-2 间隔复习、PDF 内双击查词、欧路词典双向同步。查词方式可在「抽屉（顶部下拉）」与「悬浮窗（选中词旁弹出）」之间切换。",
		);

		sec("手动同步 vs 自动同步（欧路词典）");
		para(
			"欧路同步用于把 LinguaNex 收藏的生词同步到欧路词典 App 的生词本，反向也可导入。两种模式区别：",
		);
		list([
			"手动同步：在设置页点「本地 → 欧路」或「欧路 → 本地」按钮，点击一次同步一次，适合批量导入/导出。",
			"自动同步：不是定时任务、也不按分钟轮询；勾选启用后，你在查词面板或复习页点击「收藏」时，会立即把该单词静默推送到欧路生词本，无需手动操作。",
			"切换同步模式后，请先点「测试连接」确认 Token 与服务器地址可用，再保存设置。",
		]);

		sec("查词与发音");
		list([
			"选中单词后点工具条「查词」：抽屉模式打开顶部面板，悬浮窗模式在单词旁弹出卡片。",
			"发音优先级：词典内置音频（mdd）→ 有道在线发音 → 系统 TTS（需在设置中开启）。",
			"PDF 内查词：在 PDF 阅读器中双击单词或右键菜单即可触发，需先在设置中开启「PDF 查词」。",
			"悬浮窗内滚动内容时，顶部栏会自动上滑收起腾出空间；点击面板外空白或右上角 ✕ 即可关闭。",
		]);

		sec("AI 释义与追问");
		para(
			"AI 释义需要在设置中填写 Base URL 与 API Key（支持 OpenAI 兼容接口，内置多家预设）。词典未命中时可直接点「AI 释义」Tab 请求解释，也可以对同一单词连续追问，上下文会自动保留。",
		);

		sec("常见问题");
		list([
			"查词无结果：确认词典已启用、词条拼写正确；部分词典不收录派生词/大小写变形，可换 AI 释义兜底。",
			"发音不响：大体积 mdd（超 80MB）在移动端可能被跳过加载，此时会自动走有道在线发音或 TTS。",
			"AI 一直失败：检查 Base URL 末尾是否以 /v1 结尾、API Key 是否有效、模型名是否在服务商列表内（可点「测试连接」验证）。",
			"悬浮窗遮挡单词：已按你的选择加宽加长并缩小内容字号；仍觉不适可滚动让顶部栏收起，或切换到抽屉模式。",
			"重新打开 Obsidian 时面板闪现：面板默认不再预渲染触发，只有查词时才弹出，不会再闪。",
			"复习列表为空：生词按 SM-2 算法排期，新收藏词通常在次日才进入到期队列，属正常现象。",
		]);
	}

	/** AI 连通性检查：请求 /models 列表验证 Base URL + API Key */
	private async checkAiConnection(): Promise<string> {
		const cfg = this.plugin.settings.ai;
		const base = (cfg.baseUrl || "").trim().replace(/\/+$/, "");
		if (!base || !cfg.apiKey) {
			throw new Error("请先填写 Base URL 与 API Key");
		}
		const ctrl = new AbortController();
		const timer = window.setTimeout(() => ctrl.abort(), 15000);
		try {
			const resp = await fetch(`${base}/models`, {
				headers: { Authorization: `Bearer ${cfg.apiKey}` },
				signal: ctrl.signal,
			});
			if (!resp.ok) {
				const body = await resp.text().catch(() => "");
				throw new Error(`HTTP ${resp.status} ${body.slice(0, 120)}`);
			}
			const data = await resp.json();
			const models: string[] = Array.isArray(data?.data)
				? data.data
						.map((m: any) => (m && typeof m.id === "string" ? m.id : ""))
						.filter(Boolean)
				: [];
			if (models.length && !models.includes(cfg.model.trim())) {
				return `服务可达（当前模型 ${cfg.model || "未填"} 不在列表中，可用：${models
					.slice(0, 5)
					.join("、")}${models.length > 5 ? "…" : ""}）`;
			}
			return "服务可达，模型可用";
		} finally {
			window.clearTimeout(timer);
		}
	}

	/** 递归列出 vault 内全部文件夹（相对路径，根目录为 ""） */
	private listAllFolders(): string[] {
		// 直接走 Obsidian 内存文件树（getRoot().children），不发起任何文件系统 I/O，毫秒级返回。
		const out: string[] = [];
		const walk = (folder: TFolder): void => {
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					out.push(child.path);
					walk(child);
				}
			}
		};
		walk(this.app.vault.getRoot());
		return out;
	}

	/** 渲染词典目录搜索补全 */
	private renderDirSuggest(input: HTMLInputElement, box: HTMLElement): void {
		const kw = input.value.trim().toLowerCase();
		if (!kw) {
			box.empty();
			return;
		}
		const folders = this.listAllFolders();
		if (document.activeElement !== input) {
			box.empty();
			return;
		}
		const filtered = folders.filter(
			(f) =>
				f.toLowerCase().includes(kw) ||
				(f.split("/").pop() ?? "").toLowerCase().includes(kw),
		);
		box.empty();
		if (!filtered.length) return;
		for (const f of filtered.slice(0, 20)) {
			const item = box.createDiv({
				text: f || "/（vault 根目录）",
				cls: "lx-suggest-item",
			});
			item.addEventListener("click", () => {
				void this.addDictDir(f);
			});
		}
	}

	/** 添加词典目录：记录并扫描 */
	private async addDictDir(dir: string): Promise<void> {
		if (this.plugin.settings.dictDirs.includes(dir)) {
			new Notice(`目录已添加：${dir || "/"}`);
			return;
		}
		this.plugin.settings.dictDirs.push(dir);
		await this.plugin.saveSettings();
		await this.plugin.scanAndRefresh();
		this.display();
	}

	/** 渲染生词本搜索补全 */
	private async renderBookSuggest(
		input: HTMLInputElement,
		box: HTMLElement,
	): Promise<void> {
		const kw = input.value.trim().toLowerCase();
		if (!kw) {
			box.empty();
			return;
		}
		const books = await this.plugin.vocab.books();
		if (document.activeElement !== input) {
			box.empty();
			return;
		}
		const filtered = books.filter((b) => b.toLowerCase().includes(kw));
		box.empty();
		if (!filtered.length) return;
		for (const b of filtered.slice(0, 20)) {
			const item = box.createDiv({ text: b, cls: "lx-suggest-item" });
			item.addEventListener("click", async () => {
				this.plugin.settings.vocab.defaultBook = b;
				await this.plugin.saveSettings();
				input.value = b;
				box.empty();
				new Notice(`默认生词本已设为：${b}`);
				this.display();
			});
		}
	}

	private async openView(type: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type, active: true });
	}
}

/**
 * 帮助与常见问题底部抽屉：从下往上弹出约 60% 屏高，列表滑动查看。
 * 自绘半屏抽屉（替代占满全屏的原生 Modal），复用设置页的帮助正文渲染。
 */
export class LinguaNexHelpDrawer {
	private backdrop: HTMLElement | null = null;
	private root: HTMLElement | null = null;

	constructor(
		app: App,
		private tab: LinguaNexSettingTab,
	) {}

	open(): void {
		if (this.root) return;
		this.backdrop = document.body.createDiv({ cls: "lx-help-backdrop" });
		this.root = document.body.createDiv({ cls: "lx-help-drawer" });
		const header = this.root.createDiv({ cls: "lx-help-drawer-header" });
		header.createSpan({
			cls: "lx-help-drawer-title",
			text: "LinguaNex 帮助与常见问题",
		});
		const close = header.createEl("button", {
			cls: "lx-icon-btn",
			text: "✕",
			attr: { "aria-label": "关闭" },
		});
		close.addEventListener("click", () => this.close());
		const body = this.root.createDiv({ cls: "lx-help-drawer-body" });
		this.tab.buildHelpBody(body);
		this.backdrop.addEventListener("click", () => this.close());
		// 下一帧再加 shown 类，让 translateY 过渡动画生效
		requestAnimationFrame(() => {
			this.backdrop?.addClass("shown");
			this.root?.addClass("shown");
		});
		this.root.addEventListener("keydown", (e) => {
			if (e.key === "Escape") this.close();
		});
	}

	close(): void {
		this.backdrop?.removeClass("shown");
		this.root?.removeClass("shown");
		window.setTimeout(() => {
			this.backdrop?.detach();
			this.root?.detach();
			this.backdrop = null;
			this.root = null;
		}, 260);
	}
}
