/**
 * 在线词典：有道 dict.youdao.com/jsonapi（免费无 Key）+ 内存缓存。
 * 参考 fleurdict(MIT) 的 YoudaoDictionaryAPI 实现。
 */
import { requestUrl } from "obsidian";

export interface YoudaoPosGroup {
	pos: string; // 词性缩写，如 n. / v.
	defs: string[]; // 该词性下的释义条目
}

export interface YoudaoEntry {
	word: string;
	phoneticBr: string | null;
	phoneticUs: string | null;
	audioBr: string | null;
	audioUs: string | null;
	groups: YoudaoPosGroup[];
	raw: unknown;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 天

/** 有道解析后的词性前缀（含省略点形式） */
const POS_RE = /^\s*((?:n|v|vt|vi|adj|adv|prep|conj|pron|int|interj|det|art|aux|num|abbr)\.)\s*/i;

/** 有道 dictvoice 发音 URL */
export function youdaoVoiceUrl(word: string, type: 1 | 2): string {
	return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

async function httpGet(url: string): Promise<{ status: number; json: any }> {
	try {
		const resp = await requestUrl({
			url,
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
			},
		});
		return { status: resp.status, json: resp.json };
	} catch (reqErr: any) {
		try {
			const resp = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
				},
			});
			return { status: resp.status, json: await resp.json() };
		} catch (fetchErr: any) {
			throw reqErr;
		}
	}
}

export class YoudaoAPI {
	private cache = new Map<string, { ts: number; entry: YoudaoEntry }>();

	clearCache(): void {
		this.cache.clear();
	}

	async query(word: string): Promise<YoudaoEntry | null> {
		const w = word.trim().toLowerCase();
		if (!w) return null;
		const cached = this.cache.get(w);
		if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
			return cached.entry;
		}

		let entry: YoudaoEntry | null = null;
		try {
			const dictsParam = encodeURIComponent(
				JSON.stringify({ count: 99, dicts: [["ec"]] }),
			);
			const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(w)}&le=eng&dicts=${dictsParam}`;
			const resp = await httpGet(url);
			if (resp.status === 200 && resp.json) {				entry = this.parse(resp.json, w);
			}
		} catch (e) {
			entry = null;
		}

		if (entry) {
			this.cache.set(w, { ts: Date.now(), entry });
		}
		return entry;
	}

	/** 解析有道 jsonapi ec 数据：音标 + dictvoice 发音 + 按词性分组的中文释义 */
	private parse(data: any, word: string): YoudaoEntry | null {
		const ec = data?.ec;
		const wordData = ec?.word?.[0];
		if (!wordData) return null;

		const trs: string[] = [];
		const rawTrs: unknown[] = Array.isArray(wordData.trs) ? wordData.trs : [];
		for (const trOuter of rawTrs) {
			const tr = (trOuter as any)?.tr;
			if (!Array.isArray(tr)) continue;
			for (const item of tr) {
				const i = (item as any)?.l?.i;
				if (i == null) continue;
				trs.push(Array.isArray(i) ? i.join("") : String(i));
			}
		}

		const groups: YoudaoPosGroup[] = [];
		let lastPos = "";
		let lastDefs: string[] = [];
		for (const raw of trs) {
			const text = raw.trim();
			if (!text) continue;
			const m = text.match(POS_RE);
			if (m) {
				const pos = m[1]!.toLowerCase();
				const body = text.slice(m[0].length).trim();
				if (pos !== lastPos) {
					if (lastPos && lastDefs.length) {
						groups.push({ pos: lastPos, defs: lastDefs });
					}
					lastPos = pos;
					lastDefs = [];
				}
				lastDefs.push(...body.split(/[；;]/).map((s) => s.trim()).filter(Boolean));
			} else {
				// 无词性前缀：并入上一组；无上一组则归为默认组
				if (lastPos) {
					lastDefs.push(...text.split(/[；;]/).map((s) => s.trim()).filter(Boolean));
				} else {
					groups.push({ pos: "", defs: [text] });
				}
			}
		}
		if (lastPos && lastDefs.length) {
			groups.push({ pos: lastPos, defs: lastDefs });
		}
		if (!groups.length) return null;

		const hasUk = typeof wordData.ukphone === "string" && wordData.ukphone.length > 0;
		const hasUs = typeof wordData.usphone === "string" && wordData.usphone.length > 0;

		return {
			word,
			phoneticBr: hasUk ? wordData.ukphone : null,
			phoneticUs: hasUs ? wordData.usphone : null,
			audioBr: youdaoVoiceUrl(word, 1),
			audioUs: youdaoVoiceUrl(word, 2),
			groups,
			raw: data,
		};
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/* ================= Free Dictionary API（dictionaryapi.dev，免费无 Key，英文释义） ================= */

export class FreeDictAPI {
	private cache = new Map<string, { ts: number; entry: YoudaoEntry }>();

	clearCache(): void {
		this.cache.clear();
	}

	async query(word: string): Promise<YoudaoEntry | null> {
		const w = word.trim().toLowerCase();
		if (!w) return null;
		const cached = this.cache.get(w);
		if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
			return cached.entry;
		}

		let entry: YoudaoEntry | null = null;
		try {
			const resp = await httpGet(
				`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
			);
			const arr = Array.isArray(resp.json) ? resp.json : [];
			if (resp.status === 200 && arr.length) {
				entry = this.parse(arr[0], w);
			}
		} catch (e) {
			entry = null;
		}
		if (entry) this.cache.set(w, { ts: Date.now(), entry });
		return entry;
	}

	private parse(data: any, word: string): YoudaoEntry | null {
		const phonetics: any[] = Array.isArray(data?.phonetics) ? data.phonetics : [];
		let phoneticText: string | null = null;
		let audioBr: string | null = null;
		let audioUs: string | null = null;
		for (const p of phonetics) {
			if (!phoneticText && typeof p?.text === "string") phoneticText = p.text;
			const u = typeof p?.audio === "string" && p.audio.length > 0 ? p.audio : null;
			if (!u) continue;
			if (/[-_]us\.[a-z0-9]+($|\?)/i.test(u)) {
				if (!audioUs) audioUs = u;
			} else if (/[-_]uk\.[a-z0-9]+($|\?)/i.test(u)) {
				if (!audioBr) audioBr = u;
			} else if (!audioBr && !audioUs) {
				// 无法从文件名区分英/美：默认归为英式
				audioBr = u;
			}
		}
		const groups: YoudaoPosGroup[] = [];
		const meanings: any[] = Array.isArray(data?.meanings) ? data.meanings : [];
		for (const m of meanings) {
			const pos = typeof m?.partOfSpeech === "string" ? m.partOfSpeech : "";
			const defs: string[] = [];
			for (const d of Array.isArray(m?.definitions) ? m.definitions : []) {
				if (typeof d?.definition === "string") defs.push(d.definition);
			}
			if (pos || defs.length) groups.push({ pos, defs });
		}
		if (!groups.length) return null;
		return {
			word,
			phoneticBr: phoneticText,
			phoneticUs: null,
			audioBr,
			audioUs,
			groups,
			raw: data,
		};
	}
}

