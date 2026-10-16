/**
 * LinguaNex 句子翻译引擎
 * - MyMemoryTranslator：免 Key（api.mymemory.translated.net），已实测可用，有免费额度
 * - BaiduTranslator：百度翻译开放平台（需用户在设置中填写 appid + secret，免费版有月度字符限额）
 */
import { requestUrl } from "obsidian";
import type { TranslateConfig } from "../settings";

/* ---------------- 简易 MD5（百度开放平台 sign 需要） ---------------- */
// RFC 1321 参考实现精简版，仅用于生成百度翻译签名
function md5(input: string): string {
	function rotl(x: number, c: number): number {
		return (x << c) | (x >>> (32 - c));
	}
	function toBytes(s: string): number[] {
		const out: number[] = [];
		for (let i = 0; i < s.length; i++) {
			let c = s.charCodeAt(i);
			if (c < 0x80) out.push(c);
			else if (c < 0x800) {
				out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
			} else if (c < 0xd800 || c >= 0xe000) {
				out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
			} else {
				// 代理对（基本只出现在生僻字/emoji，百度翻译场景极少）
				i++;
				const hi = c & 0x3ff;
				const lo = s.charCodeAt(i) & 0x3ff;
				c = 0x10000 + (hi << 10) + lo;
				out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
			}
		}
		return out;
	}
	const K = [0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391];
	const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
	const bytes = toBytes(input);
	const bitLen = bytes.length * 8;
	bytes.push(0x80);
	while (bytes.length % 64 !== 56) bytes.push(0);
	for (let i = 0; i < 8; i++) bytes.push((bitLen >>> (i * 8)) & 0xff);
	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
	const G = (x: number, y: number, z: number) => (x & z) | (y & ~z);
	const H = (x: number, y: number, z: number) => x ^ y ^ z;
	const I = (x: number, y: number, z: number) => y ^ (x | ~z);
	for (let off = 0; off < bytes.length; off += 64) {
		const M: number[] = [];
		for (let i = 0; i < 16; i++) {
			M[i] = bytes[off + i * 4] | (bytes[off + i * 4 + 1] << 8) | (bytes[off + i * 4 + 2] << 16) | (bytes[off + i * 4 + 3] << 24);
		}
		let A = a0, B = b0, C = c0, D = d0;
		for (let i = 0; i < 64; i++) {
			let fv: number, g: number;
			if (i < 16) { fv = F(B, C, D); g = i; }
			else if (i < 32) { fv = G(B, C, D); g = (5 * i + 1) % 16; }
			else if (i < 48) { fv = H(B, C, D); g = (3 * i + 5) % 16; }
			else { fv = I(B, C, D); g = (7 * i) % 16; }
			const tmp = (D + rotl(A + fv + K[i] + M[g], S[i])) >>> 0;
			D = C; C = B; B = (B + tmp) >>> 0; A = tmp;
		}
		a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
	}
	const hex = (n: number) => n.toString(16).padStart(8, "0");
	return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/* ---------------- 翻译提供方 ---------------- */

interface TranslateResult {
	text: string;
	sourceName: string;
}

/** MyMemory 免 Key 翻译（句子级，有每日免费额度；quotaFinished 时返回 null） */
async function myMemoryTranslate(text: string, from: string, to: string): Promise<TranslateResult | null> {
	const url =
		"https://api.mymemory.translated.net/get?q=" +
		encodeURIComponent(text) +
		"&langpair=" +
		encodeURIComponent(`${from}|${to}`);
	try {
		const resp = await requestUrl({
			url,
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
			},
			throw: false,
		});
		if (resp.status !== 200) return null;
		const data = resp.json;
		const out = data?.responseData?.translatedText;
		if (typeof out !== "string" || !out) return null;
		if (data?.quotaFinished === true) return null;
		return { text: out, sourceName: "MyMemory（在线翻译）" };
	} catch (e) {
		return null;
	}
}

/** 百度翻译开放平台（需 appid + secret；免费版有月度字符限额） */
async function baiduTranslate(
	text: string,
	from: string,
	to: string,
	appid: string,
	secret: string,
): Promise<TranslateResult | null> {
	if (!appid || !secret) return null;
	const salt = String(Date.now() + Math.floor(Math.random() * 10000));
	const sign = md5(appid + text + salt + secret);
	try {
		const resp = await requestUrl({
			url:
				"https://fanyi-api.baidu.com/api/trans/vip/translate?q=" +
				encodeURIComponent(text) +
				`&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&appid=${encodeURIComponent(appid)}&salt=${salt}&sign=${sign}`,
			method: "GET",
			throw: false,
		});
		if (resp.status !== 200) return null;
		const data = resp.json;
		if (data?.error_code) return null;
		const dst = data?.trans_result?.[0]?.dst;
		if (typeof dst !== "string" || !dst) return null;
		return { text: dst, sourceName: "百度翻译（开放平台）" };
	} catch (e) {
		return null;
	}
}

/** 语言自动检测：英文字母占比高 → en；否则 zh-CN */
function detectLang(text: string): string {
	const en = (text.match(/[A-Za-z]/g) || []).length;
	const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	if (cjk > en) return "zh-CN";
	return "en";
}

/** 统一翻译入口：按配置选择提供方，失败自动降级 */
export async function translateSentence(
	cfg: TranslateConfig,
	text: string,
): Promise<{ text: string; sourceName: string } | null> {
	const q = text.trim();
	if (!q) return null;
	const from = detectLang(q);
	const to = from === "en" ? "zh-CN" : "en";
	if (cfg.provider === "baidu" && cfg.baiduAppid && cfg.baiduSecret) {
		const r = await baiduTranslate(q, from, to, cfg.baiduAppid, cfg.baiduSecret);
		if (r) return r;
	}
	const m = await myMemoryTranslate(q, from, to);
	if (m) return m;
	return null;
}

/* ---------------- 翻译结果渲染（复用在线词典面板样式） ---------------- */

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** 翻译结果渲染为 iframe 可直接显示的 HTML（原句 + 译文） */
export function buildTranslateDoc(
	text: string,
	translated: string,
	sourceName: string,
): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
	body{margin:0;padding:12px 14px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;background:#fff;line-height:1.6}
	@media (prefers-color-scheme: dark){body{color:#ddd;background:#1e1e1e}}
	.lx-ts-orig{font-size:17px;font-weight:600;color:var(--text-normal,#222)}
	@media (prefers-color-scheme: dark){.lx-ts-orig{color:#eee}}
	.lx-ts-divider{margin:10px 0;border:0;border-top:1px dashed #ccc}
	@media (prefers-color-scheme: dark){.lx-ts-divider{border-top-color:#444}}
	.lx-ts-dst{font-size:17px;color:#0a7d32;font-weight:500}
	@media (prefers-color-scheme: dark){.lx-ts-dst{color:#4ade80}}
	.lx-ts-src{margin-top:12px;color:#aaa;font-size:12px;text-align:right}
	</style></head><body>
	<div class="lx-ts-orig">${escapeHtml(text)}</div>
	<hr class="lx-ts-divider">
	<div class="lx-ts-dst">${escapeHtml(translated)}</div>
	<div class="lx-ts-src">来源：${escapeHtml(sourceName)}</div>
	</body></html>`;
}
