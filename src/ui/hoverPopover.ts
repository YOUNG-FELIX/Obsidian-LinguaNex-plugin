import type LinguaNexPlugin from "../main";

const MAX_SELECT_LEN = 64;

/**
 * 悬浮窗查词模式：选中单词后在选区旁弹出简洁释义卡（无阴影、贴合面板风格）。
 * 仅在 settings.lookup.mode === "hover" 时启用；点外部 / 滚动 / Esc 关闭。
 */
export class HoverPopover {
	private pop: HTMLElement | null = null;
	private enabled = false;

	constructor(private plugin: LinguaNexPlugin) {}

	/** 模式切换：真正注册/移除全局监听（旧实现只改布尔值，导致悬浮窗永不关闭） */
	setEnabled(v: boolean): void {
		if (v) this.enable();
		else this.disable();
	}

	enable(): void {
		this.enabled = true;
		document.addEventListener("selectionchange", this.onSel);
		document.addEventListener("scroll", this.onScroll, true);
		document.addEventListener("mousedown", this.onDocMouseDown);
		document.addEventListener("keydown", this.onKeyDown);
	}

	disable(): void {
		this.enabled = false;
		document.removeEventListener("selectionchange", this.onSel);
		document.removeEventListener("scroll", this.onScroll, true);
		document.removeEventListener("mousedown", this.onDocMouseDown);
		document.removeEventListener("keydown", this.onKeyDown);
		this.hide();
	}

	private onKeyDown = (e: KeyboardEvent): void => {
		if (e.key === "Escape") this.hide();
	};

	private onSel = (): void => {
		if (!this.enabled) return;
		window.setTimeout(() => this.maybeShow(), 60);
	};

	private onScroll = (): void => this.hide();

	private onDocMouseDown = (e: MouseEvent): void => {
		if (this.pop && !this.pop.contains(e.target as Node)) this.hide();
	};

	private maybeShow(): void {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) {
			this.hide();
			return;
		}
		const text = sel.toString().trim();
		if (!text || text.length > MAX_SELECT_LEN || /\n/.test(text)) {
			this.hide();
			return;
		}
		// 从选区提取第一个英文单词
		const m = text.match(/[A-Za-z][A-Za-z'\-]*/);
		if (!m) {
			this.hide();
			return;
		}
		const word = m[0];
		if (sel.rangeCount === 0) return;
		const rect = sel.getRangeAt(0).getBoundingClientRect();
		if (!rect || (rect.width === 0 && rect.height === 0)) return;
		this.render(word, rect);
	}

	/** 供工具条等入口直接显示悬浮释义（hover 模式查词按钮走此方法） */
	showWord(word: string, rect: DOMRect): void {
		if (!this.enabled) return;
		this.render(word, rect);
	}

	private render(word: string, rect: DOMRect): void {
		if (!this.pop) {
			this.pop = document.body.createDiv({ cls: "lx-hover-pop" });
		}
		this.pop.empty();

		// 头部：单词 + 发音 + 关闭叉
		const head = this.pop.createDiv({ cls: "lx-hover-head" });
		head.createSpan({ cls: "lx-hover-word", text: word });
		const speak = head.createEl("button", {
			cls: "lx-icon-btn lx-speak",
			text: "🔊",
		});
		speak.title = "发音";
		speak.addEventListener("click", () => void this.plugin.speakWord(word));
		const close = head.createEl("button", {
			cls: "lx-icon-btn lx-hover-close",
			text: "✕",
		});
		close.title = "关闭";
		close.addEventListener("click", () => this.hide());

		// 内容区：直接复用抽屉同款完整渲染（iframe srcdoc，含资源解析与内联 CSS）
		const frame = this.pop.createEl("iframe", { cls: "lx-hover-frame" });
		const html = this.plugin.lookupDocHtml(word);
		frame.srcdoc =
			html ||
			"<html><body style='font:12.5px sans-serif;padding:8px;color:#333'>（词典暂无释义）</body></html>";

		const foot = this.pop.createDiv({ cls: "lx-hover-foot" });
		const full = foot.createEl("button", {
			cls: "lx-mini-btn",
			text: "完整释义",
		});
		full.addEventListener("click", () => {
			this.plugin.openLookup(word);
			this.hide();
		});
		const ai = foot.createEl("button", { cls: "lx-mini-btn", text: "AI 释义" });
		ai.addEventListener("click", () => {
			this.plugin.aiLookupWord(word);
			this.hide();
		});
		const fav = foot.createEl("button", { cls: "lx-mini-btn", text: "收藏" });
		fav.addEventListener("click", () => {
			void this.plugin.favWord(word);
		});

		this.pop.addClass("shown");
		const pw = this.pop.offsetWidth || 260;
		const ph = this.pop.offsetHeight || 120;
		let left = rect.left;
		if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
		left = Math.max(8, left);
		let top = rect.bottom + 6;
		if (top + ph > window.innerHeight - 8) top = rect.top - ph - 6;
		if (top < 0) top = rect.bottom + 6;
		this.pop.style.left = `${left}px`;
		this.pop.style.top = `${top}px`;
	}

	private hide(): void {
		if (this.pop) this.pop.removeClass("shown");
	}

	dispose(): void {
		this.disable();
		if (this.pop) this.pop.detach();
		this.pop = null;
	}
}
