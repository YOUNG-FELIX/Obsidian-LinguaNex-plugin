import { ItemView, WorkspaceLeaf, Modal, App, MarkdownRenderer, Component } from "obsidian";
import type LinguaNexPlugin from "../main";
import type { LinguaNexMdict } from "../core/mdict";
import type { DictItem, LinguaNexSettings } from "../settings";
import { applyRating, sortByDue, DEFAULT_REVIEW, type ReviewConfig, type DailyStats } from "../core/vocab";
import type { VocabEntry } from "../core/vocab";
import { aiLookupStream } from "../core/ai";

/** 通用删除/危险操作确认弹窗；确认后执行回调 */
class ConfirmModal extends Modal {
	constructor(
		app: App,
		private plugin: LinguaNexPlugin,
		private title: string,
		private message: string,
		private onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		const box = this.contentEl.createDiv({ cls: "lx-confirm" });
		box.createEl("p", { text: this.message });
		const ops = box.createDiv({ cls: "lx-confirm-ops" });
		const ok = ops.createEl("button", { cls: "mod-cta", text: "确认" });
		ok.addEventListener("click", async () => {
			this.close();
			try {
				await this.onConfirm();
			} catch (e: any) {
				this.plugin.toast.show(`操作失败：${e?.message ?? "未知错误"}`, {
					key: "lx-confirm-err",
					duration: 4000,
				});
			}
		});
		const cancel = ops.createEl("button", { text: "取消" });
		cancel.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export const DICT_MANAGER_VIEW = "lingua-nex-manager";
export const VOCAB_REVIEW_VIEW = "lingua-nex-review";

/** 词典管理视图：词典列表 + 生词本管理 */
export class DictManagerView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LinguaNexPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return DICT_MANAGER_VIEW;
	}

	getDisplayText(): string {
		return "LinguaNex · 词典管理";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {}

	/** 供设置页改完 AI/在线源开关后强制重绘，避免必须重启插件才生效 */
	reload(): void {
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("lingua-nex-manager");

		root.createEl("h3", { text: "词典书架" });
		// 本地词典与在线词典并入同一列表，按真实优先级降序显示（与设置页一致，可统一 ↑↓ 排序）
		const onlineMeta: Record<string, string> = {
			youdao: "dict.youdao.com · 联网查中文释义与英/美发音",
			freeDict: "dictionaryapi.dev · 联网查英文释义与发音",
		};
		type ShelfRow = {
			kind: "local" | "online";
			key: string;
			name: string;
			enabled: boolean;
			priority: number;
			meta: string;
			local?: DictItem;
		};
		const rows: ShelfRow[] = [
			...this.plugin.settings.dictionaries.map((d) => ({
				kind: "local" as const,
				key: d.path,
				name: d.name,
				enabled: d.enabled,
				priority: d.priority,
				meta: "",
				local: d,
			})),
			...(Object.keys(this.plugin.settings.online) as (keyof LinguaNexSettings["online"])[]).map(
				(key) => {
					const cfg = this.plugin.settings.online[key];
					return {
						kind: "online" as const,
						key,
						name: key === "youdao" ? "有道词典（在线）" : "Free Dictionary（在线）",
						enabled: cfg.enabled,
						priority: cfg.priority,
						meta: onlineMeta[key] ?? "",
					};
				},
			),
		].sort((a, b) => b.priority - a.priority);
		if (!rows.length) {
			root.createEl("p", {
				text: "暂无词典，请在设置中添加词典目录并扫描。",
				cls: "lingua-nex-empty",
			});
		} else {
			const shelf = root.createDiv({ cls: "lx-shelf" });
			for (const r of rows) {
				const card = shelf.createDiv({
					cls: "lx-shelf-card" + (r.enabled ? " on" : ""),
				});
				const titleWrap = card.createDiv({ cls: "lx-shelf-title-row" });
				titleWrap.createDiv({ cls: "lx-shelf-title", text: r.name });
				if (r.kind === "online") {
					titleWrap.createSpan({ cls: "lx-online-tag", text: "online" });
				}
				const meta = r.kind === "local" && r.local
					? (() => {
							const loaded = this.plugin.loadedDicts.find(
								(m) => m.dictPath === r.key,
							);
							return loaded
								? `${loaded.info.wordCount.toLocaleString()} 词条 · 载入 ${loaded.info.initMs}ms`
								: "未加载";
						})()
					: r.meta;
				card.createDiv({ cls: "lx-shelf-meta", text: meta });
				const ops = card.createDiv({ cls: "lx-shelf-ops" });
				const en = ops.createEl("button", {
					cls: "lx-sort-btn" + (r.enabled ? " on" : ""),
					text: r.enabled ? "启用" : "停用",
				});
				en.title = "启用/停用";
				en.addEventListener("click", async () => {
					if (r.kind === "local" && r.local) {
						r.local.enabled = !r.local.enabled;
						await this.plugin.saveSettings();
						await this.plugin.reloadDictionaries();
					} else {
						const cfg = this.plugin.settings.online[r.key as keyof LinguaNexSettings["online"]];
						cfg.enabled = !cfg.enabled;
						await this.plugin.saveSettings();
					}
					this.render();
				});
				const up = ops.createEl("button", { cls: "lx-sort-btn", text: "↑" });
				up.title = "上移";
				up.addEventListener("click", () =>
					void this.moveRow(rows, r, -1),
				);
				const down = ops.createEl("button", { cls: "lx-sort-btn", text: "↓" });
				down.title = "下移";
				down.addEventListener("click", () =>
					void this.moveRow(rows, r, 1),
				);
				if (r.kind === "local" && r.local) {
					const del = ops.createEl("button", {
						cls: "lx-sort-btn lx-danger",
						text: "✕",
					});
					del.title = "移出书架（不删除文件）";
					del.addEventListener("click", async () => {
						new ConfirmModal(
							this.app,
							this.plugin,
							"移出词典",
							`确定将「${r.name}」移出书架吗？仅移除配置，不会删除词典文件。`,
							async () => {
								this.plugin.settings.dictionaries =
									this.plugin.settings.dictionaries.filter(
										(x) => x.path !== r.key,
									);
								await this.plugin.saveSettings();
								await this.plugin.reloadDictionaries();
								this.render();
							},
						).open();
					});
				}
			}
		}

		root.createEl("h3", { text: "生词本书架" });
		void this.renderBooks(root);
	}

	/** 书架内上下移动调整优先级（本地/在线统一），越靠前查词越优先 */
	private async moveRow(
		rows: { kind: "local" | "online"; key: string; local?: DictItem }[],
		r: { kind: "local" | "online"; key: string; local?: DictItem },
		delta: number,
	): Promise<void> {
		const i = rows.indexOf(r);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= rows.length) return;
		[rows[i], rows[j]] = [rows[j], rows[i]];
		rows.forEach((x, idx) => {
			const p = rows.length - idx;
			if (x.kind === "local" && x.local) {
				x.local.priority = p;
			} else {
				this.plugin.settings.online[x.key as keyof LinguaNexSettings["online"]].priority = p;
			}
		});
		await this.plugin.saveSettings();
		await this.plugin.reloadDictionaries();
		this.render();
	}

