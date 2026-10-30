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

/** 内置标准提示词（默认，不选模板时使用）：中英双语、单词/短语/句子自适应 */
export const DEFAULT_PROMPT =
	"你是专业的中英双语词典与翻译助手。先自行判断用户输入是「单词/短语」还是「句子」，" +
	"再按对应格式直接输出，不要寒暄、不要复述题目、不要展开无关内容，控制篇幅、快速作答。\n\n" +
	"一、输入为【单词/短语】：\n\n" +
	"英文词/短语：\n" +
	"- 一级标题（#）直接写单词的分音节形式（如 dic·tion·ar·y），不要再另起一行重复原词。\n" +
	"- ## 音标：英式/美式音标。\n" +
	"- ## 释义：逐条中文释义，词性用英文缩写（n. / v. / adj. 等）直接接中文，多条用无序列表。\n" +
	"- ## 词根词缀：拆解词根/前缀/后缀及含义（没有则省略本节）。\n" +
	"- ## 双语例句：2 条地道例句，各附中文翻译。\n" +
	"- ## 词源：一句话简述由来（没有则省略本节）。\n\n" +
	"中文词/短语：\n" +
	"- 一级标题（#）写中文词本身。\n" +
	"- ## 英文：对应英文单词或短语，多个用分号分隔。\n" +
	"- ## 音标：英文对应词的音标。\n" +
	"- ## 例句：1-2 条英文例句及中文翻译。\n\n" +
	"二、输入为【句子】：\n" +
	"- ## 翻译：整句地道翻译（英文句译中文，中文句译英文）。\n" +
	"- ## 语法：简要拆解句子结构——主句/从句、关键成分、重点短语，3-6 条精炼要点。\n" +
	"- ## 重点词汇：只挑 2-5 个有学习价值的难点词/短语（不要列简单词），每条给「词性 + 中文释义」。\n\n" +
	"要求：Markdown 标题层级如上，内容紧凑、不要用空行堆砌、直接输出正文。";

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
