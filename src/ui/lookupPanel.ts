import { MarkdownRenderer, Component, MarkdownView, Platform, type Editor, type EditorPosition } from "obsidian";
import type LinguaNexPlugin from "../main";
import type { LinguaNexMdict } from "../core/mdict";
import type { DictResources } from "../core/resources";
import { aiLookupStream, type AIConfig, type ChatMessage } from "../core/ai";
import { playAudioUrl, playMddAudio, speakTTS, extractSoundPath } from "../core/audio";
import { type YoudaoEntry } from "../core/onlineDict";
import { dlog, getDebugLog, onDebugLog } from "../core/debugLog";

export interface LookupSource {
	id: string;
	name: string;
	mdict?: LinguaNexMdict;
	resources?: DictResources;
	isAI?: boolean;
	/** 在线词典源（如有道），无需本地 mdict */
	isOnline?: boolean;
	/** 显示优先级：越大越靠前（本地词典 1..N，有道默认 0） */
	priority?: number;
}

interface HistoryItem {
	word: string;
	sourceId: string;
	aiHtml?: string;
}

const MAX_HISTORY = 64;

/** 展示名缩短：去常见后缀，超长截断加省略号 */
function shortName(name: string, maxLen = 12): string {
	let s = name.trim();
	s = s.replace(/\.(mdx|mdd|Mdx|MDX|Mdd|MDD)$/, "");
	if (s.length <= maxLen) return s;
	return s.slice(0, Math.max(1, maxLen - 1)) + "…";
}

function mimeByExt(key: string): string {
	const ext = "." + (key.split(".").pop() ?? "").toLowerCase();
	switch (ext) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".svg":
			return "image/svg+xml";
		case ".css":
			return "text/css";
		case ".js":
			return "text/javascript";
		case ".mp3":
			return "audio/mpeg";
		default:
			return "application/octet-stream";
	}
}

export class LookupPanel {
	private root: HTMLElement;
	private backdrop: HTMLElement;
	private input: HTMLInputElement;
	private searchMini: HTMLInputElement;
	private contentWrap: HTMLElement;
	private contentInner: HTMLElement;
	private iframe: HTMLIFrameElement;
	private tabsEl: HTMLElement;
	private topEl: HTMLElement;
	/** 顶部插件名+输入框行：悬浮形态收窄后作为常驻拖拽把手 */
	private headerEl: HTMLElement;
	private closeBtn: HTMLElement;
	private prevBtn: HTMLElement;
	private nextBtn: HTMLElement;
	private prevWordLabel: HTMLElement;
	private speakBtn: HTMLElement;
	private favBtn: HTMLElement;
	private statusEl: HTMLElement;
	private statusTag: HTMLElement;
	private statusCount: HTMLElement;
	private statusText: HTMLElement;
	private scrollbarThumb: HTMLElement;
	private scrollTimer: number | null = null;
	private divider: HTMLElement | null = null;
	private aiHolder: HTMLElement | null = null;
	private aiScroll: HTMLElement | null = null;
	/** 未命中占位：切源未命中时中间区域也切换显示提示，避免残留上一源内容 */
	private missEl: HTMLElement | null = null;
	private aiAskInput: HTMLInputElement | null = null;
	/** 追问条根节点：默认向下收起，只有 AI 内容真正生成完成后才向上滑出 */
	private askBar: HTMLElement | null = null;
	/** 状态文字自动清除定时器（见 setStatus） */
	private statusClearTimer: number | null = null;
	/** 笔记入口按钮（底部行 ‹ › 左侧）与对应的浮层 */
	private noteBtn: HTMLElement | null = null;
	private notePop: HTMLElement | null = null;
	private noteInput: HTMLTextAreaElement | null = null;
	private noteHint: HTMLElement | null = null;
	private notePopOpen = false;
	/** 展开笔记浮层时归属的单词：换词即自动收起，避免笔记写串词 */
	private noteWordAtOpen = "";
	private aiContext: ChatMessage[] = [];
	private mdComp: Component | null = null;
	/** AI 释义缓存：key = 源|单词|提示词，value = 已生成的 Markdown；面板未关闭前切换源复用，不重复请求 */
	private aiCache = new Map<string, string>();

	private sources: LookupSource[] = [];
	private activeSourceId = "";
	private history: HistoryItem[] = [];
	private histIdx = -1;
	private currentDoc = "";
	/** 当前词条的有道在线结果（在线 Tab 查询后记录，供 🔊 发音直接播放 dictvoice） */
	private currentOnline: YoudaoEntry | null = null;
	private aiAbort: AbortController | null = null;
	private shown = false;
	private sourceSwitchEl: HTMLElement | null = null;
	private floatClose: HTMLElement;
	/** 查词面板打开前的来源焦点：关闭时归还，支持查完继续输入 */
	private savedFocus: { editor: Editor | null; pos: EditorPosition | null; el: HTMLElement | null } | null = null;
	/** 悬浮窗拖动/缩放状态（仅 lx-floating 形态生效，抽屉形态不参与） */
	private dragState: { pid: number; sx: number; sy: number; ox: number; oy: number } | null = null;
	private resizeState: { pid: number; dir: string; sx: number; sy: number; r: DOMRect } | null = null;
	private resizeHandles: HTMLElement[] = [];

	constructor(private plugin: LinguaNexPlugin) {
		// 顶部下拉抽屉：外部遮罩，点击面板以外区域即收回
		this.backdrop = document.body.createDiv({ cls: "lingua-nex-backdrop" });
		this.root = document.body.createDiv({ cls: "lingua-nex-panel" });
		// 内联 display:none 兜底：插件样式表在 Obsidian 启动时可能晚于构造就绪，
		// 若仅依赖 CSS 隐藏，首帧会以无样式状态渲染出顶部内容块（启动闪一下）。
		// 内联样式不依赖 CSS 注入时序，显示前清除即可。
		this.root.style.setProperty("display", "none");
		// 顶部仅保留 header（插件名/输入框/关闭钮）：悬浮形态常驻吸顶不收起；词典 Tab 已移入内容滚动区顶部随内容上走
		this.topEl = this.root.createDiv({ cls: "lx-top" });
		const topEl = this.topEl;
		this.headerEl = topEl.createDiv({ cls: "lx-header" });
		const header = this.headerEl;
		header.createSpan({ cls: "lx-title", text: "LinguaNex" });
		// 顶部原“第几个词 3/4”位置改为显示上一个查的词，点击可切回
		this.prevWordLabel = header.createEl("button", {
			cls: "lx-prev-word",
			attr: { "aria-label": "查看上一个查的词" },
		});
		// 顶部大输入框保留作兜底：底部迷你搜索太小或不喜欢时仍可用
		this.input = header.createEl("input", { cls: "lx-input lx-input-top", attr: { placeholder: "输入单词…", spellcheck: "false" } });
		this.closeBtn = header.createEl("button", { cls: "lx-icon-btn lx-close", attr: { "aria-label": "关闭" } });
		this.closeBtn.setText("✕");

		// 悬浮窗常驻关闭钮：悬浮形态始终显示，兜底随时可关闭
		this.floatClose = this.root.createDiv({
			cls: "lx-float-close",
			attr: { "aria-label": "关闭" },
		});
		this.floatClose.setText("✕");

		this.contentWrap = this.root.createDiv({ cls: "lx-content-wrap" });
		// 词典 + 分隔线 + AI 区在 inner 内统一滚动：词典全文、AI 回答均为内容自适应高度，超高整体滚动
		this.contentInner = this.contentWrap.createDiv({ cls: "lx-content-inner" });
		// 词典切换 Tab 与内容合为一体：作为滚动区顶部第一块，下缘贴内容上缘，滑动时随内容自然上走，无联动动画无遮挡
		this.tabsEl = this.contentInner.createDiv({ cls: "lx-tabs" });
		this.iframe = this.contentInner.createEl("iframe", {
			cls: "lx-iframe",
			attr: { sandbox: "allow-scripts allow-same-origin", referrerpolicy: "no-referrer" },
		});
		this.divider = this.contentInner.createDiv({ cls: "lx-divider" });
		this.aiHolder = this.contentInner.createDiv({ cls: "lx-ai-holder" });
		this.aiScroll = this.aiHolder.createDiv({ cls: "lx-ai-scroll" });
		// 滚动条挂 contentWrap（不随内容滚动），词典滚动统一由 inner 驱动
		const scrollbar = this.contentWrap.createDiv({ cls: "lx-scrollbar" });
		this.scrollbarThumb = scrollbar.createDiv({ cls: "lx-scrollbar-thumb" });
		// 追问条、状态栏是面板固定底部板块，不参与词典/AI 滚动
		this.buildAskBar();
		this.buildStatusBar();

		this.bindEvents();
		this.setupFloatInteractions();
	}