/* ================= 通用在线结果渲染（有道 / Free Dictionary 共用） ================= */

/** 将有道结果渲染为面板 iframe 可直接显示的 HTML（含发音按钮，点击即播 dictvoice） */
export function buildYoudaoDoc(entry: YoudaoEntry): string {
	return buildOnlineDoc(entry, "有道词典（在线）");
}

/** 通用在线词典渲染：来源名参数化（Free Dictionary 用英文释义时也走此渲染） */
export function buildOnlineDoc(entry: YoudaoEntry, sourceName: string): string {
	const rows = entry.groups
		.map(
			(g) =>
				`<div class="lx-ol-pos">${g.pos || "释义"}</div><ul class="lx-ol-defs">${g.defs
					.map((d) => `<li>${escapeHtml(d)}</li>`)
					.join("")}</ul>`,
		)
		.join("");

	const phon = [
		entry.phoneticBr ? `<span class="lx-ol-ph">英 ${escapeHtml(entry.phoneticBr)}</span>` : "",
		entry.phoneticUs ? `<span class="lx-ol-ph">美 ${escapeHtml(entry.phoneticUs)}</span>` : "",
	]
		.filter(Boolean)
		.join(" ");

	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
	body{margin:0;padding:12px 14px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;background:#fff;line-height:1.55}
	@media (prefers-color-scheme: dark){body{color:#ddd;background:#1e1e1e}}
	.lx-ol-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
	.lx-ol-word{font-size:24px;font-weight:700;margin:0}
	.lx-ol-phon{display:flex;gap:10px;flex-wrap:wrap;color:#888;font-size:14px}
	@media (prefers-color-scheme: dark){.lx-ol-phon{color:#999}}
	.lx-ol-speak{border:1px solid #ccc;background:transparent;border-radius:999px;padding:2px 10px;font-size:14px;cursor:pointer;color:inherit}
	.lx-ol-speak:active{background:rgba(0,0,0,.08)}
	.lx-ol-body{margin-top:10px}
	.lx-ol-pos{font-weight:700;color:#b45309;margin:8px 0 2px;font-size:15px}
	@media (prefers-color-scheme: dark){.lx-ol-pos{color:#f59e0b}}
	.lx-ol-defs{margin:0;padding-left:20px}
	.lx-ol-defs li{margin:2px 0;font-size:15px}
	.lx-ol-src{margin-top:12px;color:#aaa;font-size:12px;text-align:right}
	</style></head><body>
	<div class="lx-ol-head">
	  <h1 class="lx-ol-word">${escapeHtml(entry.word)}</h1>
	  ${entry.audioBr ? `<button class="lx-ol-speak" data-audio="${escapeHtml(entry.audioBr)}" title="英式发音">🔊 英</button>` : ""}
	  ${entry.audioUs ? `<button class="lx-ol-speak" data-audio="${escapeHtml(entry.audioUs)}" title="美式发音">🔊 美</button>` : ""}
	</div>
	${phon ? `<div class="lx-ol-phon">${phon}</div>` : ""}
	<div class="lx-ol-body">${rows}</div>
	<div class="lx-ol-src">来源：${escapeHtml(sourceName)}</div>
	<script>
	document.addEventListener("click", function(e){
	  var b = e.target.closest(".lx-ol-speak");
	  if (!b) return;
	  e.preventDefault();
	  try { new Audio(b.getAttribute("data-audio")).play(); } catch (err) {}
	});
	</script>
	</body></html>`;
}