	private async renderBooks(root: HTMLElement): Promise<void> {
		const books = await this.plugin.vocab.books();
		const shelf = root.createDiv({ cls: "lx-shelf" });
		if (!books.length) {
			shelf.createEl("p", {
				text: "暂无生词本，创建一个开始积累词汇。",
				cls: "lingua-nex-empty",
			});
		}
		for (const b of books) {
			const entries = await this.plugin.vocab.entries(b);
			const card = shelf.createDiv({ cls: "lx-shelf-card book" });
			card.createDiv({ cls: "lx-shelf-title", text: b });
			card.createDiv({ cls: "lx-shelf-meta", text: `${entries.length} 词` });
			card.setAttr("title", "点击进入该生词本复习");
			// 点击卡片：自动跳转到生词复习页并加载该生词本
			card.addEventListener("click", () => {
				void this.plugin.openReview(b);
			});
			const ops = card.createDiv({ cls: "lx-shelf-ops" });
			const del = ops.createEl("button", {
				cls: "lx-sort-btn lx-danger",
				text: "删除",
			});
			del.addEventListener("click", async (e) => {
				e.stopPropagation();
				new ConfirmModal(
					this.app,
					this.plugin,
					"删除生词本",
					`确定删除生词本「${b}」及其全部词条吗？此操作不可恢复。`,
					async () => {
						await this.plugin.vocab.deleteBook(b);
						this.render();
					},
				).open();
			});
		}
		const createRow = root.createDiv({ cls: "lx-book-create" });
		const input = createRow.createEl("input", {
			cls: "lx-input",
			attr: { placeholder: "新生词本名称" },
		});
		const btn = createRow.createEl("button", { cls: "lx-mini-btn", text: "新建" });
		btn.addEventListener("click", async () => {
			const name = input.value.trim();
			if (!name) return;
			await this.plugin.vocab.createBook(name);
			this.render();
		});
	}
}