	/**
	 * 底部操作栏：按键从顶部下移，贴近拇指更跟手。
	 * 行1：词典胶囊+词条数（左） → 收藏/喇叭（偏中间） → 迷你搜索（右下角小胶囊）
	 * 行2：左右切换（上一次/下一次查的词）放在右下角
	 */
	private buildStatusBar(): void {
		this.statusEl = this.root.createDiv({ cls: "lx-status" });
		const row1 = this.statusEl.createDiv({ cls: "lx-status-row lx-status-row1" });
		this.statusTag = row1.createSpan({ cls: "lx-tag", text: "" });
		this.statusTag.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleSourceSwitch(this.statusTag);
		});
		this.statusCount = row1.createSpan({ cls: "lx-count", text: "" });
		row1.createDiv({ cls: "lx-status-spacer" });
		this.favBtn = row1.createEl("button", { cls: "lx-icon-btn lx-fav", attr: { "aria-label": "收藏到生词本" } });
		this.favBtn.setText("☆");
		this.speakBtn = row1.createEl("button", { cls: "lx-icon-btn lx-speak", attr: { "aria-label": "发音" } });
		this.speakBtn.setText("🔊");
		// 迷你搜索：尺寸/字号对齐词典胶囊，放行1最右
		this.searchMini = row1.createEl("input", {
			cls: "lx-input lx-search-mini",
			attr: { placeholder: "搜索…", spellcheck: "false" },
		});
		const row2 = this.statusEl.createDiv({ cls: "lx-status-row lx-status-row2" });
		// 笔记入口：与左右切换 ‹ › 同一行、位于其左侧；展开用浮层，不撑大底部状态栏
		const noteWrap = row2.createDiv({ cls: "lx-note-wrap" });
		this.noteBtn = noteWrap.createEl("button", {
			cls: "lx-note-btn",
			attr: { "aria-label": "笔记" },
		});
		this.noteBtn.setText("📝");
		this.noteBtn.title = "给当前单词写笔记（仅收藏后保存）";
		this.notePop = noteWrap.createDiv({ cls: "lx-note-pop hidden" });
		this.noteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.toggleNotePop();
		});
		const nav = row2.createDiv({ cls: "lx-nav" });
		this.prevBtn = nav.createEl("button", { cls: "lx-icon-btn", attr: { "aria-label": "上一个" } });
		this.prevBtn.setText("‹");
		this.nextBtn = nav.createEl("button", { cls: "lx-icon-btn", attr: { "aria-label": "下一个" } });
		this.nextBtn.setText("›");
		// 状态文本（就绪/查询中/错误等），不破坏操作栏结构
		this.statusText = this.statusEl.createDiv({ cls: "lx-status-text", text: "就绪" });
	}

	private bindEvents(): void {
		const bindInput = (el: HTMLInputElement): void => {
			el.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					const w = el.value.trim();
					if (w) {
						// 默认按顺序展示：每次新查词回到顺序中的第一个词典（AI 恒追加末尾）
						const first = this.sources.find((x) => !x.isAI) ?? this.sources[0];
						if (first && first.id !== this.activeSourceId) {
							this.activeSourceId = first.id;
							this.renderTabs();
						}
						void this.lookup(w, true, false, true);
					}
				} else if (e.key === "Escape") {
					e.preventDefault();
					this.hide();
				}
			});
		};
		bindInput(this.input);
		bindInput(this.searchMini);
		this.closeBtn.addEventListener("click", () => this.hide());
		this.floatClose.addEventListener("click", () => this.hide());
		this.prevWordLabel.addEventListener("click", () => this.navigate(-1));
		this.prevBtn.addEventListener("click", () => this.navigate(-1));
		this.nextBtn.addEventListener("click", () => this.navigate(1));
		this.speakBtn.addEventListener("click", () => void this.speakCurrent());
		this.favBtn.addEventListener("click", () => void this.favCurrent());
		// 点击面板空白区域（tabs 空白、内容区空白、状态栏）自动收回
		this.root.addEventListener("mousedown", (e) => {
			const t = e.target as HTMLElement;
			if (
				t === this.root ||
				t === this.tabsEl ||
				t === this.contentWrap ||
				t === this.statusEl
			) {
				this.hide();
			}
		});
		// inner 滚动驱动右侧细进度条（移动端系统滚动条不可见时提示进度）
		this.contentInner.addEventListener("scroll", () => this.onInnerScroll());
		// 点击面板外部遮罩自动收回
		this.backdrop.addEventListener("click", () => this.hide());
		// 软键盘贴合：visualViewport 收缩（移动端键盘弹出）时压缩面板，
		// 让面板下沿实时贴住键盘上沿，笔记浮层/追问条随面板整体不被遮挡
		if (window.visualViewport) {
			window.visualViewport.addEventListener("resize", this.onVvResizeEv);
			window.visualViewport.addEventListener("scroll", this.onVvScrollEv);
		}
		window.addEventListener("resize", this.onWinResizeEv);
		// 兜底：部分旧 WebView 的 visualViewport 事件不可靠，
		// 输入框聚焦期间轮询可视高度，确保键盘动画结束后也能贴合
		this.root.addEventListener("focusin", (e) => {
			const t = e.target as HTMLElement;
			if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
			dlog("panel", `focusin ${t.tagName}`);
			this.startKbPoll();
		});
		this.root.addEventListener("focusout", () => {
			// 延迟停轮询：焦点可能转到面板内另一个输入框；同时做一次最终贴合
			window.setTimeout(() => {
				this.onViewportResize("focusout");
				const ae = document.activeElement as HTMLElement | null;
				if (!ae || !this.root.contains(ae) ||
					(ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) {
					this.stopKbPoll();
				}
			}, 300);
		});
		// 设置里可能已开着诊断浮层（重启插件后恢复）
		if (this.plugin.settings.debug?.panel) this.setDebugOverlay(true);
	}

	/** 诊断计数：验证各事件通道在设备上是否真的触发 */
	private dbgCounts = { vvResize: 0, vvScroll: 0, winResize: 0, poll: 0 };
	private debugEl: HTMLElement | null = null;
	private debugMetricsEl: HTMLElement | null = null;
	private debugLogEl: HTMLElement | null = null;
	private debugUnsub: (() => void) | null = null;

	private onVvResizeEv = (): void => {
		this.dbgCounts.vvResize++;
		this.onViewportResize("vv.resize");
	};
	private onVvScrollEv = (): void => {
		this.dbgCounts.vvScroll++;
		this.onViewportResize("vv.scroll");
	};
	private onWinResizeEv = (): void => {
		this.dbgCounts.winResize++;
		this.onViewportResize("win.resize");
	};

	/** 设置页「调试模式」开关直推：开则挂调试台，关则移除 */
	setDebugOverlay(on: boolean): void {
		if (on && !this.debugEl) {
			this.debugEl = this.root.createDiv({ cls: "lx-debug" });
			this.debugEl.style.cssText =
				"position:absolute;left:6px;top:6px;z-index:99;" +
				"background:rgba(0,0,0,0.85);color:#7fff9e;font:10px/1.5 monospace;" +
				"padding:6px 8px;border-radius:8px;width:min(320px,88vw);box-sizing:border-box;";
			// 实时指标行（只读）
			this.debugMetricsEl = this.debugEl.createDiv();
			this.debugMetricsEl.style.cssText =
				"white-space:pre;pointer-events:none;margin-bottom:4px;";
			// 日志区：固定高度、可滚动、可选择复制；仅内存不落盘
			const logBox = this.debugEl.createDiv();
			logBox.style.cssText =
				"height:120px;overflow-y:auto;user-select:text;-webkit-user-select:text;" +
				"white-space:pre-wrap;word-break:break-all;border-top:1px solid #2a4;";
			this.debugLogEl = logBox;
			logBox.setText(getDebugLog() || "（暂无日志，操作插件后此处实时输出）");
			this.debugUnsub = onDebugLog(() => {
				if (!this.debugLogEl) return;
				const atBottom = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 12;
				this.debugLogEl.setText(getDebugLog());
				if (atBottom) logBox.scrollTop = logBox.scrollHeight;
			});
			// 复制按钮：一键复制全部日志，便于粘贴反馈
			const copyBtn = this.debugEl.createEl("button", { text: "复制日志" });
			copyBtn.style.cssText =
				"margin-top:4px;font:10px monospace;padding:2px 10px;" +
				"background:#173;color:#7fff9e;border:1px solid #2a4;border-radius:4px;";
			copyBtn.addEventListener("click", () => {
				const text = getDebugLog() || "（无日志）";
				void navigator.clipboard?.writeText(text).then(
					() => this.plugin.toast.show("调试日志已复制", { key: "lx-debug", duration: 1500 }),
					() => this.plugin.toast.show("复制失败，请长按日志区手动选择复制", { key: "lx-debug", duration: 2500 }),
				);
			});
			this.onViewportResize("debug-on");
			dlog("panel", "调试台已挂载");
		} else if (!on && this.debugEl) {
			this.debugUnsub?.();
			this.debugUnsub = null;
			this.debugEl.remove();
			this.debugEl = null;
			this.debugMetricsEl = null;
			this.debugLogEl = null;
		}
	}

	private kbPollTimer: number | null = null;

	private startKbPoll(): void {
		if (this.kbPollTimer != null) return;
		this.kbPollTimer = window.setInterval(() => {
			this.dbgCounts.poll++;
			this.onViewportResize("poll");
		}, 250);
	}

	private stopKbPoll(): void {
		if (this.kbPollTimer != null) {
			window.clearInterval(this.kbPollTimer);
			this.kbPollTimer = null;
		}
	}

	/** 键盘弹出导致的高度压缩标记：用于键盘收起后还原用户调整的悬浮高度 */
	private kbPrevHeight: string | null = null;

	/** 面板内输入框/文本域是否持有焦点（聚焦避让策略的依据） */
	private isPanelInputFocused(): boolean {
		const ae = document.activeElement as HTMLElement | null;
		return !!ae && this.root.contains(ae) &&
			(ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
	}

	private lastDockAction = "";

	private onViewportResize = (via = "direct"): void => {
		const vv = window.visualViewport;
		let action = "skip:!vv";
		let occluded = -1;
		if (vv) {
			occluded = Math.round(window.innerHeight - (vv.height + vv.offsetTop));
		}
		if (vv && this.visible) {
			// 布局视口与可视视口底部差超过阈值（≈100px）判定为软键盘弹出；
			// vv.offsetTop 兼容 iOS 键盘弹出时可视区整体下移的场景
			if (occluded > 100) {
				const vvBottom = Math.floor(vv.height + vv.offsetTop);
				// 抽屉形态 top:0 高度自适应：限制 maxHeight 即可让下沿贴键盘上沿
				const maxH = Math.max(220, vvBottom - 4);
				this.root.style.maxHeight = `${maxH}px`;
				action = `dock:${maxH}`;
				if (this.floating) {
					// 悬浮形态有内联 height：底部越界时同步压高，键盘收起后还原
					const rect = this.root.getBoundingClientRect();
					if (rect.bottom > vvBottom - 2) {
						if (this.kbPrevHeight == null) {
							this.kbPrevHeight = this.root.style.height || null;
						}
						const h = Math.max(220, vvBottom - 4 - rect.top);
						this.root.style.height = `${h}px`;
						this.root.style.maxHeight = `${h}px`;
						action = `dockF:${h}`;
					}
				}
			} else if (this.isPanelInputFocused() && Platform.isMobile) {
				// 兜底（实测部分 Android WebView：vv 高度恒定、事件全 0，系统层面
				// 完全无法感知键盘）——聚焦即避让：输入框聚焦时压到 60% 屏高，
				// 面板下沿落在常规键盘（约占屏高 30–40%）上沿之上，失焦还原。
				const maxH = Math.max(260, Math.round(window.innerHeight * 0.6));
				this.root.style.maxHeight = `${maxH}px`;
				action = `dockKb:${maxH}`;
			} else {
				// 键盘收起：还原（hide() 也会统一清理内联尺寸）
				this.root.style.removeProperty("maxHeight");
				action = "idle";
				if (this.kbPrevHeight != null) {
					if (this.kbPrevHeight) this.root.style.height = this.kbPrevHeight;
					else this.root.style.removeProperty("height");
					this.kbPrevHeight = null;
				}
			}
		} else if (!this.visible) {
			this.kbPrevHeight = null;
			action = "skip:hidden";
		}
		this.renderDebug(via, occluded, action);
		if (action !== this.lastDockAction) {
			this.lastDockAction = action;
			dlog("panel", `${action} via=${via} occ=${occluded} vv=${vv ? Math.round(vv.height) : "N/A"} inner=${Math.round(window.innerHeight)}`);
		}
	};

	/** 诊断台实时指标行：可视区高度 / 遮挡量 / 事件通道计数 / 面板实际位置 */
	private renderDebug(via: string, occluded: number, action: string): void {
		if (!this.debugMetricsEl) return;
		const vv = window.visualViewport;
		const rect = this.root.getBoundingClientRect();
		const c = this.dbgCounts;
		this.debugMetricsEl.setText(
			`via=${via} ${action} | inner=${Math.round(window.innerHeight)} vv=${vv ? Math.round(vv.height) + "+" + Math.round(vv.offsetTop) : "N/A"} occ=${occluded}\n` +
			`rect t=${Math.round(rect.top)} b=${Math.round(rect.bottom)} h=${Math.round(rect.height)} | ` +
			`evt vvR=${c.vvResize} vvS=${c.vvScroll} win=${c.winResize} poll=${c.poll} vis=${this.visible ? 1 : 0}`,
		);
	}

	setSources(sources: LookupSource[]): void {
		this.sources = sources;
		if (!sources.length) {
			this.activeSourceId = "";
			this.tabsEl.empty();
			return;
		}
		if (!sources.some((s) => s.id === this.activeSourceId)) {
			this.activeSourceId = sources[0].id;
		}
		this.renderTabs();
	}

	private renderTabs(): void {
		this.tabsEl.empty();
		let activeTab: HTMLElement | null = null;
		for (const s of this.sources) {
			const isActive = s.id === this.activeSourceId;
			const tab = this.tabsEl.createEl("button", {
				cls: "lx-tab" + (isActive ? " active" : ""),
				text: shortName(s.name),
			});
			tab.title = s.name;
			tab.setAttribute("tabindex", "0");
			if (isActive) activeTab = tab;
			tab.addEventListener("click", () => {
				this.activeSourceId = s.id;
				this.renderTabs();
				const w = this.input.value.trim() || this.currentWord();
				if (w) void this.lookup(w, false);
			});
		}
		// 查词后 focus 当前激活 tab，方便用户键盘切换
		activeTab?.focus();
	}

	toggle(): void {
		if (this.shown) this.hide();
		else this.show();
	}

	show(): void {
		this.saveFocus();
		this.shown = true;
		document.body.addClass("lingua-nex-panel-open");
		this.root.style.setProperty("display", "");
		this.backdrop.addClass("shown");
		this.root.addClass("shown");
		// 高度内容自适应：初始为紧凑自然高度（无内容不撑满），查词/查 AI 后由内容自然撑大，
		// 上限由 CSS max-height 限定；AI 区不再依赖 flex-grow，天然避免折叠
		this.input.focus();
		this.input.select();
		// 每次打开都把追问条复位为收起，避免上一轮 AI 会话的追问条残留
		this.hideAskBar();
		document.addEventListener("keydown", this.escCloseHandler, true);
	}

	/**
	 * 悬浮窗查词：完整复用抽屉面板（词典/AI/追问条全量），仅改为选区附近悬浮呈现。
	 * 透明无暗色遮罩：不启用 lingua-nex-backdrop，正常悬浮；尺寸加宽加长保证内容可读。
	 * 点外部、点空白或 ✕ 关闭；位置贴近选区，超出视口自动翻转，带圆角边框样式。
	 */
	async showAt(word: string, rect: DOMRect): Promise<void> {
		this.saveFocus();
		this.shown = true;
		document.body.addClass("lingua-nex-panel-open");
		// 悬浮窗不显示暗色遮罩（透明背景正常悬浮），即使此前抽屉形态残留遮罩也一并清除
		this.root.style.setProperty("display", "");
		this.backdrop.removeClass("shown");
		this.root.addClass("shown");
		this.root.addClass("lx-floating");
		this.input.focus();
		this.input.select();
		const pad = 6;
		// 悬浮窗尺寸：宽最多 70% 屏宽 / 420px，高最多 50% 屏高 / 480px，内容按缩放适配
		const maxH = Math.min(window.innerHeight * 0.5, 480);
		let top = rect.bottom + pad;
		if (top + maxH > window.innerHeight - pad) {
			top = Math.max(pad, rect.top - maxH - pad);
		}
		const w = Math.min(window.innerWidth * 0.7, 420);
		let left = rect.left;
		if (left + w > window.innerWidth - pad) {
			left = Math.max(pad, window.innerWidth - w - pad);
		}
		this.root.style.top = `${top}px`;
		this.root.style.left = `${left}px`;
		this.root.style.width = `${w}px`;
		this.root.style.maxHeight = `${maxH}px`;
		this.floatClose.addClass("shown");
		this.hideAskBar();
		// 顶部栏实际高度写入 CSS 变量：内容区 margin-top 精确腾位，杜绝 tab 遮挡首行释义
		this.syncTopHeight();
		// 点击面板外任意处自动关闭（头部收起、内容区外都生效；iframe 内部点击不冒泡到外层）
		document.addEventListener("mousedown", this.outsideClose, true);
		document.addEventListener("keydown", this.escCloseHandler, true);
		await this.lookup(word, true, true, true);
	}

	/**
	 * 命令入口悬浮查词：不依赖选区，悬浮卡片居中呈现，用户可直接手动输入要查的词。
	 * 与选区悬浮 showAt 的唯一差别是无 rect 时取屏幕中部定位，其余形态、关闭逻辑完全一致。
	 */
	async showFloating(word?: string): Promise<void> {
		this.saveFocus();
		this.shown = true;
		document.body.addClass("lingua-nex-panel-open");
		this.root.style.setProperty("display", "");
		this.backdrop.removeClass("shown");
		this.root.addClass("shown");
		this.root.addClass("lx-floating");
		this.input.focus();
		this.input.select();
		const pad = 6;
		const maxH = Math.min(window.innerHeight * 0.5, 480);
		const w = Math.min(window.innerWidth * 0.7, 420);
		const left = Math.max(pad, (window.innerWidth - w) / 2);
		const top = Math.max(pad, (window.innerHeight - maxH) / 2 - 32);
		this.root.style.top = `${top}px`;
		this.root.style.left = `${left}px`;
		this.root.style.width = `${w}px`;
		this.root.style.maxHeight = `${maxH}px`;
		this.floatClose.addClass("shown");
		this.hideAskBar();
		document.addEventListener("keydown", this.escCloseHandler, true);
		this.syncTopHeight();
		document.addEventListener("mousedown", this.outsideClose, true);
		if (word) await this.lookup(word, true, true, true);
	}

	/** 记录打开前的来源焦点（编辑器实例 + 光标 + 活动元素），供关闭时归还 */
	private saveFocus(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = view?.editor ?? null;
		this.savedFocus = {
			editor,
			pos: editor ? editor.getCursor() : null,
			el: document.activeElement instanceof HTMLElement ? document.activeElement : null,
		};
	}

	/** 关闭时归还焦点：焦点仍在面板内（或落在空白/body）才恢复；用户已切到别的输入处则不打扰 */
	private restoreFocus(): void {
		const sf = this.savedFocus;
		this.savedFocus = null;
		if (!sf) return;
		const ae = document.activeElement;
		if (ae instanceof HTMLElement) {
			const inPanel = this.root.contains(ae) || this.backdrop.contains(ae);
			if (!inPanel) {
				const tag = ae.tagName;
				const activeInput = tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable;
				if (activeInput) return;
			}
		}
		const restore = (): void => {
			if (sf.editor) {
				const ed = sf.editor;
				ed.focus();
				if (sf.pos) ed.setCursor(sf.pos);
			} else if (sf.el && sf.el.isConnected) {
				sf.el.focus();
			}
		};
		// 立即恢复一次；移动端键盘/编辑器重排较慢，延时多次补焦点与光标，避免被布局抢占
		restore();
		[80, 200, 400].forEach((ms) => window.setTimeout(restore, ms));
	}

	/** 悬浮窗 header（名称/输入框/关闭钮）实际高度同步为 CSS 变量：内容区 margin-top 精确匹配，Tab 已并入内容区无需计入 */
	private syncTopHeight(): void {
		if (!this.topEl) return;
		const h = Math.ceil(this.topEl.getBoundingClientRect().height);
		if (h > 0) {
			this.topHeight = h;
			this.root.style.setProperty("--lx-top-h", `${h}px`);
		}
	}

	/** 悬浮窗：点击面板以外区域自动关闭（捕获阶段，避免被面板内 stopPropagation 影响） */
	private outsideClose = (e: MouseEvent): void => {
		const t = e.target as Node;
		if (!this.root.hasClass("lx-floating")) return;
		if (t === this.iframe || (t instanceof Element && t.closest?.("iframe"))) return;
		if (!this.root.contains(t)) this.hide();
	};

	/** Esc 关闭（capture 阶段：焦点在 CM6 时也能先截获；iframe 内焦点由 bindIframeKeys 处理） */
	private escCloseHandler = (e: KeyboardEvent): void => {
		if (e.key !== "Escape" || !this.shown) return;
		// 若焦点在输入框，让输入框自己的 Esc 逻辑先走（清空输入），不要提前 hide
		const target = e.target as HTMLElement;
		const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
		if (inInput) return;
		e.preventDefault();
		e.stopPropagation();
		this.hide();
	};

	/**
	 * 悬浮窗交互：顶部栏空白区拖动换位 + 四边四角无级缩放。
	 * 仅 lx-floating 形态生效；拖动/缩放均挂在 window 上跟踪指针，避免 setPointerCapture
	 * 目标歧义，松手/取消即解绑。输入框、按钮、下拉等可交互元素自动跳过拖动。
	 */
	private setupFloatInteractions(): void {
		const MIN_W = 220;
		const MIN_H = 160;
		const onPointerDown = (e: PointerEvent, kind: "drag" | "resize", dir = ""): void => {
			if (!this.root.hasClass("lx-floating")) return;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			const t = e.target as HTMLElement;
			if (kind === "drag" && t.closest("input,button,select,textarea")) return;
			e.preventDefault();
			if (kind === "drag") {
				this.root.addClass("lx-dragging");
				this.dragState = {
					pid: e.pointerId,
					sx: e.clientX,
					sy: e.clientY,
					ox: this.root.offsetLeft,
					oy: this.root.offsetTop,
				};
			} else {
				this.resizeState = {
					pid: e.pointerId,
					dir,
					sx: e.clientX,
					sy: e.clientY,
					r: this.root.getBoundingClientRect(),
				};
			}
		};
		const onPointerMove = (e: PointerEvent): void => {
			const d = this.dragState;
			if (d && e.pointerId === d.pid) {
				const dx = e.clientX - d.sx;
				const dy = e.clientY - d.sy;
				const w = this.root.offsetWidth;
				const h = this.root.offsetHeight;
				const left = Math.min(Math.max(d.ox + dx, -w + 60), window.innerWidth - 60);
				const top = Math.min(Math.max(d.oy + dy, 0), window.innerHeight - 40);
				this.root.style.left = `${left}px`;
				this.root.style.top = `${top}px`;
				return;
			}
			const rs = this.resizeState;
			if (!rs || e.pointerId !== rs.pid) return;
			e.preventDefault();
			const dx = e.clientX - rs.sx;
			const dy = e.clientY - rs.sy;
			const r = rs.r;
			let left = r.left;
			let top = r.top;
			let width = r.width;
			let height = r.height;
			if (rs.dir.includes("e")) width = Math.max(MIN_W, r.width + dx);
			if (rs.dir.includes("s")) height = Math.max(MIN_H, r.height + dy);
			if (rs.dir.includes("w")) {
				width = Math.max(MIN_W, r.width - dx);
				left = r.right - width;
			}
			if (rs.dir.includes("n")) {
				height = Math.max(MIN_H, r.height - dy);
				top = r.bottom - height;
			}
			width = Math.min(width, window.innerWidth - 6);
			height = Math.min(height, window.innerHeight - 6);
			left = Math.max(0, Math.min(left, window.innerWidth - 60));
			top = Math.max(0, Math.min(top, window.innerHeight - 40));
			this.root.style.width = `${width}px`;
			this.root.style.height = `${height}px`;
			this.root.style.maxHeight = `${height}px`;
			this.root.style.left = `${left}px`;
			this.root.style.top = `${top}px`;
			this.syncTopHeight();
			this.updateScrollbar();
		};
		const onPointerEnd = (e: PointerEvent): void => {
			if (this.dragState && e.pointerId === this.dragState.pid) {
				this.dragState = null;
				this.root.removeClass("lx-dragging");
			}
			if (this.resizeState && e.pointerId === this.resizeState.pid) {
				this.resizeState = null;
			}
		};
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerEnd);
		window.addEventListener("pointercancel", onPointerEnd);
		// 拖动把手为插件名+输入框行：收起后该行保留并收窄，仍可拖动换位
		this.headerEl.addEventListener("pointerdown", (e) => onPointerDown(e, "drag"));
		const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
		for (const dir of dirs) {
			const h = this.root.createDiv({ cls: `lx-resize-handle ${dir}` });
			h.addEventListener("pointerdown", (e) => onPointerDown(e, "resize", dir));
			this.resizeHandles.push(h);
		}
	}

	/**
	 * 查询结果若命中：查词返回后自动渲染。隐藏时恢复默认尺寸（hide 已清空内联尺寸）。
	 */
	hide(): void {
		this.shown = false;
		dlog("panel", "hide");
		this.currentOnline = null;
		document.body.removeClass("lingua-nex-panel-open");
		this.backdrop.removeClass("shown");
		this.root.removeClass("shown");
		// 恢复内联 display:none 兜底，与构造时一致：即使样式表异常面板也绝不可见
		this.root.style.setProperty("display", "none");
		// 清除悬浮形态，回到贴顶抽屉默认样式
		this.root.removeClass("lx-floating");
		this.floatClose.removeClass("shown");
		document.removeEventListener("mousedown", this.outsideClose, true);
		document.removeEventListener("keydown", this.escCloseHandler, true);
		this.root.style.removeProperty("top");
		this.root.style.removeProperty("left");
		this.root.style.removeProperty("width");
		this.root.style.removeProperty("maxHeight");
		this.root.style.removeProperty("height");
		this.root.removeClass("lx-dragging");
		this.dragState = null;
		this.resizeState = null;
		this.kbPrevHeight = null;
		this.stopKbPoll();
		this.aiAbort?.abort();
		this.aiCache.clear();
		// 收起追问条与笔记浮层，回到干净的初始态
		this.hideAskBar();
		this.closeNotePop();
		if (this.sourceSwitchEl) {
			this.sourceSwitchEl.remove();
			this.sourceSwitchEl = null;
		}
		// 归还焦点：让用户关闭面板后可直接继续在笔记中输入（与 Obsidian 命令面板关闭后恢复输入一致）
		this.restoreFocus();
	}

	get visible(): boolean {
		return this.shown;
	}

	/** 当前是否为悬浮窗形态（区别于贴顶抽屉） */
	get floating(): boolean {
		return this.root.hasClass("lx-floating");
	}

	/** 面板根节点（供选区监听判断选区是否位于面板内，避免面板内选中触发自动查词） */
	get rootEl(): HTMLElement {
		return this.root;
	}

	private currentWord(): string {
		const item = this.history[this.histIdx];
		return item ? item.word : "";
	}

	/** 直接用 AI 解释：打开面板并切换到 AI 源查询（未开启/未配置时提示） */
	async lookupAI(word: string): Promise<void> {
		const w = word.trim();
		if (!w) return;
		this.show();
		const ai = this.sources.find((s) => s.isAI);
		if (!ai) {
			this.show();
			this.syncInputs(w);
			this.setStatus("AI 未开启：请在设置中开启 AI 并配置 API", 4000);
			return;
		}
		this.activeSourceId = ai.id;
		this.renderTabs();
		await this.lookup(w);
	}

	/** 带自定义提示词打开 AI 查询（PDF 右键 AI 翻译/详解等入口）：打开面板并切到 AI 源 */
	async lookupAIPrompt(word: string, promptText: string): Promise<void> {
		const w = word.trim();
		if (!w) return;
		this.show();
		const ai = this.sources.find((s) => s.isAI);
		if (!ai) {
			this.show();
			this.syncInputs(w);
			this.setStatus("AI 未开启：请在设置中开启 AI 并配置 API", 4000);
			return;
		}
		this.activeSourceId = ai.id;
		this.renderTabs();
		await this.aiQuery(ai, w, true, promptText);
	}

	/**
	 * 查词：只在当前激活的 Tab（词典/AI）上查询，保证切换后内容与词典严格对应、绝不混淆。
	 * preferDict=true 时（选中查词入口）强制回到首个词典源，避免默认消耗 AI Token；词典未命中时仍自动兜底 AI。
	 * 词典未命中时若已启用 AI 则自动兜底解释，保证“查词必有结果”。
	 */
	async lookup(word: string, pushHistory = true, preferDict = false, autoFallback = false): Promise<void> {
		const w = word.trim();
		if (!w) return;
		dlog("lookup", `查词 "${w}" src=${this.activeSourceId}`);
		if (preferDict) {
			const dictSrc = this.sources.find((x) => !x.isAI);
			if (dictSrc) {
				this.activeSourceId = dictSrc.id;
				this.renderTabs();
			}
		}
		this.syncInputs(w);
		// 换了词就把笔记浮层收起，防止笔记写到上一个词上
		if (this.notePopOpen && this.noteWordAtOpen !== w) this.closeNotePop();
		// 新查询开始即清掉旧未命中占位，避免切源后残留上一源的提示
		this.missEl?.addClass("hidden");
		this.setStatus(`查询中：${w}…`, 0);
		this.aiAbort?.abort();
		this.aiAbort = null;

		const s = this.sources.find((x) => x.id === this.activeSourceId);
		if (!s) {
			this.setStatus("暂无可用解释源，请在设置中添加词典或开启 AI", 4000);
			return;
		}
		if (s.isAI) {
			await this.aiQuery(s, w, pushHistory);
			return;
		}
		if (s.isOnline) {
			await this.onlineQuery(s, w, pushHistory);
			return;
		}
		const mdict = s.mdict;
		if (!mdict || !mdict.isLoaded) {
			this.setStatus("该词典尚未加载，请稍候或重新扫描", 4000);
			return;
		}
		const res = mdict.lookup(w);
		if (res && res.definition != null) {
			this.currentDoc = res.definition;
			this.setStatusTag(s.name, mdict.info.wordCount);
			const doc = this.buildDoc(res.definition, mdict, s.resources);
			this.renderIframe(doc);
			this.iframe.classList.remove("hidden");
			this.commitHistory(w, s.id, "", pushHistory);
			void this.refreshFavState(w);
			if (this.plugin.settings.vocab.autoAddOnLookup) {
				void this.plugin.addToDefaultBook(w, undefined, true);
			}
			return;
		}
		// 首次查词时自动降级：遍历其余词典源，找到第一个命中的自动切换过去
		// 手动切 tab / 主动选词典时 autoFallback=false，尊重用户选择
		if (autoFallback) {
			for (const alt of this.sources) {
				if (alt.id === s.id || alt.isAI || alt.isOnline) continue;
				const altDict = alt.mdict;
				if (!altDict || !altDict.isLoaded) continue;
				const altRes = altDict.lookup(w);
				if (altRes && altRes.definition != null) {
					this.activeSourceId = alt.id;
					this.renderTabs();
					this.currentDoc = altRes.definition;
					this.setStatusTag(alt.name, altDict.info.wordCount);
					this.setStatus(`自动切换到 ${shortName(alt.name, 16)}：命中 ${w}`);
					const doc = this.buildDoc(altRes.definition, altDict, alt.resources);
					this.renderIframe(doc);
					this.iframe.classList.remove("hidden");
					this.commitHistory(w, alt.id, "", pushHistory);
					void this.refreshFavState(w);
					if (this.plugin.settings.vocab.autoAddOnLookup) {
						void this.plugin.addToDefaultBook(w, undefined, true);
					}
					return;
				}
			}
		}
		// 所有词典都未命中：切换为未命中占位
		this.setStatus(`未命中：${w}（当前词典 ${shortName(s.name, 16)}，可点 AI 释义）`, 4000);
		this.showMiss(w, shortName(s.name, 16));
		void this.refreshFavState(w);
	}

	/** 在线词典查询（有道 / Free Dictionary 等多源）：命中渲染释义与发音，未命中仅提示 */
	private async onlineQuery(
		s: LookupSource,
		w: string,
		pushHistory: boolean,
	): Promise<void> {
		this.currentOnline = null;
		const result = await this.plugin.queryOnline(s.id, w);
		if (result) {
			this.currentOnline = {
				word: w,
				phoneticBr: null,
				phoneticUs: null,
				audioBr: result.audioBr,
				audioUs: result.audioUs,
				groups: [],
				raw: null,
			};
			this.currentDoc = "";
			this.setStatusTag(s.name, 0);
			this.renderIframe(result.doc);
			this.commitHistory(w, s.id, "", pushHistory);
			void this.refreshFavState(w);
			return;
		}
		this.setStatus(`未命中：当前${shortName(s.name, 16)}词典未命中`, 4000);
		this.showMiss(w, shortName(s.name, 16));
		void this.refreshFavState(w);
	}

	/**
	 * 未命中占位：切源后若该源未命中，中间内容区同样切换显示提示（隐藏词典 iframe 与 AI 区），
	 * 让用户直观看到当前源确实没查到，而非残留上一源的旧内容。
	 */
	private showMiss(w: string, srcName: string): void {
		this.iframe.classList.add("hidden");
		this.hideAiHolder();
		if (!this.missEl) {
			this.missEl = this.contentInner.createDiv({ cls: "lx-miss" });
		}
		this.missEl.removeClass("hidden");
		this.missEl.setText(`当前${srcName}词典未命中`);
		this.contentInner.scrollTop = 0;
		this.updateScrollbar();
	}

	/** AI 释义查询（流式增量渲染；也可作为词典未命中兜底） */
	private async aiQuery(
		s: LookupSource,
		w: string,
		pushHistory: boolean,
		promptText = "",
	): Promise<void> {
		const cfg = this.plugin.settings.ai as AIConfig;
		if (!cfg.apiKey) {
			this.setStatus("AI 未配置：请在设置中填写 API Key 与地址", 4000);
			return;
		}
		// 缓存命中：面板未关闭、同一单词与同一提示词，直接复用旧结果，不重复请求
		const cacheKey = `${s.id}|${w}|${promptText}`;
		const cached = this.aiCache.get(cacheKey);
		if (cached !== undefined) {
			this.renderAiResult(s, w, cached, pushHistory);
			this.setStatus("");
			// 复用缓存等同"内容已就绪"，追问条直接滑出
			this.showAskBar();
			void this.refreshFavState(w);
			return;
		}
		this.setStatus("AI 释义中…", 0);
		// 生成中先收起追问条，避免还没内容就一直占着底部空间
		this.hideAskBar();
		this.aiAbort?.abort();
		this.aiAbort = new AbortController();
		const signal = this.aiAbort.signal;
		// 词典 Tab 时保留 iframe 共存，AI 区显示在下部；AI Tab 时独占
		const aiOnly = s.isAI && this.activeSourceId === s.id;
		if (aiOnly) this.iframe.classList.add("hidden");
		const holder = this.showAiHolder();
		this.aiScroll?.empty();
		this.aiContext = [{ role: "user", content: w }];
		this.mdComp?.unload();
		this.mdComp = new Component();
		const renderEl = this.aiScroll!.createDiv({ cls: "lx-ai-md" });
		renderEl.createSpan({ cls: "lx-ai-streaming", text: "正在生成…" });
		let md = "";
		let timer: number | null = null;
		const paint = async () => {
			renderEl.empty();
			await MarkdownRenderer.render(
				this.plugin.app,
				md || "…",
				renderEl,
				"",
				this.mdComp as Component,
			);
		};
		try {
			const stream = await aiLookupStream(cfg, w, signal, promptText);
			for await (const chunk of stream) {
				md += chunk;
				if (timer == null) {
					timer = window.setTimeout(() => {
						timer = null;
						void paint();
					}, 90);
				}
			}
			if (timer != null) {
				window.clearTimeout(timer);
				timer = null;
			}
			await paint();
			this.aiCache.set(cacheKey, md);
			this.renderAiResult(s, w, md, pushHistory);
			this.setStatus("");
			// 生成结束：追问条才向上滑出
			this.showAskBar();
			void this.refreshFavState(w);
		} catch (e: any) {
			if (e?.name === "AbortError") return;
			this.setStatus(`AI 失败：${e?.message ?? "未知错误"}`, 0);
			// 没生成出内容就别把追问条滑出来
			if (!md) this.hideAskBar();
			if (!md) {
				renderEl.empty();
				renderEl.createDiv({
					cls: "lx-ai-error",
					text: `AI 失败：${e?.message ?? "未知错误"}`,
				});
			}
		}
	}

	/** 渲染 AI 结果到 AI 区（流式完成与缓存复用共用），并同步多轮上下文与历史 */
	private renderAiResult(
		s: LookupSource,
		w: string,
		md: string,
		pushHistory: boolean,
	): void {
		// 词典 Tab 时保留 iframe 共存，AI 区显示在下部；AI Tab 时独占
		const aiOnly = s.isAI && this.activeSourceId === s.id;
		if (aiOnly) this.iframe.classList.add("hidden");
		this.showAiHolder();
		this.aiScroll?.empty();
		this.aiContext = [
			{ role: "user", content: w },
			{ role: "assistant", content: md },
		];
		this.mdComp?.unload();
		this.mdComp = new Component();
		const renderEl = this.aiScroll!.createDiv({ cls: "lx-ai-md" });
		void MarkdownRenderer.render(
			this.plugin.app,
			md || "…",
			renderEl,
			"",
			this.mdComp as Component,
		).then(() => this.scrollToAi());
		this.currentDoc = md;
		this.commitHistory(w, s.id, md, pushHistory);
	}

	private commitHistory(word: string, sourceId: string, aiHtml: string, push: boolean): void {
		if (!push) {
			if (this.histIdx >= 0) this.history[this.histIdx] = { word, sourceId, aiHtml };
		} else {
			this.history = this.history.slice(0, this.histIdx + 1);
			this.history.push({ word, sourceId, aiHtml });
			if (this.history.length > MAX_HISTORY) this.history.shift();
			this.histIdx = this.history.length - 1;
		}
		this.updatePrevWord();
	}

	private navigate(delta: number): void {
		const next = this.histIdx + delta;
		if (next < 0 || next >= this.history.length) return;
		this.histIdx = next;
		const item = this.history[next];
		this.syncInputs(item.word);
		if (item.aiHtml) {
			this.iframe.classList.add("hidden");
			const holder = this.showAiHolder();
			this.aiScroll?.empty();
			this.aiContext = [];
			this.mdComp?.unload();
			this.mdComp = new Component();
			const renderEl = this.aiScroll!.createDiv({ cls: "lx-ai-md" });
			void MarkdownRenderer.render(
				this.plugin.app,
				item.aiHtml,
				renderEl,
				"",
				this.mdComp as Component,
			);
			this.setStatus("");
		} else {
			this.hideAiHolder();
			this.iframe.classList.remove("hidden");
			const s = this.sources.find((x) => x.id === item.sourceId);
			if (s?.mdict) {
				const res = s.mdict.lookup(item.word);
				if (res?.definition != null) {
					const doc = this.buildDoc(res.definition, s.mdict, s.resources);
					this.renderIframe(doc);
					this.setStatus("");
				}
			}
		}
		this.updatePrevWord();
	}

	private updatePrevWord(): void {
		// 顶部显示“上一个查的词”：可点击切回；无上一个词时隐藏
		const prev = this.histIdx > 0 ? this.history[this.histIdx - 1].word : "";
		this.prevWordLabel.textContent = prev;
		this.prevWordLabel.classList.toggle("hidden", !prev);
	}

	/** 同步顶部大输入框与底部迷你搜索框的值（任一处查词/切词都保持一致） */
	private syncInputs(w: string): void {
		this.input.value = w;
		this.searchMini.value = w;
	}

	private renderIframe(doc: string): void {
		this.missEl?.addClass("hidden");
		this.iframe.classList.remove("hidden");
		// 悬浮窗形态：词典内容整体缩小 12%，避免大字号排版在加宽面板内仍被遮挡
		if (this.root.hasClass("lx-floating")) {
			doc += '<style data-lx-zoom="1">body{zoom:0.88}</style>';
		}
		this.iframe.srcdoc = doc;
		// 新词条从顶部看起（词典在上，AI 区在下方）
		this.contentInner.scrollTop = 0;
		this.updateScrollbar();
		// 词典内容高度自适应：iframe 撑到内容实际高度，全文统一由 inner 滚动查看
		this.iframe.onload = () => {
			this.bindIframeKeys();
			try {
				const docEl = this.iframe.contentDocument?.scrollingElement;
				if (!docEl) return;
				const h = Math.ceil(docEl.scrollHeight) || 0;
				this.iframe.style.height = h > 0 ? `${h}px` : "auto";
				this.updateScrollbar();
				// 词典内容渲染后顶部栏高度可能有变化（Tab 增删/激活态），同步刷新腾位高度
				this.syncTopHeight();
			} catch (e) {
				/* 跨域/异常时忽略 */
			}
		};
	}

	/**
	 * iframe 是独立文档，内部按键不会冒泡到外层 document。
	 * 每次 srcdoc 加载后在其文档上监听 keydown：
	 * - Esc：直接关闭面板
	 * - 含修饰键的组合（Ctrl/Meta/Alt+…）：转发合成事件到外层 document，
	 *   让 Obsidian 命令热键（收藏 / 发音 / 关闭面板等）在 iframe 聚焦时同样触发。
	 * 常见编辑键（复制/全选/粘贴/撤销等）不转发，保留 iframe 内原有行为。
	 */
	private bindIframeKeys(): void {
		const doc = this.iframe.contentDocument;
		if (!doc) return;
		const skip = new Set(["c", "a", "v", "x", "z", "y"]);
		doc.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					if (this.shown) this.hide();
					return;
				}
				if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
				if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
				const k = e.key.toLowerCase();
				if ((e.ctrlKey || e.metaKey) && !e.shiftKey && skip.has(k)) return;
				e.preventDefault();
				e.stopPropagation();
				document.dispatchEvent(
					new KeyboardEvent("keydown", {
						key: e.key,
						code: e.code,
						ctrlKey: e.ctrlKey,
						metaKey: e.metaKey,
						shiftKey: e.shiftKey,
						altKey: e.altKey,
						bubbles: true,
						cancelable: true,
					}),
				);
			},
			true,
		);
	}

	/** 右侧细进度条：inner 整体滚动进度（词典全文 + AI 回答统一滚动） */
	private updateScrollbar(): void {
		const el = this.contentInner;
		if (!el) return;
		const sh = el.scrollHeight;
		const ch = el.clientHeight;
		if (sh <= ch) {
			this.scrollbarThumb.style.setProperty("height", "0%");
			this.scrollbarThumb.style.setProperty("top", "0%");
			return;
		}
		const ratio = ch / sh;
		const pos = sh - ch > 0 ? el.scrollTop / (sh - ch) : 0;
		this.scrollbarThumb.style.height = `${Math.max(6, ratio * 100).toFixed(2)}%`;
		this.scrollbarThumb.style.top = `${(pos * (1 - ratio) * 100).toFixed(2)}%`;
	}

	/** 显示 AI 区：内容自适应高度（AI 回答多高就多高），词典+AI 共存时整体由 inner 统一滚动 */
	private showAiHolder(): HTMLElement {
		this.missEl?.addClass("hidden");
		this.aiHolder?.removeClass("lx-ai-hidden");
		this.divider?.removeClass("hidden");
		this.updateScrollbar();
		return this.aiHolder as HTMLElement;
	}

	private hideAiHolder(): void {
		this.aiHolder?.addClass("lx-ai-hidden");
		this.divider?.addClass("hidden");
		if (this.aiHolder) {
			this.aiHolder.style.removeProperty("flex");
			this.aiHolder.style.removeProperty("height");
		}
		this.updateScrollbar();
	}

	/** AI 区底部独立的追问输入行（不遮挡释义内容） */
	private buildAskBar(): void {
		if (!this.contentWrap) return;
		// 追问条是第三个独立板块：挂在 contentWrap 底部，与词典区、AI 区平级；
		// 绝不挂进 AI 区内（避免挤压 AI 回答高度、也避免 AI 区隐藏时追问条一起消失）
		// 追问条是第三个独立板块：挂在面板 root 底部（contentWrap 之外），不参与词典/AI 滚动。
		// 默认带 lx-ask-collapsed 向下收起：没用 AI 时不占底部空间，生成完内容才滑出。
		const bar = this.root.createDiv({ cls: "lx-ai-ask lx-ask-collapsed" });
		this.askBar = bar;
		// 收起态高度归零，但仍占位以便 CSS 过渡；滑出时移除该类
		bar.addEventListener("transitionend", () => this.updateScrollbar());
		const inp = bar.createEl("input", {
			cls: "lx-ai-ask-input",
			attr: { placeholder: "追问 AI…", spellcheck: "false" },
		});
		const btn = bar.createEl("button", { cls: "lx-ai-ask-btn", text: "追问" });
		const send = () => void this.askFollowUp();
		btn.addEventListener("click", send);
		inp.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				send();
			}
		});
		this.aiAskInput = inp;
	}

	/** 当前笔记归属的单词（顶部输入框优先，其次历史当前词） */
	private noteWord(): string {
		return (this.input.value.trim() || this.currentWord()).trim();
	}

	/** 展开/收起笔记浮层 */
	private async toggleNotePop(): Promise<void> {
		if (this.notePopOpen) {
			this.closeNotePop();
			return;
		}
		const w = this.noteWord();
		if (!w) {
			this.setStatus("暂无词条：先查一个词再写笔记", 3000);
			return;
		}
		this.buildNotePop();
		this.notePop?.removeClass("hidden");
		this.notePopOpen = true;
		this.noteWordAtOpen = w;
		this.noteBtn?.addClass("on");
		this.noteInput!.value = await this.plugin.loadNote(w);
		this.autoGrowNote();
		this.noteInput!.focus();
	}

	/** 收起笔记浮层（面板关闭、换词、再次点按钮都走这里） */
	private closeNotePop(): void {
		if (!this.notePopOpen) return;
		this.notePopOpen = false;
		this.notePop?.addClass("hidden");
		this.noteBtn?.removeClass("on");
	}

	private buildNotePop(): void {
		const pop = this.notePop;
		if (!pop) return;
		pop.empty();
		const head = pop.createDiv({ cls: "lx-note-pop-head" });
		head.createSpan({ cls: "lx-note-pop-title", text: "笔记" });
		const close = head.createEl("button", {
			cls: "lx-note-pop-close",
			text: "✕",
			attr: { "aria-label": "关闭" },
		});
		close.addEventListener("click", () => this.closeNotePop());
		this.noteInput = pop.createEl("textarea", {
			cls: "lx-note-input",
			attr: {
				placeholder: "记点想法…（仅收藏后保存）",
				rows: "1",
				spellcheck: "false",
			},
		});
		this.noteInput.addEventListener("input", () => this.autoGrowNote());
		const ops = pop.createDiv({ cls: "lx-note-pop-ops" });
		this.noteHint = ops.createSpan({ cls: "lx-note-hint", text: "" });
		const save = ops.createEl("button", { cls: "lx-note-save", text: "保存" });
		save.addEventListener("click", () => void this.saveNoteCurrent());
	}

	/** 文本区高度自适应：1 行起步，最多约 3 行，超出在内部滚动，绝不撑大面板 */
	private autoGrowNote(): void {
		const el = this.noteInput;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 66)}px`;
	}

	/** 保存笔记：只对已收藏单词落盘，未收藏仅提示 */
	private async saveNoteCurrent(): Promise<void> {
		const w = this.noteWord();
		if (!w) return;
		const text = this.noteInput?.value ?? "";
		const ok = await this.plugin.saveNote(w, text);
		if (!ok) {
			this.plugin.toast.show("请先收藏该单词，笔记仅对已收藏的单词保存", {
				key: "lx-note",
				duration: 3600,
			});
			if (this.noteHint) {
				this.noteHint.setText("未收藏 · 未保存");
				this.noteHint.addClass("warn");
			}
			return;
		}
		this.plugin.toast.show("笔记已保存", { key: "lx-note" });
		if (this.noteHint) {
			this.noteHint.setText("已保存");
			this.noteHint.removeClass("warn");
		}
	}

	/** 追问条向上滑出：仅在 AI 释义内容生成结束后调用，避免生成过程中一直占着底部空间 */
	private showAskBar(): void {
		this.askBar?.removeClass("lx-ask-collapsed");
	}

	/** 追问条向下收起：面板打开/关闭、AI 关闭、请求失败时复位 */
	private hideAskBar(): void {
		this.askBar?.addClass("lx-ask-collapsed");
	}

	/** 基于当前词条对话上下文继续追问 AI（多轮流式） */
	private async askFollowUp(): Promise<void> {
		const q = this.aiAskInput?.value.trim();
		if (!q) return;
		const cfg = this.plugin.settings.ai as AIConfig;
		if (!cfg.apiKey) {
			this.setStatus("AI 未配置：请在设置中填写 API Key 与地址", 4000);
			return;
		}
		this.aiAskInput!.value = "";
		this.aiContext.push({ role: "user", content: q });
		this.setStatus("AI 回答中…", 0);
		this.aiAbort?.abort();
		this.aiAbort = new AbortController();
		const signal = this.aiAbort.signal;
		this.showAiHolder();
		// 自动滚到 AI 区：分隔线停在 50% 极限处，词典上半屏仍可见
		this.contentInner.scrollTop = this.contentInner.scrollHeight;
		this.mdComp?.unload();
		this.mdComp = new Component();
		const renderEl = this.aiScroll!.createDiv({ cls: "lx-ai-md lx-ai-follow" });
		renderEl.createSpan({ cls: "lx-ai-streaming", text: "正在生成…" });
		let md = "";
		let timer: number | null = null;
		const paint = async () => {
			renderEl.empty();
			await MarkdownRenderer.render(
				this.plugin.app,
				md || "…",
				renderEl,
				"",
				this.mdComp as Component,
			);
		};
		try {
			const stream = await aiLookupStream(cfg, q, signal, "", this.aiContext);
			for await (const chunk of stream) {
				md += chunk;
				if (timer == null) {
					timer = window.setTimeout(() => {
						timer = null;
						void paint();
					}, 90);
				}
			}
			if (timer != null) {
				window.clearTimeout(timer);
				timer = null;
			}
			await paint();
			this.aiContext.push({ role: "assistant", content: md });
			this.setStatus("");
			// 追问回答完成，确保追问条处于滑出态
			this.showAskBar();
		} catch (e: any) {
			if (e?.name === "AbortError") return;
			this.setStatus(`AI 失败：${e?.message ?? "未知错误"}`, 0);
			if (!md) {
				renderEl.empty();
				renderEl.createDiv({
					cls: "lx-ai-error",
					text: `AI 失败：${e?.message ?? "未知错误"}`,
				});
			}
		}
	}

	/**
	 * inner 滚动联动：更新右侧进度条；悬浮窗形态下把滚动位置连续映射为顶部栏收起进度（无级），
	 * 不再有"超过阈值才收起"的跳变，因此临界态不会闪动。
	 * 收起全程 = Tab 行高度 + 头部可压缩量；若内容可滚动距离小于收起全程（内容短），
	 * 按比例缩放——滚到底即完全收起，滚回顶部即完全展开，任何长度都稳定无闪。
	 */
	/** Tab 已在内容滚动区内随内容上走，无需任何收起联动；滚动只负责更新滚动条 */
	private onInnerScroll(): void {
		this.updateScrollbar();
	}

	/** 顶部栏（header）完整高度缓存（--lx-top-h 同步来源） */
	private topHeight = 0;

	/** AI 渲染完成后，若 AI 区完全在可视区下方（词典过长时），自动滚到 AI 区顶部；可见则不打断阅读 */
	private scrollToAi(): void {
		const holder = this.aiHolder;
		const el = this.contentInner;
		if (!holder || !el) return;
		const top = holder.offsetTop;
		if (top > el.scrollTop + el.clientHeight - 24) {
			el.scrollTop = Math.max(0, top - 12);
			this.updateScrollbar();
		}
	}

	/**
	 * 写入底部状态文字。
	 * 带默认自动清除：此前「已收藏：xxx」「已取消收藏：xxx」写进去就再没人清，
	 * 会一直挂在面板底部直到下一次操作覆盖，看着像提示不会消失。
	 * @param autoClearMs 自动清除延时；传 0 表示常驻（如持续性的错误说明）
	 */
	private setStatus(text: string, autoClearMs = 2500): void {
		this.statusText.textContent = text;
		this.statusText.classList.toggle("hidden", !text);
		if (this.statusClearTimer != null) {
			window.clearTimeout(this.statusClearTimer);
			this.statusClearTimer = null;
		}
		if (text && autoClearMs > 0) {
			this.statusClearTimer = window.setTimeout(() => {
				this.statusClearTimer = null;
				this.statusText.textContent = "";
				this.statusText.classList.add("hidden");
			}, autoClearMs);
		}
	}

	/** 命中状态：小字胶囊 tag（词典名）+ 词条数，不喧宾夺主；点胶囊弹出源切换列表 */
	private setStatusTag(name: string, wordCount: number): void {
		this.statusEl.addClass("lx-has-switch");
		this.statusTag.textContent = shortName(name, 16);
		this.statusTag.title = name;
		this.statusCount.textContent =
			wordCount > 0
				? `· ${wordCount.toLocaleString()} 词条`
				: "· 在线";
		this.statusText.addClass("hidden");
		this.statusEl.classList.remove("hidden");
	}

	/** 在状态胶囊下方展开所有解释源，点击即切换（顶部 Tab 的补充入口） */
	private toggleSourceSwitch(anchor: HTMLElement): void {
		if (this.sourceSwitchEl) {
			this.sourceSwitchEl.remove();
			this.sourceSwitchEl = null;
			return;
		}
		const wrap = this.statusEl.createDiv({ cls: "lx-source-switch" });
		for (const s of this.sources) {
			const item = wrap.createEl("button", {
				cls:
					"lx-source-item" + (s.id === this.activeSourceId ? " active" : ""),
				text: shortName(s.name, 24),
			});
			item.title = s.name;
			item.addEventListener("click", () => {
				wrap.remove();
				this.sourceSwitchEl = null;
				if (s.id === this.activeSourceId) return;
				this.activeSourceId = s.id;
				this.renderTabs();
				const w = this.input.value.trim() || this.currentWord();
				if (w) void this.lookup(w, false);
			});
		}
		this.sourceSwitchEl = wrap;
		window.setTimeout(() => {
			document.addEventListener("mousedown", this.closeSourceSwitch, {
				once: true,
			});
		}, 0);
	}

	private closeSourceSwitch = (e: MouseEvent): void => {
		const t = e.target as HTMLElement;
		if (this.sourceSwitchEl && !this.sourceSwitchEl.contains(t)) {
			this.sourceSwitchEl.remove();
			this.sourceSwitchEl = null;
		}
	};

	/**
	 * 词条 HTML 资源改写，统一链路：磁盘配套资源(DictResources) → MDD 内资源 → 原样保留。
	 * 覆盖 link/script/img 的 src/href（含 file://、bres:、相对路径）与 sound:/bres: 内嵌引用。
	 */
	buildDoc(html: string, mdict: LinguaNexMdict, resources?: DictResources): string {
		// v0.11.2 起本地 .mdx 采用信任模式：不再剥离 <script>/on* 事件——
		// 柯林斯等词典的"点击展开释义"等交互依赖内联脚本，消毒会导致内容区完全不可交互。
		// 风险提示：请勿加载来源不明的 .mdx 文件（详见 SECURITY.md）。
		const resolve = (raw: string): string | null => {
			const clean = raw
				.replace(/^file:\/\/\//i, "")
				.replace(/^bres:\/?/i, "")
				.replace(/^sound:\/?/i, "")
				.replace(/^\\+/, "")
				.replace(/^\/+/, "");
			const name = clean.split(/[\\/]/).pop() ?? clean;
			if (!name) return null;
			// 1) 磁盘配套资源（同目录 css/js/ini）
			const disk = resources?.urlFor(name);
			if (disk) return disk;
			// 2) MDD 内资源：依次尝试原 key、去前缀 key、basename、小写 basename
			const tries = [clean, name, name.toLowerCase()];
			for (const key of tries) {
				const url = mdict.resourceAsBlobUrl(key, mimeByExt(key));
				if (url) return url;
			}
			return null;
		};

		// CSS 内联：优先把样式文本内联为 <style>（欧路等词典 CSS 常带相对 url() 资源，
		// 仅替换 <link> 会因 blob 加载时序导致渲染不全）；拿不到文本再回退 blob link。
		const inlineCss = (raw: string): string | null => {
			const clean = raw
				.replace(/^file:\/\/\//i, "")
				.replace(/^bres:\/?/i, "")
				.replace(/^\/+/, "");
			const name = clean.split(/[\\/]/).pop() ?? clean;
			if (!name) return null;
			let css: string | null = resources?.contentFor(name) ?? null;
			if (css == null) {
				const data = mdict.resource(name);
				if (data) {
					try {
						css = new TextDecoder().decode(data);
					} catch (e) {
						css = null;
					}
				}
			}
			if (css == null) return null;
			css = css.replace(
				/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
				(u, q: string, r: string) => {
					if (/^(data:|https?:|blob:|#)/i.test(r)) return u;
					const url = resolve(r);
					return url ? `url(${url})` : u;
				},
			);
			return css;
		};

		let out = html;
		// link 整标签处理：能内联则内联，能解析则换 blob，都失败则整体删除（绝不残留原样标签文本）
		out = out.replace(/<link\b[^>]*>/gi, (tag) => {
			const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
			if (!hrefMatch) return "";
			const href = hrefMatch[1] as string;
			if (/^(data:|https?:|blob:)/i.test(href)) return tag;
			const css = inlineCss(href);
			if (css != null) return `<style data-lx-inline="1">${css}</style>`;
			const url = resolve(href);
			return url ? `<link rel="stylesheet" href="${url}" type="text/css" />` : "";
		});
		// 兜底：清除解析后仍可能残留的残缺 link 标签文本（防某些词典 HTML 的畸形写法）
		out = out.replace(/<\s*\/?\s*link\b[^>]*>?/gi, "");
		out = out.replace(/(<script[^>]*src=["'])([^"']+)(["'])/gi, (m, pre, src: string, post) => {
			if (/^(data:|https?:|blob:)/i.test(src)) return m;
			const url = resolve(src);
			return url ? pre + url + post : m;
		});
		out = out.replace(/(<img[^>]*src=["'])([^"']+)(["'])/gi, (m, pre, src: string, post) => {
			if (/^(data:|https?:|blob:)/i.test(src)) return m;
			const url = resolve(src);
			return url ? pre + url + post : m;
		});
		// 释义内发音链接：<a href="sound://xxx.mp3">🔊</a> → 可点击播放的发音按钮
		out = out.replace(
			/<a\b[^>]*href\s*=\s*["']sound:\/\/[^"']+["'][^>]*>(.*?)<\/a>/gi,
			(m, inner: string) => {
				const hrefMatch = m.match(
					/href\s*=\s*["'](sound:\/\/[^"']+)["']/i,
				);
				const key = hrefMatch?.[1].replace(/^sound:\/+/, "") ?? "";
				const url = key
					? mdict.resourceAsBlobUrl(key, "audio/mpeg")
					: null;
				if (!url) return m;
				const label = inner.replace(/<[^>]+>/g, "").trim() || "🔊";
				return `<span class="lx-sound-btn" data-src="${url}" title="点击发音">${label}</span>`;
			},
		);
		// 裸 sound:// 资源（src/href 之外）：直接内嵌迷你播放器
		out = out.replace(/sound:\/\/[^\s"'<>]+/gi, (m) => {
			const url = mdict.resourceAsBlobUrl(
				m.replace(/^sound:\/+/, ""),
				"audio/mpeg",
			);
			return url
				? `<audio controls preload="none" src="${url}" style="height:26px;min-width:110px;vertical-align:middle"></audio>`
				: m;
		});
		out = out.replace(/bres:([^\s"'<>]+)/gi, (m, key: string) => {
			const url = resolve(key);
			return url ?? m;
		});
		// 发音按钮点击播放脚本（srcdoc 内可执行）
		if (out.includes("lx-sound-btn")) {
			out +=
				`<script>document.addEventListener('click',function(e){var t=e.target.closest('.lx-sound-btn');if(t){e.preventDefault();new Audio(t.getAttribute('data-src')).play().catch(function(){})}});<\/script>`;
		}
		return out;
	}

	async speakCurrent(): Promise<void> {
		const w = this.input.value.trim() || this.currentWord();
		if (!w) return;
		const audio = this.plugin.settings.audio;
		// 1) 当前在线词条（有道）：按发音变体直接播 dictvoice
		if (audio.youdaoEnabled && this.currentOnline) {
			const url =
				audio.youdaoVariant === 2
					? this.currentOnline.audioUs || this.currentOnline.audioBr
					: this.currentOnline.audioBr || this.currentOnline.audioUs;
			if (url && (await playAudioUrl(url))) return;
		}
		// 2) 当前词典 mdd 内置音频
		if (audio.localEnabled) {
			const soundPath = extractSoundPath(this.currentDoc);
			if (soundPath) {
				const s = this.sources.find(
					(x) => !x.isAI && !x.isOnline && x.mdict,
				);
				if (s?.mdict && (await playMddAudio(s.mdict, soundPath))) return;
			}
		}
		// 3) 有道在线兜底：本地词典无声（大 mdd 被跳过等）时仍能发音
		if (audio.youdaoEnabled && this.plugin.settings.online?.youdao?.enabled) {
			const entry = await this.plugin.youdao.query(w);
			if (entry) {
				const url =
					audio.youdaoVariant === 2
						? entry.audioUs || entry.audioBr
						: entry.audioBr || entry.audioUs;
				if (url && (await playAudioUrl(url))) return;
			}
		}
		// 4) Free Dictionary 轻量源兜底
		if (audio.freeEnabled && this.plugin.settings.online?.freeDict?.enabled) {
			const entry = await this.plugin.freeDict.query(w);
			if (entry) {
				const url =
					audio.freeVariant === "us"
						? entry.audioUs || entry.audioBr
						: entry.audioBr || entry.audioUs;
				if (url && (await playAudioUrl(url))) return;
			}
		}
		if (this.plugin.settings.tts.enabled) speakTTS(w, this.plugin.settings.tts.rate);
	}

	/** 按当前词刷新收藏星标激活态：已收藏显示黄色 ★，未收藏显示 ☆ */
	async refreshFavState(word?: string): Promise<void> {
		const w = ((word ?? this.input.value.trim()) || this.currentWord()).trim();
		const fav = w ? await this.plugin.isFavorited(w) : false;
		this.favBtn.setText(fav ? "★" : "☆");
		this.favBtn.toggleClass("active", fav);
	}

	async favCurrent(): Promise<void> {
		const w = this.input.value.trim() || this.currentWord();
		if (!w) return;
		const faved = await this.plugin.isFavorited(w);
		if (faved) {
			await this.plugin.removeFromDefaultBook(w);
			this.setStatus(`已取消收藏：${w}`);
			this.plugin.toast.show(`已取消收藏：${w}`, { key: "lx-fav", duration: 2200 });
		} else {
			await this.plugin.addToDefaultBook(w);
			this.setStatus(`已收藏：${w}`);
		}
		await this.refreshFavState(w);
	}

	dispose(): void {
		this.mdComp?.unload();
		this.mdComp = null;
		this.debugUnsub?.();
		this.debugUnsub = null;
		if (window.visualViewport) {
			window.visualViewport.removeEventListener("resize", this.onVvResizeEv);
			window.visualViewport.removeEventListener("scroll", this.onVvScrollEv);
		}
		window.removeEventListener("resize", this.onWinResizeEv);
		this.stopKbPoll();
		if (this.statusClearTimer != null) {
			window.clearTimeout(this.statusClearTimer);
			this.statusClearTimer = null;
		}
		this.root.detach();
	}
}
