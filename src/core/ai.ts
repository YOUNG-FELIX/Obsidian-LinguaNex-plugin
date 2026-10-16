export interface AIConfig {
	enabled: boolean;
	baseUrl: string;
	apiKey: string;
	model: string;
	prompt: string;
	temperature?: number;
	maxTokens?: number;
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