/** 生词学习视图：卡片流 + 三键评级 */
export class VocabReviewView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LinguaNexPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VOCAB_REVIEW_VIEW;
	}

	getDisplayText(): string {
		return "LinguaNex · 生词复习";
	}

	getIcon(): string {
		return "cards";
	}

	async onOpen(): Promise<void> {
		// 从词典管理书架跳转进入时，消费待打开的生词本
		if (this.plugin.pendingReviewBook) {
			this.book = this.plugin.pendingReviewBook;
			this.plugin.pendingReviewBook = "";
		}
		this.render();
	}

	async onClose(): Promise<void> {
		this.heatmapPopover?.remove();
		this.heatmapPopover = null;
	}

	/** 供设置页改完 AI/在线源开关后强制重绘：源列表与笔记区一并刷新，不用重启插件 */
	reload(): void {
		this.render();
	}

	/** 热力图日期面板挂在 body 上，重绘/关闭视图时一并移除，避免节点残留 */
	private heatmapPopover: HTMLElement | null = null;

	private mode: "list" | "deck" | "plan" = "list";
	/** plan 之前的模式：点「复习数据」后切回时恢复 */
	private prevMode: "list" | "deck" = "list";
	private reviewScope: "due" | "all" = "due";
	/** 当前复习生词本；为空时回落到默认生词本 */
	private book = "";

	/** 复习算法参数（settings.vocab.review，保证字段完整） */
	private get reviewCfg(): ReviewConfig {
		const r = this.plugin.settings.vocab?.review;
		return { ...DEFAULT_REVIEW, ...(r ?? {}) };
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("lingua-nex-review");
		root.createEl("h3", { text: "生词复习" });
		void this.renderToolbar(root);
	}

	/** 顶部工具栏：选择生词本 + 复习范围 + 列表/卡片切换 */
	private async renderToolbar(root: HTMLElement): Promise<void> {
		const books = await this.plugin.vocab.books();
		if (!books.length) {
			root.createEl("p", {
				text: "暂无生词本，查词时点「收藏」即可积累。",
				cls: "lingua-nex-empty",
			});
			return;
		}
		const book = this.book || this.plugin.settings.vocab.defaultBook || books[0];
		const bar = root.createDiv({ cls: "lx-review-toolbar" });
		const sel = bar.createEl("select", { cls: "lx-select" });
		for (const b of books) {
			const opt = sel.createEl("option", { text: b, value: b });
			opt.selected = b === book;
		}
		sel.addEventListener("change", () => {
			this.book = sel.value;
			this.plugin.settings.vocab.defaultBook = sel.value;
			void this.plugin.saveSettings();
			this.render();
		});
		const scopeSel = bar.createEl("select", { cls: "lx-select" });
		const dueOpt = scopeSel.createEl("option", { text: "到期复习", value: "due" });
		const allOpt = scopeSel.createEl("option", { text: "全部", value: "all" });
		dueOpt.selected = this.reviewScope === "due";
		allOpt.selected = this.reviewScope === "all";
		scopeSel.addEventListener("change", () => {
			this.reviewScope = scopeSel.value as "due" | "all";
			this.render();
		});
		// 列表/卡片合一按钮：点击在两种复习模式间切换；plan 模式下点击返回原模式
		const modeBtn = bar.createEl("button", {
			cls: "lx-mini-btn",
			text: "切换：卡片",
		});
		// 复习数据按钮：查看未来到期复习计划（由近到远）
		const planBtn = bar.createEl("button", {
			cls: "lx-mini-btn",
			text: "复习数据",
		});
		const body = root.createDiv({ cls: "lx-review-body" });
		const renderMode = (): void => {
			body.empty();
			if (this.mode === "plan") {
				modeBtn.setText(`返回：${this.prevMode === "list" ? "列表" : "卡片"}`);
				planBtn.addClass("on");
				void this.renderPlan(body, book);
			} else {
				modeBtn.setText(this.mode === "list" ? "切换：卡片" : "切换：列表");
				planBtn.removeClass("on");
				void (this.mode === "list"
					? this.renderList(body, book)
					: this.renderQueue(body, book, this.reviewScope));
			}
		};
		modeBtn.addEventListener("click", () => {
			if (this.mode === "plan") {
				this.mode = this.prevMode;
			} else {
				this.prevMode = this.mode;
				this.mode = this.mode === "list" ? "deck" : "list";
			}
			renderMode();
		});
		planBtn.addEventListener("click", () => {
			if (this.mode === "plan") {
				this.mode = this.prevMode;
			} else {
				this.prevMode = this.mode;
				this.mode = "plan";
			}
			renderMode();
		});
		renderMode();
	}

	/** 列表模式：词条一行一条，释义按钮展开/收起，可切换本地/有道/AI 源 */
	private async renderList(root: HTMLElement, book: string): Promise<void> {
		// 按复习算法排序：该复习的在前（已到期/未安排），再按到期时间由近到远
		const entries = sortByDue(await this.plugin.vocab.entries(book));
		if (!entries.length) {
			root.createEl("p", {
				text: "生词本为空，查词时点「收藏」即可积累。",
				cls: "lingua-nex-empty",
			});
			return;
		}
		const list = root.createDiv({ cls: "lx-word-list" });
		// 上一个已评级未沉底的词行：等下一个词评级时再沉底轮转（避免释义还没看就移走）
		let prevRow: HTMLElement | null = null;
		for (const e of entries) {
			const row = list.createDiv({ cls: "lx-word-row" });
			const head = row.createDiv({ cls: "lx-word-head" });
			// 行首一行：发音 + 单词 + 已学标签（左） 与 笔记区（右上角）
			const line1 = head.createDiv({ cls: "lx-word-line1" });
			const speak = line1.createEl("button", {
				cls: "lx-icon-btn lx-speak",
				text: "🔊",
			});
			speak.title = "发音";
			speak.addEventListener("click", (ev) => {
				ev.stopPropagation();
				void this.plugin.speakWord(e.word);
			});
			line1.createSpan({ cls: "lx-word", text: e.word });
			if ((e.reviewCount ?? 0) > 0) {
				line1.createSpan({ cls: "lx-learned", text: "✓ 已学" });
			}
			const noteSlot = line1.createDiv({ cls: "lx-word-note-slot" });
			head.createDiv({
				cls: "lx-word-meta",
				text:
					`收藏 ${new Date(e.addedAt).toLocaleDateString()} · 复习 ${e.reviewCount} 次 · ` +
					`${proficiencyLabel(e)} · ${dueLabel(e)}`,
			});
			// 列表每行右上角笔记区：预览 2~3 行可滑动，长按/双击进入编辑
			// entries 已在内存中，直接把 note 传进去，避免 N 次重复读文件
			makeNoteBox(this.plugin, noteSlot).attach(book, e.word, e.note);
			const defToggle = row.createEl("button", {
				cls: "lx-def-toggle",
				text: "释义 ▾",
			});
			const defHost = row.createDiv({ cls: "lx-def-host" });
			const panel = makeDefPanel(this.plugin, defHost, e);
			let open = false;
			defToggle.addEventListener("click", () => {
				open = !open;
				defHost.toggleClass("open", open);
				defToggle.setText(open ? "收起释义 ▴" : "释义 ▾");
				if (open) void panel.load("local");
			});
			const ops = row.createDiv({ cls: "lx-word-ops" });
			for (const [g, label] of [
				[0, "忘记"],
				[1, "模糊"],
				[2, "认识"],
			] as const) {
				const btn = ops.createEl("button", {
					cls: "lx-rbtn mini",
					text: label,
				});
				btn.addEventListener("click", async () => {
					const updated = applyRating(e, g, this.reviewCfg);
					await this.plugin.vocab.update(book, e.word, updated);
					// 评级后自动展开释义，方便核对；不重绘、不移位，保留当前行位置
					open = true;
					defHost.addClass("open");
					defToggle.setText("收起释义 ▴");
					void panel.load("local");
					// 上一个已评级词沉底轮转（学过词进入循环队列），带卡片同款轻位移动画
					if (prevRow && prevRow.isConnected) {
						list.appendChild(prevRow);
						prevRow.removeClass("pop");
						void prevRow.offsetWidth; // 强制 reflow 重触发过渡
						prevRow.addClass("pop");
					}
					prevRow = row;
				});
			}
			const rm = ops.createEl("button", {
				cls: "lx-rbtn mini danger",
				text: "移除",
			});
			rm.addEventListener("click", () => {
				new ConfirmModal(
					this.app,
					this.plugin,
					"移除生词",
					`确定从「${book}」移除「${e.word}」吗？`,
					async () => {
						await this.plugin.vocab.remove(book, e.word);
						this.render();
					},
				).open();
			});
		}
		// 列表底部：折叠的算法参数设置（可配置复习计划与参数）
		this.renderAlgoSettings(root);
	}

	/** 卡片复习模式：SM-2 评级；释义默认隐藏，点按钮展开后可切换本地/有道/AI 源 */
	private async renderQueue(
		root: HTMLElement,
		book: string,
		scope: "due" | "all",
	): Promise<void> {
		const entries = scope === "due"
			? await this.plugin.vocab.dueEntries(book)
			: await this.plugin.vocab.entries(book);
		if (!entries.length) {
			root.createEl("p", {
				text: scope === "due"
					? "当前没有到期的生词，可切到「全部」复习任意词。"
					: "生词本为空，查词时点「收藏」即可积累。",
				cls: "lingua-nex-done",
			});
			return;
		}
		// 按复习算法排序：该复习的在前，再按到期时间由近到远
		const deck = sortByDue(entries);
		const card = root.createDiv({ cls: "lx-review-card" });
		// 发音按钮固定在卡片左上角：长单词换行时不再被行内流挤到右侧、与右上角笔记区重叠
		const speak = card.createEl("button", {
			cls: "lx-icon-btn lx-speak lx-card-speak",
			text: "🔊",
		});
		speak.title = "发音";
		const wordEl = card.createEl("div", { cls: "lx-review-word" });
		const metaEl = card.createEl("div", { cls: "lx-review-meta" });
		const defToggle = card.createEl("button", {
			cls: "lx-def-toggle",
			text: "显示释义 ▾",
		});

		const defHost = card.createDiv({ cls: "lx-def-host" });
		// 卡片右上角笔记区：随当前词条切换重新绑定
		const noteBox = makeNoteBox(this.plugin, card);
		const btns = root.createDiv({ cls: "lx-review-btns" });
		const again = btns.createEl("button", { cls: "lx-rbtn", text: "忘记" });
		const hard = btns.createEl("button", { cls: "lx-rbtn", text: "模糊" });
		const good = btns.createEl("button", { cls: "lx-rbtn", text: "认识" });
		const counter = root.createEl("div", { cls: "lx-review-count" });

		let idx = 0;
		let panel: { load: (source: string) => Promise<void> } | null = null;
		let defOpen = false;
		// 两段式评级：第一次点击只选定评级并展开释义，第二次点击才确认并进入下一词
		let picked: 0 | 1 | 2 | null = null;
		const rbtns = [again, hard, good];
		const resetPick = (): void => {
			picked = null;
			rbtns.forEach((b) => b.removeClass("active"));
		};

		const show = async (i: number) => {
			if (i >= deck.length) {
				root.empty();
				root.createEl("p", {
					text: `本轮复习完成，共 ${deck.length} 词。明天再来吧。`,
					cls: "lingua-nex-done",
				});
				return;
			}
			const e = deck[i];
			wordEl.textContent = e.word;
			speak.onclick = () => void this.plugin.speakWord(e.word);
			metaEl.textContent = `${proficiencyLabel(e)} · 下次 ${
				e.nextReview ? new Date(e.nextReview).toLocaleDateString() : "随时"
			}`;
			metaEl.removeClass("lx-review-status");
			resetPick();
			defHost.empty();
			defOpen = false;
			defHost.removeClass("open");
			defToggle.setText("显示释义 ▾");
			panel = makeDefPanel(this.plugin, defHost, e);
			// 切换词条时把笔记区重新绑定到当前词
			noteBox.attach(book, e.word, e.note);


			counter.textContent = `${i + 1} / ${deck.length}`;
			card.addClass("pop");
			window.setTimeout(() => card.removeClass("pop"), 300);
		};
		defToggle.addEventListener("click", () => {
			defOpen = !defOpen;
			defHost.toggleClass("open", defOpen);
			defToggle.setText(defOpen ? "收起释义 ▴" : "显示释义 ▾");
			if (defOpen && panel) void panel.load("local");
		});
		const grade = async (g: 0 | 1 | 2) => {
			const e = deck[idx];
			// 第一阶段：选定评级 + 展开释义，不写入复习数据，等待二次确认
			if (picked === null) {
				picked = g;
				rbtns.forEach((b) => b.removeClass("active"));
				(g === 0 ? again : g === 1 ? hard : good).addClass("active");
				defOpen = true;
				defHost.addClass("open");
				defToggle.setText("收起释义 ▴");
				if (panel) void panel.load("local");
				const firstLabel = g === 0 ? "忘记" : g === 1 ? "模糊" : "认识";
				metaEl.textContent = `已选「${firstLabel}」· 看完释义后再点一次评级按钮确认`;
				metaEl.addClass("lx-review-status");
				card.scrollIntoView({ behavior: "smooth", block: "start" });
				return;
			}
			// 第二阶段：以本次点击的评级为准写入复习数据，然后直接下一词
			const updated = applyRating(e, g, this.reviewCfg);
			await this.plugin.vocab.update(book, e.word, updated);
			if (g === 0) deck.push({ ...updated }); // 忘记：本轮末尾再复习一次
			resetPick();
			idx += 1;
			void show(idx);
		};
		again.addEventListener("click", () => void grade(0));
		hard.addEventListener("click", () => void grade(1));
		good.addEventListener("click", () => void grade(2));
		void show(0);
	}

	/** 复习数据：按复习日期由近到远展示待复习生词（固定高度可滑动），并汇总数量 */
	private async renderPlan(root: HTMLElement, book: string): Promise<void> {
		const cfg = this.reviewCfg;
		const groups = await this.plugin.vocab.schedule(book, cfg.planDays);
		if (!groups.length) {
			root.createEl("p", {
				text: "生词本为空，暂无复习计划。",
				cls: "lingua-nex-empty",
			});
			return;
		}
		const dueCount = groups
			.filter((g) => g.dayOffset <= 0)
			.reduce((s, g) => s + g.count, 0);
		const total = groups.reduce((s, g) => s + g.count, 0);
		root.createEl("div", {
			cls: "lx-plan-summary",
			text: `现在待复习 ${dueCount} 词 · 未来 ${cfg.planDays} 天共 ${total} 词`,
		});
		// 固定高度列表，可滑动查看
		const list = root.createDiv({ cls: "lx-plan-list" });
		for (const g of groups) {
			const group = list.createDiv({ cls: "lx-plan-group" });
			const head = group.createDiv({ cls: "lx-plan-head" });
			head.createSpan({ cls: "lx-plan-date", text: g.label });
			head.createSpan({ cls: "lx-plan-count", text: `${g.count} 词` });
			const words = group.createDiv({ cls: "lx-plan-words" });
			for (const e of g.entries) {
				const row = words.createDiv({ cls: "lx-plan-word" });
				row.createSpan({ cls: "lx-word", text: e.word });
				row.createSpan({ cls: "lx-plan-tag", text: proficiencyLabel(e) });
			}
		}
		// 月历热力图：每日复习量
		await this.renderHeatmap(root, book);
		// 复习数据面板底部：折叠的算法参数设置（可直接展开改参）
		this.renderAlgoSettings(root);
	}

	/** 算法参数设置：折叠面板，按 SM-2 算法可调参数配置复习计划 */
	private renderAlgoSettings(root: HTMLElement): void {
		const wrap = root.createDiv({ cls: "lx-algo" });
		const head = wrap.createEl("button", {
			cls: "lx-algo-head",
			text: "⚙ 算法参数设置 ▸",
		});
		const box = wrap.createDiv({ cls: "lx-algo-box" });
		let open = false;
		head.addEventListener("click", () => {
			open = !open;
			box.toggleClass("open", open);
			head.setText(open ? "⚙ 算法参数设置 ▾" : "⚙ 算法参数设置 ▸");
		});

		const cfg = this.reviewCfg;
		const fields: {
			key: keyof ReviewConfig;
			label: string;
			desc: string;
			min: number;
			step: number;
		}[] = [
			{ key: "intervalNew", label: "陌生间隔（天）", desc: "评级「忘记」后下次复习间隔", min: 0.5, step: 0.5 },
			{ key: "intervalFamiliar", label: "渐熟间隔（天）", desc: "晋级渐熟后下次复习间隔", min: 1, step: 1 },
			{ key: "intervalKnown", label: "熟悉间隔（天）", desc: "晋级熟悉后下次复习间隔", min: 1, step: 1 },
			{ key: "easeStep", label: "认识 +难度", desc: "认识评级 easeFactor 增加步长", min: 0.05, step: 0.05 },
			{ key: "easePenalty", label: "忘记 -难度", desc: "忘记评级 easeFactor 扣减量", min: 0.05, step: 0.05 },
			{ key: "hardStreak", label: "模糊晋级连对", desc: "模糊评级连续答对次数后晋级渐熟", min: 1, step: 1 },
			{ key: "goodStreak", label: "认识晋级连对", desc: "认识评级连续答对次数后晋级熟悉", min: 1, step: 1 },
			{ key: "planDays", label: "计划展示天数", desc: "复习数据面板展示的未来天数", min: 7, step: 1 },
		];
		const grid = box.createDiv({ cls: "lx-algo-grid" });
		const inputs: HTMLInputElement[] = [];
		for (const f of fields) {
			const row = grid.createDiv({ cls: "lx-algo-row" });
			const lab = row.createDiv({ cls: "lx-algo-label" });
			lab.createSpan({ text: f.label });
			lab.createEl("small", { text: f.desc });
			const input = row.createEl("input", {
				cls: "lx-algo-input",
				attr: { type: "number", min: String(f.min), step: String(f.step) },
			});
			(input as HTMLInputElement).value = String((cfg as unknown as Record<string, number>)[f.key]);
			inputs.push(input as HTMLInputElement);
		}
		const ops = box.createDiv({ cls: "lx-algo-ops" });
		const save = ops.createEl("button", { cls: "mod-cta", text: "保存参数" });
		const reset = ops.createEl("button", { text: "恢复默认" });
		save.addEventListener("click", async () => {
			const next: ReviewConfig = { ...cfg };
			fields.forEach((f, i) => {
				const v = Number(inputs[i]?.value);
				if (!Number.isNaN(v) && v >= f.min) {
					(next as unknown as Record<string, number>)[f.key] = v;
				}
			});
			this.plugin.settings.vocab = {
				...this.plugin.settings.vocab,
				review: next,
			};
			await this.plugin.saveSettings();
			this.plugin.toast.show("复习算法参数已保存", { key: "lx-algo" });
			this.render();
		});
		reset.addEventListener("click", async () => {
			this.plugin.settings.vocab = {
				...this.plugin.settings.vocab,
				review: { ...DEFAULT_REVIEW },
			};
			await this.plugin.saveSettings();
			this.plugin.toast.show("已恢复默认复习参数", { key: "lx-algo" });
			this.render();
		});
	}

	/** 复习热力图：月历 + 每日详情 popover */
	private async renderHeatmap(root: HTMLElement, book: string): Promise<void> {
		const wrap = root.createDiv({ cls: "lx-heatmap" });
		wrap.createEl("h3", { text: "📊 学习热力图" });

		const now = new Date();
		let year = now.getFullYear();
		let month = now.getMonth(); // 0-based

		// 头部：年月切换
		const head = wrap.createDiv({ cls: "lx-hm-head" });
		const prevBtn = head.createEl("button", { cls: "lx-hm-nav", text: "‹" });
		const monthLabel = head.createEl("span", { cls: "lx-hm-label" });
		const nextBtn = head.createEl("button", { cls: "lx-hm-nav", text: "›" });

		// 星期表头
		const weekdayRow = wrap.createDiv({ cls: "lx-hm-weekdays" });
		for (const d of ["一", "二", "三", "四", "五", "六", "日"]) {
			weekdayRow.createEl("span", { text: d });
		}
		// 月历格（6 行 × 7 列 = 42 格）
		const grid = wrap.createDiv({ cls: "lx-hm-grid" });

		this.heatmapPopover?.remove();
		const popover = document.createElement("div");
		popover.addClass("lx-hm-popover");
		popover.style.display = "none";
		document.body.appendChild(popover);
		this.heatmapPopover = popover;
		const closePopover = (): void => {
			popover.style.display = "none";
			popover.empty();
		};
		wrap.addEventListener("click", (e) => {
			if (!wrap.contains(e.target as Node)) closePopover();
		});

		const MAX_LEVEL = 4; // 4 档 + 空
		const render = async (): Promise<void> => {
			monthLabel.setText(`${year} 年 ${month + 1} 月`);
			grid.empty();
			const daily = await this.plugin.vocab.getDailyStats(book, year, month);
			// 找最大 count 来定 4 档阈值
			let maxCount = 0;
			daily.forEach((s) => { if (s.count > maxCount) maxCount = s.count; });
			// 4 档阈值：max 的 25%/50%/75%
			const t1 = Math.ceil(maxCount * 0.25);
			const t2 = Math.ceil(maxCount * 0.5);
			const t3 = Math.ceil(maxCount * 0.75);
			const levelOf = (c: number): number => {
				if (c === 0) return 0;
				if (c <= t1) return 1;
				if (c <= t2) return 2;
				if (c <= t3) return 3;
				return 4;
			};

			const firstDay = new Date(year, month, 1);
			// 周一起始（把 JS 周日 0 转周一为 0）
			let offset = firstDay.getDay() - 1;
			if (offset < 0) offset = 6;
			const daysInMonth = new Date(year, month + 1, 0).getDate();
			const prevMonthDays = new Date(year, month, 0).getDate();

			for (let i = 0; i < 42; i++) {
				let day: number;
				let isCurMonth = true;
				if (i < offset) {
					day = prevMonthDays - offset + 1 + i;
					isCurMonth = false;
				} else if (i >= offset + daysInMonth) {
					day = i - offset - daysInMonth + 1;
					isCurMonth = false;
				} else {
					day = i - offset + 1;
				}
				const cell = grid.createEl("div", { cls: "lx-hm-cell" });
				if (!isCurMonth) cell.addClass("off");
				const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
				const stats = daily.get(dateStr);
				if (stats) {
					const lv = levelOf(stats.count);
					cell.addClass(`lv-${lv}`);
					cell.textContent = String(day);
					cell.title = `${dateStr}：复习 ${stats.count} 词，去重 ${stats.uniqueWords.size} 词`;
					// 点击弹详情 popover
					cell.addEventListener("click", () => {
						closePopover();
						popover.style.display = "";
						const r = cell.getBoundingClientRect();
						popover.style.left = `${Math.min(r.left, window.innerWidth - 260)}px`;
						popover.style.top = `${r.bottom + 4}px`;
						this.renderDayPopover(popover, dateStr, stats);
					});
				} else {
					cell.textContent = String(day);
				}
			}
		};

		prevBtn.addEventListener("click", () => {
			month -= 1;
			if (month < 0) { month = 11; year -= 1; }
			void render();
		});
		nextBtn.addEventListener("click", () => {
			month += 1;
			if (month > 11) { month = 0; year += 1; }
			void render();
		});
		wrap.addEventListener("click", (e) => {
			if (!e.target) return;
			// 点 wrap 外关闭 popover
			if (!popover.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".lx-hm-cell")) {
				closePopover();
			}
		});


		// 渲染（render 是 async，用 void 挂起）
		void render();
	}

	private renderDayPopover(pop: HTMLElement, dateStr: string, s: DailyStats): void {
		pop.empty();
		pop.createEl("div", { cls: "lx-hm-pop-date", text: dateStr });

		const pct = (part: number, total: number): string =>
			total === 0 ? "—" : `${Math.round((part / total) * 100)}%`;
		const avgProf = s.proficiencyCount > 0
			? (s.proficiencySum / s.proficiencyCount).toFixed(1) : "—";
		const correctRate = s.count > 0
			? `${pct(s.known + s.fuzzy, s.count)}（认识+模糊计对）` : "—";

		const body = pop.createDiv({ cls: "lx-hm-pop-body" });
		body.createEl("div", { text: `总复习次数：${s.count}`, cls: "lx-hm-pop-row" });
		body.createEl("div", { text: `去重词数：${s.uniqueWords.size}`, cls: "lx-hm-pop-row" });
		body.createEl("div", { text: `认识 ${s.known} · 模糊 ${s.fuzzy} · 忘记 ${s.forgot}`, cls: "lx-hm-pop-row" });
		body.createEl("div", { text: `平均熟练度：${avgProf}`, cls: "lx-hm-pop-row" });
		body.createEl("div", { text: `正确率：${correctRate}`, cls: "lx-hm-pop-row" });

		if (s.words.length) {
			pop.createEl("div", { cls: "lx-hm-pop-divider" });
			const wordBox = pop.createDiv({ cls: "lx-hm-pop-words" });
			for (const w of s.words.slice(0, 30)) {
				const chip = wordBox.createEl("span", { cls: "lx-hm-chip", text: w });
				chip.title = `${w}（当日复习 ${s.wordCountMap.get(w)} 次）`;
			}
			if (s.words.length > 30) {
				wordBox.createEl("span", { cls: "lx-hm-chip more", text: `+${s.words.length - 30}` });
			}
		}
	}
}

