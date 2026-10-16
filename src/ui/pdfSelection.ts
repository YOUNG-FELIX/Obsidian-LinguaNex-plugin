/**
 * LinguaNex - PDF Selection Handler
 * 双击 PDF（pdf.js textLayer）查词 + 选区右键菜单（查词/生词本/AI 翻译/AI 详解）。
 *
 * 移植自 fleurdict(MIT) pdf-selection-handler.ts，适配 LinguaNex 现有管线：
 * - 双击查词复用 plugin.lookupFromSelection(word, rect)，自动按 drawer/hover 模式路由
 * - 右键菜单项复用 plugin.favWord / plugin.aiTranslateText / plugin.aiExplainText
 * - 选区守卫：Obsidian PDF 阅读器在弹层聚焦时会清空 DOM 选区，用 savedRange 在
 *   selectionchange 时立即恢复，保持高亮驻留。
 */

import { Menu } from "obsidian";
import type LinguaNexPlugin from "../main";

export class PdfSelectionHandler {
	private plugin: LinguaNexPlugin;
	private lookupInFlight = false;

	// 选区守卫：面板打开期间 PDF 阅读器清空选区时立即恢复
	private savedRange: Range | null = null;
	private guardActive = false;
	private guardListener: (() => void) | null = null;

	constructor(plugin: LinguaNexPlugin) {
		this.plugin = plugin;
	}

	register(): void {
		// 双击 PDF textLayer 触发查词（capture 阶段，确保 pdf.js 的文本层先经过我们）
		this.plugin.registerDomEvent(document, "dblclick", (evt: MouseEvent) => {
			this.handleDblClick(evt);
		}, true);

		// 右键 PDF 选区打开 LinguaNex 菜单（独立开关，与双击查词互不影响）
		this.plugin.registerDomEvent(document, "contextmenu", (evt: MouseEvent) => {
			this.handleContextMenu(evt);
		}, true);
	}

	unregister(): void {
		this.stopSelectionGuard();
	}

	private handleDblClick(evt: MouseEvent): void {
		if (!this.plugin.settings.pdf?.lookupEnabled) return;

		const target = evt.target as HTMLElement | null;
		if (!target) return;

		// 忽略面板内部的双击
		if (target.closest(".lx-panel") || target.closest(".lx-floating")) return;

		// 仅响应 pdf.js 文本层（PDF 阅读器 + pdf-embed 嵌入块）
		const textLayer = target.closest(".textLayer");
		if (!textLayer) return;

		const selection = window.getSelection();
		const raw = selection?.toString() || "";
		const word = this.normalizePdfSelection(raw);
		if (!word) return;

		// 保存选区，PDF 阅读器弹层聚焦清空选区时可恢复
		this.savedRange = selection && selection.rangeCount > 0
			? selection.getRangeAt(0).cloneRange()
			: null;

		const rect = selection && selection.rangeCount > 0
			? selection.getRangeAt(0).getBoundingClientRect()
			: null;
		if (!rect || (rect.width === 0 && rect.height === 0)) return;

		void this.lookupWord(word, rect);
	}

