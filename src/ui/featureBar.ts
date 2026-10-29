import type LinguaNexPlugin from "../main";
import { extractSoundPath } from "../core/audio";
import { snapSelectionToWord } from "../core/wordSnap";
import { dlog } from "../core/debugLog";

// 选区长度不做上限：长难句、整段文本都可直接选中触发工具条（原 128 字符限制过短）

/** 任意面板选中内容后显示的悬浮工具条：查词 / AI / 发音 / 收藏 */
export class FeatureBar {
	private bar: HTMLElement;
	private wordEl: HTMLElement;
	private enabled = false;
	/** 缓存最近一次选区的词与位置：按钮点击时选区可能已被系统菜单清空 */
	private lastWord = "";
	private lastRect: DOMRect | null = null;
	/** 自动查词去重：同一单词在窗口内不重复弹出 */
	private lastAutoWord = "";
	private lastAutoTs = 0;

	constructor(private plugin: LinguaNexPlugin) {
		this.bar = document.body.createDiv({ cls: "lingua-nex-fbar" });
		this.wordEl = this.bar.createSpan({ cls: "lx-fbar-word" });
		const look = this.bar.createEl("button", { cls: "lx-fbar-btn", text: "查词" });
		const ai = this.bar.createEl("button", { cls: "lx-fbar-btn lx-fbar-ai", text: "AI" });
		const speak = this.bar.createEl("button", { cls: "lx-fbar-btn", text: "发音" });
		const fav = this.bar.createEl("button", { cls: "lx-fbar-btn", text: "收藏" });
		look.addEventListener("click", () => {
			const w = this.lastWord;
			if (!w || !this.lastRect) return;
			// 按当前模式路由：悬浮模式弹悬浮释义窗，抽屉模式打开面板
			this.plugin.lookupFromSelection(w, this.lastRect);
			this.hide();
		});
		ai.addEventListener("click", () => {
			const w = this.lastWord;
			if (!w) return;
			this.plugin.aiLookupWord(w);
			this.hide();
		});
		speak.addEventListener("click", async () => {
			const w = this.lastWord;
			if (!w) return;
			await this.plugin.speakWord(w);
			this.hide();
		});
		fav.addEventListener("click", async () => {
			const w = this.lastWord;
			if (!w) return;
			await this.plugin.favWord(w);
			this.hide();
		});
		document.addEventListener("scroll", () => this.hide(), true);
	}

	/** 选区变化入口（由 main.ts 的全局 selectionchange 监听调用，与实例创建解耦） */
	onSelectionChanged(): void {
		// 工具条或「选中自动查词」任一开启才处理：autoLookup 不依赖工具条开关
		if (!this.enabled && !this.plugin.settings.lookup.autoLookup) return;
		window.setTimeout(() => this.maybeShow(), 20);
	}

	/**
	 * 开关状态由 plugin.applyFeatureBarState 统一推入：
	 * ribbon 点击、命令热键、设置页开关三条路径最终都汇聚到这里，保证状态只有一个真源。
	 */
	setEnabled(v: boolean): void {
		this.enabled = v;
		if (!v) this.hide();
	}

	private currentSelection(): string {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) return "";
		// 查词面板/悬浮窗内选中（如复制释义）不触发工具条与自动查词
		if (sel.anchorNode && this.plugin.panelEl.contains(sel.anchorNode)) {
			return "";
		}
		const text = (snapSelectionToWord(sel) ?? sel.toString()).trim();
		// 不做长度/换行限制：长难句、整段文本都可触发（面板内选区已在上面排除）
		if (!text) return "";
		return text;
	}

	private maybeShow(): void {
		const w = this.currentSelection();
		if (!w) {
			this.hide();
			return;
		}
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const rect = sel.getRangeAt(0).getBoundingClientRect();
		if (!rect || (rect.width === 0 && rect.height === 0)) return;
		// 缓存选中词与位置：按钮点击时选区可能已被系统菜单清空，必须在此落值
		this.lastWord = w;
		this.lastRect = rect;
		dlog("fbar", `选中 "${w.length > 60 ? w.slice(0, 60) + "…" : w}"`);
		// 开启「选中自动查词」：直接按当前模式查词并收起工具条，不展示按钮
		if (this.plugin.settings.lookup.autoLookup) {
			const now = Date.now();
			if (w === this.lastAutoWord && now - this.lastAutoTs < 800) return;
			this.lastAutoWord = w;
			this.lastAutoTs = now;
			this.plugin.lookupFromSelection(w, rect);
			this.hide();
			return;
		}
		this.wordEl.textContent = w;
		this.bar.addClass("shown");
		const bw = this.bar.offsetWidth || 160;
		const bh = this.bar.offsetHeight || 34;
		let left = rect.left + rect.width / 2 - bw / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
		// 优先放选中内容下方（避免被系统复制菜单遮挡）；放不下再放上方
		let top = rect.bottom + 10;
		if (top + bh > window.innerHeight - 8) top = rect.top - bh - 10;
		if (top < 0) top = rect.bottom + 10;
		this.bar.style.left = `${left}px`;
		this.bar.style.top = `${top}px`;
	}

	private hide(): void {
		this.bar.removeClass("shown");
	}

	dispose(): void {
		this.bar.detach();
	}
}