/** 下次复习倒计时标签 */
function dueLabel(e: VocabEntry, now = Date.now()): string {
	if (e.nextReview === undefined) return "未安排 · 随时可复习";
	if (e.nextReview <= now) return "已到期 · 今天该复习";
	const days = Math.ceil((e.nextReview - now) / 86400000);
	return `${days === 1 ? "明天" : `${days} 天后`}复习 · ${new Date(e.nextReview).toLocaleDateString()}`;
}

/** 熟练度中文标签 */
function proficiencyLabel(e: VocabEntry): string {
	const p = e.proficiency ?? 0;
	return p === 0 ? "陌生" : p === 1 ? "渐熟" : "熟悉";
}

/**
 * 释义面板：顶部源切换按钮（本地词典 / 有道 / AI），点击展开后切换来源。
 * v0.6.7 起复用查词面板 LookupPanel 渲染管线：本地与有道均渲染进独立 iframe srcdoc，
 * 与查词面板完全一致（样式隔离，有道完整 HTML 不再注入页面，修复“撑满整页/样式错乱”）。
 * - local：plugin.lookupDocHtml 复用 buildDoc 完整渲染（内联 CSS、mdd 资源、发音按钮、中文隐藏）
 * - local：plugin.lookupDocHtml 复用 buildDoc 完整渲染
 * - 在线各源（有道 / Free Dictionary / 句子翻译）：与查词面板一致，凡启用且按词典管理排序的源全部显示
 * - ai：aiLookupStream 流式输出并用 Markdown 渲染，未配置 API Key 时给出提示
 */
