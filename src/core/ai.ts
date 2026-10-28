/** 用户自建的自定义 Provider 预设：可命名保存，之后在预设下拉里直接切换 */
export interface AICustomProvider {
	name: string;
	baseUrl: string;
	model: string;
}

export interface AIConfig {
	enabled: boolean;
	baseUrl: string;
	apiKey: string;
	model: string;
	prompt: string;
	temperature?: number;
	maxTokens?: number;
	/** 用户保存的自定义 Provider 预设（与内置预设同列出现在下拉里） */
	customProviders?: AICustomProvider[];
	/** 最近一次「获取模型」拉到的可用模型 id 列表（缓存，供下拉选择） */
	modelList?: string[];
	/** 模型栏模式：select=从已获取列表下拉选择，input=手动填写 */
	modelMode?: "select" | "input";
}

/** 内置标准提示词（默认，不选模板时使用）：按标题组织，直接给出内容，不用序号列表 */
export const DEFAULT_PROMPT =
	"你是资深英语词典编辑。请用 Markdown 解释给定单词，直接给出内容，不要序号列表，严格按以下标题组织输出：\n\n" +
	"## 单词\n用一级标题（# 单词）大号加粗展示英文单词本身，下一行用间隔点 · 自动分音节展示读音节奏（如 # dictionary，下方写 dic·tion·ar·y）。\n\n" +
	"## 音标\n英式/美式音标。\n\n" +
	"## 释义\n逐条给出中文释义：词性一律用英文缩写直接接中文解释，如 adj. 形容词释义 / n. 名词释义 / v. 动词释义，不要使用“词性：”等中文标注；多条义项用无序列表分行列出。\n\n" +
	"## 英英释义\n用简单英文句子式释义，帮助理解。\n\n" +
	"## 词根词缀\n拆解词根/前缀/后缀并说明含义，辅助记忆。\n\n" +
	"## 双语例句\n给出 2-3 个地道例句，逐条附中文翻译。\n\n" +
	"## 词源演变\n简要说明单词由来与含义演变，作为补充知识帮助理解。\n\n" +
	"要求：结构清晰、简明扼要，不要寒暄，直接输出内容。";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 拦截明文 http 的 API 地址（localhost 与局域网私网段除外）。
 * API Key 会以 Bearer 头明文发出，走 http 等于把密钥交给链路上任何一跳。
 * 局域网段放行是为了兼容部署在内网的 Ollama / 自建网关。
 */
function assertSafeBaseUrl(base: string): void {
	if (/^https:\/\//i.test(base)) return;
	if (!/^http:\/\//i.test(base)) {
		throw new Error("API Base URL 必须是 http(s) 地址");
	}
	const host = base.replace(/^http:\/\//i, "").split(/[/?#]/)[0]?.split(":")[0] ?? "";
	const h = host.toLowerCase();
	const safe =
		h === "localhost" ||
		h === "127.0.0.1" ||
		h === "[::1]" ||
		h === "::1" ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
		/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
	if (!safe) {
		throw new Error("明文 http 会泄露 API Key，请改用 https（内网地址可豁免）");
	}
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

function buildBody(config: AIConfig, messages: ChatMessage[]): string {
	return JSON.stringify({
		model: config.model,
		messages,
		stream: true,
		temperature: config.temperature ?? 0.7,
		...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
	});
}

/** 发送流式请求，返回逐块增量文本的异步迭代器；AbortSignal 可中断，超时自动 abort */
export async function aiLookupStream(
	config: AIConfig,
	text: string,
	signal?: AbortSignal,
	promptText?: string,
	messages?: ChatMessage[],
): Promise<AsyncIterable<string>> {
	const base = config.baseUrl.replace(/\/+$/, "");
	assertSafeBaseUrl(base);
	const url = `${base}/chat/completions`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	const onOuterAbort = () => controller.abort();
	signal?.addEventListener("abort", onOuterAbort, { once: true });

	try {
		const resp = await fetch(url, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: buildBody(
				config,
				messages && messages.length > 0
					? [
							{ role: "system", content: config.prompt || DEFAULT_PROMPT },
							...messages,
						]
					: [
							{ role: "system", content: config.prompt || DEFAULT_PROMPT },
							{ role: "user", content: promptText || text },
						],
			),
		});
		if (!resp.ok) {
			const body = await resp.text().catch(() => "");
			throw new Error(`AI 请求失败 ${resp.status}: ${body.slice(0, 200)}`);
		}
		if (!resp.body) throw new Error("AI 响应无流式数据");
		return parseSSE(resp.body.getReader(), controller);
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", onOuterAbort);
	}
}

/** SSE 解析：按行读取 data: 块，逐块产出 delta.content */
async function* parseSSE(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	controller: AbortController,
): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	let buf = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });
			let idx: number;
			while ((idx = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, idx).replace(/\r$/, "");
				buf = buf.slice(idx + 1);
				if (!line.startsWith("data:")) continue;
				const data = line.slice(5).trim();
				if (!data) continue;
				if (data === "[DONE]") return;
				try {
					const json = JSON.parse(data);
					const delta =
						json?.choices?.[0]?.delta?.content ??
						json?.choices?.[0]?.message?.content;
					if (typeof delta === "string" && delta) yield delta;
				} catch {
					/* 忽略非 JSON 块（如心跳） */
				}
			}
		}
	} finally {
		reader.releaseLock();
		if (controller.signal.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}
	}
}

/**
 * 拉取服务端可用模型列表（GET /models）。
 * 供设置页「获取模型」按钮使用：拉到后写入设置，模型栏即可下拉选择，避免手填拼错。
 */
export async function fetchModels(
	config: AIConfig,
	timeoutMs = 15000,
): Promise<string[]> {
	const base = (config.baseUrl || "").trim().replace(/\/+$/, "");
	if (!base) throw new Error("请先填写 API Base URL");
	if (!config.apiKey) throw new Error("请先填写 API Key");
	assertSafeBaseUrl(base);
	const ctrl = new AbortController();
	const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const resp = await fetch(`${base}/models`, {
			headers: { Authorization: `Bearer ${config.apiKey}` },
			signal: ctrl.signal,
		});
		if (!resp.ok) {
			const body = await resp.text().catch(() => "");
			throw new Error(`HTTP ${resp.status} ${body.slice(0, 160)}`);
		}
		const data = await resp.json();
		const list: string[] = Array.isArray(data?.data)
			? data.data
					.map((m: any) => (m && typeof m.id === "string" ? m.id : ""))
					.filter(Boolean)
			: [];
		if (!list.length) throw new Error("接口未返回可用模型（data 为空）");
		// 去重后按字母序，便于在下拉里快速定位
		return [...new Set(list)].sort((a, b) => a.localeCompare(b));
	} finally {
		window.clearTimeout(timer);
	}
}

/** 非流式聚合调用（兼容旧用法，聚合全部块） */
export async function aiLookup(
	config: AIConfig,
	text: string,
	signal?: AbortSignal,
	promptText?: string,
): Promise<string> {
	const stream = await aiLookupStream(config, text, signal, promptText);
	let out = "";
	for await (const chunk of stream) out += chunk;
	if (!out.trim()) throw new Error("AI 返回内容为空");
	return out;
}
