/**
 * 调试日志（仅内存，不落盘、不遥测）。
 *
 * 设置 → 调试 →「调试模式」开启后，插件关键路径（查词、键盘避让、选区、
 * AI 请求等）向环形缓冲区写入带时间戳的日志；查词面板上的调试台实时展示，
 * 支持滚动查看与一键复制，方便用户把日志贴给开发者定位问题。
 * 关闭开关即清空缓冲区，日志不会写入任何文件。
 */

const MAX_LINES = 300;

const lines: string[] = [];
let enabled = false;
const listeners = new Set<() => void>();

export function setDebugLogging(on: boolean): void {
	enabled = on;
	if (!on) lines.length = 0;
	else dlog("debug", "调试模式已开启（日志仅保存在内存，不写盘）");
}

export function debugLoggingEnabled(): boolean {
	return enabled;
}

/** 写一条日志；调试模式关闭时为零开销直接返回 */
export function dlog(tag: string, msg: string): void {
	if (!enabled) return;
	const t = new Date();
	const pad = (n: number): string => String(n).padStart(2, "0");
	const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
	lines.push(`[${ts}] [${tag}] ${msg}`);
	if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
	for (const l of listeners) l();
}

export function getDebugLog(): string {
	return lines.join("\n");
}

/** 订阅日志变化；返回退订函数 */
export function onDebugLog(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