function makeDefPanel(
	plugin: LinguaNexPlugin,
	host: HTMLElement,
	e: VocabEntry,
): { load: (source: string) => Promise<void> } {
	const panel = host.createDiv({ cls: "lx-def-panel" });
	const bar = panel.createDiv({ cls: "lx-def-srcbar" });
	const content = panel.createDiv({ cls: "lx-def-content" });
	const textEl = content.createDiv({ cls: "lx-def-text" });
	const frame = content.createEl("iframe", {
		cls: "lx-def-iframe",
		attr: {
			sandbox: "allow-scripts allow-same-origin",
			referrerpolicy: "no-referrer",
		},
	});

	// 源列表与查词面板同规则：本地词典恒有，在线源按设置启用+排序全显，AI 启用才显示
	const sources: { id: string; label: string }[] = [
		{ id: "local", label: "本地词典" },
	];
	for (const o of plugin.enabledOnlineSources()) {
		sources.push({ id: o.id, label: o.name });
	}
	if (plugin.settings.ai.enabled) sources.push({ id: "ai", label: "AI" });

	const btns: Record<string, HTMLElement> = {};
	// 手动切换源：不自动降级，尊重用户选择（未命中时停留显示提示，可自行再点其他源）
	for (const s of sources) {
		const b = bar.createEl("button", { cls: "lx-def-src", text: s.label });
		b.addEventListener("click", () => void load(s.id, false));
		btns[s.id] = b;
	}

	// 与查词面板 renderIframe 同款：srcdoc 加载后按内容实际高度撑开 iframe
	frame.addEventListener("load", () => {
		try {
			const docEl = frame.contentDocument?.scrollingElement;
			if (!docEl) return;
			const h = Math.ceil(docEl.scrollHeight) || 0;
			frame.style.height = h > 0 ? `${h}px` : "auto";
		} catch (err) {
			/* 跨域/异常时忽略 */
		}
	});

	const showFrame = (): void => {
		textEl.addClass("hidden");
		frame.removeClass("hidden");
	};
	const showText = (): void => {
		frame.addClass("hidden");
		textEl.removeClass("hidden");
	};

	let seq = 0;
	let localHtml: string | null | undefined;
	let mdComp: Component | null = null;
	const load = async (source: string, autoFallback = true): Promise<void> => {
		const my = ++seq;
		mdComp?.unload();
		mdComp = null;
		for (const k of Object.keys(btns)) btns[k].toggleClass("on", k === source);
		content.addClass("loading");
		textEl.addClass("hidden");
		frame.addClass("hidden");
		try {
			if (source === "local") {
				if (localHtml === undefined) {
					// 复用查词面板 buildDoc：内联 CSS、mdd 资源、发音按钮、中文隐藏开关
					localHtml = plugin.lookupDocHtml(e.word) || null;
				}
				if (localHtml) {
					showFrame();
					frame.srcdoc = localHtml;
				} else if (autoFallback) {
					const fb = sources.find((x) => x.id !== "local" && x.id !== "ai");
					if (fb) void load(fb.id, false);
				} else {
					showText();
					textEl.setText("（本地词典暂无释义，可点上方其他源）");
				}
			} else if (source === "ai") {
				const cfg = plugin.settings.ai;
				if (!cfg?.apiKey || !cfg?.baseUrl) {
					showText();
					textEl.setText("（未配置 AI，请在设置 → AI 中填写 API Key）");
					return;
				}
				showText();
				textEl.empty();
				mdComp = new Component();
				let acc = "";
				let timer: number | null = null;
				const paint = async () => {
					if (my !== seq) return;
					textEl.empty();
					await MarkdownRenderer.render(
						plugin.app,
						acc || "…",
						textEl,
						"",
						mdComp as Component,
					);
				};
				const stream = await aiLookupStream(
					cfg,
					e.word,
					undefined,
					"请用中文简明解释这个英文单词：给出词性、核心释义、常用搭配与 1~2 个例句。使用 Markdown，控制在 200 字以内。单词：" + e.word,
				);
				for await (const chunk of stream) {
					if (my !== seq) return;
					acc += chunk;
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
				if (!acc) textEl.setText("（AI 未返回内容）");
			} else {
				// 在线源（有道 / Free Dictionary / 句子翻译）统一走 queryOnline
				const r = await plugin.queryOnline(source, e.word);
				if (my !== seq) return;
				if (r?.doc) {
					showFrame();
					frame.srcdoc = r.doc;
				} else {
					showText();
					textEl.setText("（该在线源未返回结果，可点「AI」尝试）");
				}
			}
		} catch (err: any) {
			if (my !== seq) return;
			textEl.setText(`（加载失败：${err?.message ?? "未知错误"}）`);
		} finally {
			if (my === seq) content.removeClass("loading");
		}
	};
	return { load };
}

/**
 * 笔记区（复习面板通用：列表每行右上角 / 卡片右上角）。
 *
 * 交互约定：
 * - 默认只读预览：固定 2~3 行高，内容过长在内部滑动查看，绝不撑高所在卡片
 * - 移动端长按 500ms 进入编辑；桌面端双击或点 ✎ 图标进入编辑
 * - 保存走 plugin.saveNote：单词未收藏时只提示、不写入
 *
 * @param host 宿主容器（列表行内右上角槽位 / 卡片本体）
 * @returns attach(book, word) 绑定当前词条并载入已有笔记
 */
function makeNoteBox(
	plugin: LinguaNexPlugin,
	host: HTMLElement,
): {
	attach: (book: string, word: string, initialNote?: string) => void;
} {
	const box = host.createDiv({ cls: "lx-note-box" });
	const view = box.createDiv({ cls: "lx-note-view" });
	const editWrap = box.createDiv({ cls: "lx-note-editwrap hidden" });
	const pencil = box.createEl("button", {
		cls: "lx-note-pencil",
		text: "✎",
		attr: { "aria-label": "编辑笔记" },
	});
	pencil.title = "编辑笔记（移动端也可长按笔记区）";

	let curBook = "";
	let curWord = "";
	let note = "";
	let editing = false;

	const paintView = (): void => {
		view.empty();
		if (note) {
			view.setText(note);
			view.removeClass("empty");
		} else {
			view.setText("＋ 笔记");
			view.addClass("empty");
		}
	};

	const reload = async (): Promise<void> => {
		note = curWord ? await plugin.loadNote(curWord, curBook) : "";
		paintView();
	};

	/**
	 * 绑定当前词条并载入笔记。
	 * @param initialNote 词条对象上已有的 note 直接传入，省掉每个词条一次异步读文件
	 */
	const attach = (book: string, word: string, initialNote?: string): void => {
		curBook = book;
		curWord = word;
		if (initialNote !== undefined) {
			note = initialNote;
			paintView();
		} else {
			void reload();
		}
	};

	const endEdit = (): void => {
		editing = false;
		editWrap.empty();
		editWrap.addClass("hidden");
		view.removeClass("hidden");
		box.removeClass("editing");
	};

	const beginEdit = (): void => {
		if (editing || !curWord) return;
		editing = true;
		box.addClass("editing");
		view.addClass("hidden");
		editWrap.empty();
		editWrap.removeClass("hidden");
		const ta = editWrap.createEl("textarea", {
			cls: "lx-note-edit",
			attr: { placeholder: "记点想法…", rows: "2", spellcheck: "false" },
		});
		ta.value = note;
		// 编辑框同样最多约 3 行，超出内部滚动，不撑高卡片
		ta.addEventListener("input", () => {
			ta.style.height = "auto";
			ta.style.height = `${Math.min(ta.scrollHeight, 66)}px`;
		});
		const ops = editWrap.createDiv({ cls: "lx-note-ops" });
		const save = ops.createEl("button", { cls: "lx-note-op primary", text: "保存" });
		const cancel = ops.createEl("button", { cls: "lx-note-op", text: "取消" });
		save.addEventListener("click", () => {
			void (async () => {
				const ok = await plugin.saveNote(curWord, ta.value, curBook);
				if (!ok) {
					plugin.toast.show("请先收藏该单词，笔记仅对已收藏的单词保存", {
						key: "lx-note",
						duration: 3600,
					});
					return;
				}
				plugin.toast.show("笔记已保存", { key: "lx-note" });
				await reload();
				endEdit();
			})();
		});
		cancel.addEventListener("click", endEdit);
		ta.focus();
	};

	// 桌面端：双击进入编辑
	view.addEventListener("dblclick", (e) => {
		e.stopPropagation();
		beginEdit();
	});
	pencil.addEventListener("click", (e) => {
		e.stopPropagation();
		beginEdit();
	});

	// 移动端：长按 500ms 进入编辑（鼠标不走这条，桌面端用双击/图标）
	let pressTimer: number | null = null;
	const clearPress = (): void => {
		if (pressTimer != null) {
			window.clearTimeout(pressTimer);
			pressTimer = null;
		}
	};
	view.addEventListener("pointerdown", (e) => {
		e.stopPropagation();
		if (e.pointerType === "mouse") return;
		pressTimer = window.setTimeout(() => {
			pressTimer = null;
			beginEdit();
		}, 500);
	});
	view.addEventListener("pointerup", clearPress);
	view.addEventListener("pointermove", clearPress);
	view.addEventListener("pointercancel", clearPress);
	view.addEventListener("pointerleave", clearPress);

	// 笔记区内的一切交互都不应冒泡到外层（发音、评级等）
	box.addEventListener("click", (e) => e.stopPropagation());
	box.addEventListener("mousedown", (e) => e.stopPropagation());

	return { attach };
}

/** 视图创建工厂 */
export function makeDictManagerView(leaf: WorkspaceLeaf, plugin: LinguaNexPlugin): DictManagerView {
	return new DictManagerView(leaf, plugin);
}

export function makeVocabReviewView(leaf: WorkspaceLeaf, plugin: LinguaNexPlugin): VocabReviewView {
	return new VocabReviewView(leaf, plugin);
}

