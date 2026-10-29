/**
 * 选区词边界吸附（word snapping）。
 *
 * 背景：pdf.js 的 textLayer 把一行文字切成多个 <span>，触摸/鼠标选区的
 * 起止点按字符偏移走、不按单词吸附——手指稍偏就会丢首字母或带上相邻括号。
 * 这里在不改动用户实际选区（避免触发 selectionchange 循环、不干扰系统
 * 复制菜单）的前提下，读取选区所在块内的全部文本节点，把选区逻辑边界
 * 向两侧扩展到完整单词，并剥掉首尾括号/标点。
 *
 * 触发方：选中取词功能条、PDF 双击查词。
 */

/** 判定是否单词字符：字母 + 词内连字符/撇号（如 well-known、it's） */
function isWordChar(ch: string): boolean {
	return /[A-Za-z0-9'\-]/.test(ch);
}

/**
 * 返回吸附后的选区文本；无法吸附（跨块、无文本节点等）时返回 null，
 * 调用方回退到 sel.toString()。
 */
export function snapSelectionToWord(sel: Selection): string | null {
	if (sel.isCollapsed || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);

	// 选区容器：优先 pdf.js textLayer，否则退到共同祖先元素
	const anchorEl =
		range.startContainer.nodeType === Node.TEXT_NODE
			? range.startContainer.parentElement
			: (range.startContainer as Element);
	const container =
		anchorEl?.closest(".textLayer") ??
		(range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
			? (range.commonAncestorContainer as Element)
			: range.commonAncestorContainer.parentElement);
	if (!container) return null;

	// 按文档序收集容器内全部文本节点，拼成整串并记录每个节点的全局偏移
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	const offsets: number[] = [];
	let total = 0;
	let node = walker.nextNode();
	while (node) {
		nodes.push(node as Text);
		offsets.push(total);
		total += (node as Text).data.length;
		node = walker.nextNode();
	}
	if (!nodes.length || total === 0) return null;

	const indexOf = (t: Text): number => nodes.indexOf(t);

	// 选区起止点 → 全局偏移（兼容反向拖选：start 可能在 focus 之后）
	const toGlobal = (n: Node, off: number): number | null => {
		if (n.nodeType !== Node.TEXT_NODE) return null;
		const i = indexOf(n as Text);
		return i < 0 ? null : offsets[i] + off;
	};
	const g1 = toGlobal(range.startContainer, range.startOffset);
	const g2 = toGlobal(range.endContainer, range.endOffset);
	if (g1 == null || g2 == null) return null;

	const text = nodes.map((n) => n.data).join("");
	let start = Math.min(g1, g2);
	let end = Math.max(g1, g2);

	// 1) 先剥掉选区首尾误带的非单词字符（括号、引号、空白、标点）
	while (start < end && !isWordChar(text[start])) start++;
	while (end > start && !isWordChar(text[end - 1])) end--;
	if (start >= end) return null;

	// 2) 再向两侧扩展到完整单词边界（找回被手指丢掉的首尾字母）
	while (start > 0 && isWordChar(text[start - 1])) start--;
	while (end < total && isWordChar(text[end])) end++;

	return text.slice(start, end);
}