	private handleContextMenu(evt: MouseEvent): void {
		// 独立开关：仅受「PDF 右键菜单」控制。关闭时原地返回，不拦截原生菜单。
		if (!this.plugin.settings.pdf?.contextMenu) return;

		const target = evt.target as HTMLElement | null;
		if (!target) return;

		// 忽略面板内右键
		if (target.closest(".lx-panel") || target.closest(".lx-floating")) return;

		const textLayer = target.closest(".textLayer");
		if (!textLayer) return;

		const selection = window.getSelection();
		const raw = selection?.toString() || "";
		const normalized = this.normalizePdfSelection(raw);
		if (!normalized) return; // 无英文选区——交给 Obsidian 原生菜单

		evt.preventDefault();
		evt.stopPropagation();

		// 查词用单词/短语；AI 翻译/详解用整段选区
		const match = normalized.match(/[a-zA-Z][a-zA-Z'\-\s,;:!?]*[a-zA-Z']?/);
		const cleanWord = (match ? match[0] : normalized).trim();
		const fullSelection = raw.trim();

		// 菜单打开期间保持选区高亮
		this.savedRange = selection && selection.rangeCount > 0
			? selection.getRangeAt(0).cloneRange()
			: null;
		this.startSelectionGuard();

		const menu = new Menu();
		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle("LinguaNex 查词")
				.setIcon("book-open")
				.onClick(() => {
					const r = this.savedRange;
					this.stopSelectionGuard();
					if (r) this.restoreSavedSelection();
					const sel = window.getSelection();
					const rect = sel && sel.rangeCount > 0
						? sel.getRangeAt(0).getBoundingClientRect()
						: null;
					if (rect && rect.width > 0 && rect.height > 0) {
						void this.lookupWord(cleanWord, rect);
					}
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("加入生词本")
				.setIcon("bookmark")
				.onClick(() => {
					this.stopSelectionGuard();
					void this.plugin.favWord(cleanWord);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("AI 翻译")
				.setIcon("languages")
				.onClick(() => {
					// 关闭守卫避免与 AI 面板抢选区
					this.stopSelectionGuard();
					void this.plugin.aiTranslateText(fullSelection);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("AI 详解")
				.setIcon("sparkles")
				.onClick(() => {
					this.stopSelectionGuard();
					void this.plugin.aiExplainText(fullSelection);
				});
		});

		menu.addSeparator();
		menu.showAtMouseEvent(evt);
	}

	/**
	 * 清理 pdf.js textLayer 提取文本：
	 * 软连字符、跨行断词、连字、unicode 破折号、折叠空白、首尾标点。
	 */
	private normalizePdfSelection(raw: string): string | null {
		if (!raw) return null;

		let text = raw
			.replace(/\u00AD/g, "")                            // soft hyphen
			.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")      // 跨行断词：exam-\nple -> example
			.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-") // unicode 破折号 -> ASCII 连字符
			.replace(/\uFB00/g, "ff")
			.replace(/\uFB01/g, "fi")
			.replace(/\uFB02/g, "fl")
			.replace(/\uFB03/g, "ffi")
			.replace(/\uFB04/g, "ffl")
			.replace(/\s+/g, " ")
			.trim();

		// 剥离选区首尾误带的标点
		text = text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}']+$/u, "");

		if (!text || !/[a-zA-Z]/.test(text)) return null;

		// 防御：多行误选不淹没词典，最多取 8 个词
		const tokens = text.split(" ");
		if (tokens.length > 8) {
			text = tokens.slice(0, 8).join(" ");
		}

		return text;
	}

	/** 查词并展示（悬浮/抽屉由 plugin.lookupFromSelection 按模式路由） */
	private async lookupWord(queryWord: string, rect: DOMRect): Promise<void> {
		if (this.lookupInFlight) return;
		this.lookupInFlight = true;

		const word = queryWord.trim().toLowerCase();

		try {
			const posX = rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
			const posY = rect.height > 0 ? rect.bottom : window.innerHeight / 2;
			const useRect = new DOMRect(posX - rect.width / 2, posY, rect.width, rect.height);
			this.plugin.lookupFromSelection(word, useRect);
			// 面板打开期间保持选区高亮
			this.startSelectionGuard();
		} catch (error) {
			console.error("LinguaNex PDF: Lookup failed:", error);
		} finally {
			this.lookupInFlight = false;
		}
	}

	/** 面板打开期间监控 selectionchange，PDF 阅读器清空选区时立即恢复 */
	private startSelectionGuard(): void {
		if (!this.savedRange) return;
		if (this.guardActive) return;

		this.guardActive = true;
		this.guardListener = () => {
			// 面板已关闭？停止守卫并释放保存的选区
			if (!this.plugin.isPanelVisible()) {
				this.stopSelectionGuard();
				return;
			}
			const sel = window.getSelection();
			if (sel && sel.toString().length === 0 && this.savedRange) {
				this.restoreSavedSelection();
			}
		};
		document.addEventListener("selectionchange", this.guardListener);
	}

	private stopSelectionGuard(): void {
		if (this.guardListener) {
			document.removeEventListener("selectionchange", this.guardListener);
			this.guardListener = null;
		}
		this.guardActive = false;
		this.savedRange = null;
	}

	private restoreSavedSelection(): void {
		if (!this.savedRange) return;
		const sel = window.getSelection();
		if (!sel) return;
		try {
			sel.removeAllRanges();
			sel.addRange(this.savedRange);
		} catch (e) {
			// pdf.js 重渲染后 Range 可能已失效——静默忽略
			console.warn("LinguaNex PDF: Could not restore selection", e);
		}
	}
}
