/**
 * 词典 HTML 消毒。
 *
 * 威胁模型：查词内容最终被写进 `srcdoc` iframe，而 iframe 的 sandbox 是
 * `allow-scripts allow-same-origin`。srcdoc 文档继承宿主 origin，加上
 * `allow-same-origin` 后它与 Obsidian **同源** —— 注入内容里的任何脚本都能直接
 * 操作宿主 DOM、读 localStorage、读写插件数据。
 *
 * 内容来源都不可信：
 * - 本地 `.mdx` 词典：用户从网上下载的第三方文件，可含 <script> / on*= 事件
 * - 在线源（有道 / Free Dictionary / 翻译）：外部接口返回
 *
 * 因此注入前必须剥离可执行内容。注意：这里只清洗**外部内容**，
 * 插件自己追加的发音按钮脚本在消毒之后拼上，不受影响。
 */

/** <script>...</script> 整块 */
const SCRIPT_BLOCK = /<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi;
/** 成对的可嵌入外部资源标签 */
const EMBED_BLOCK = /<\s*(iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
/** 单标签形式（含 <base>，可改写文档基准地址） */
const EMBED_SELF = /<\s*(iframe|object|embed|form|base)\b[^>]*>/gi;
/** 内联事件属性 onClick= / onmouseover= 等 */
const EVENT_ATTR = /\son[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/** javascript: 伪协议（href/src/action 等） */
const JS_URL = /\b(href|src|action|formaction|background|poster)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
/** data:text/html 内嵌文档 */
const DATA_HTML_URL = /\b(href|src)\s*=\s*(["'])\s*data\s*:\s*text\/html[^"']*\2/gi;
/** 表达式类 CSS（IE 遗留，仍列为风险） */
const CSS_EXPRESSION = /expression\s*\(/gi;

/**
 * 清洗不可信的词典 HTML。
 * 保留 <link>/<img>/<a href="sound://..."> 等查词管线依赖的结构，
 * 只移除脚本、事件属性与可执行 URL。
 */
export function sanitizeDictHtml(html: string): string {
	if (!html) return html;
	let out = html;
	out = out.replace(SCRIPT_BLOCK, "");
	out = out.replace(EMBED_BLOCK, "");
	out = out.replace(EMBED_SELF, "");
	out = out.replace(EVENT_ATTR, "");
	out = out.replace(JS_URL, "");
	out = out.replace(DATA_HTML_URL, "");
	out = out.replace(CSS_EXPRESSION, "");
	return out;
}
