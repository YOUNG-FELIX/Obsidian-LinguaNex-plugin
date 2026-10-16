import { Platform, Vault } from "obsidian";

// vendor mdict-js（已 patch：支持 buffer 源、移除词形还原外部依赖）
// @ts-ignore
import mdictCjs from "../vendor/mdict/mdict.js";
// @ts-ignore
const Mdict: any = (mdictCjs as any).default ?? mdictCjs;

export interface LookupResult {
	keyText: string;
	definition: string | null;
}

export interface DictInfo {
	wordCount: number;
	initMs: number;
	hasMdd: boolean;
	header: any;
}

/** 移动端 mdd 超过该大小不整读（音频降级为 TTS） */
const MOBILE_MDD_MAX_BYTES = 80 * 1024 * 1024;

/**
 * LinguaNexMdict — 单个词典（mdx + 同名 mdd）的封装。
 * 桌面端走 fs 直接读取；移动端用 adapter.readBinary 整读 mdx，
 * 小 mdd 整读、大 mdd 跳过（资源降级）。
 */
export class LinguaNexMdict {
	private handle: any = null;
	private mddHandle: any = null;
	private loaded = false;
	public info: DictInfo = {
		wordCount: 0,
		initMs: 0,
		hasMdd: false,
		header: null,
	};

	constructor(
		public dictPath: string,
		public mddPath: string | null = null,
		public displayName: string = ""
	) {}

	/** 释放句柄与加载状态；重载前必须调用，避免 vendor 全局缓存被旧 buffer 污染 */
	dispose(): void {
		this.handle = null;
		this.mddHandle = null;
		this.loaded = false;
		this.info = { wordCount: 0, initMs: 0, hasMdd: false, header: null };
	}

	async load(vault: Vault): Promise<void> {
		this.dispose();
		const t0 = performance.now();
		if (Platform.isMobile) {
			const ab = await vault.adapter.readBinary(this.dictPath);
			// 直接以原始 buffer 构造（与 v0.4.1 一致）：加密词典依赖原始 ArrayBuffer 形态，
			// 副本/回退构造在移动端反而不稳定，异常原样上抛便于定位
			this.handle = new Mdict(this.dictPath, { source: "buffer", fileBuffer: ab });
			if (this.mddPath) {
				try {
					const stat = await vault.adapter.stat(this.mddPath);
					if (stat && stat.size <= MOBILE_MDD_MAX_BYTES) {
						const mddAb = await vault.adapter.readBinary(this.mddPath);
						this.mddHandle = new Mdict(this.mddPath, { source: "buffer", fileBuffer: mddAb });
					}
				} catch (e) {
					this.mddHandle = null;
				}
			}
		} else {
			this.handle = new Mdict(this.dictPath);
			if (this.mddPath) {
				try {
					this.mddHandle = new Mdict(this.mddPath);
				} catch (e) {
					this.mddHandle = null;
				}
			}
		}
		this.info.initMs = Math.round(performance.now() - t0);
		try {
			this.info.wordCount = this.handle.keys().length;
		} catch (e) {
			// 词条数取不到不视为加载失败（与 v0.4.1 一致），仅记录为 0
			this.info.wordCount = 0;
		}
		this.info.header = this.handle?.header ?? null;
		this.info.hasMdd = !!this.mddHandle;
		this.loaded = true;
	}

	get isLoaded(): boolean {
		return this.loaded;
	}

	/** 精确 + 词形还原查找 */
	lookup(raw: string): LookupResult {
		if (!this.handle) return { keyText: raw, definition: null };
		const trimmed = raw.trim();
		if (!trimmed) return { keyText: raw, definition: null };
		for (const w of this.variants(trimmed)) {
			try {
				const r = this.handle.lookup(w);
				if (r && r.definition != null) return r;
			} catch (e) {
				/* ignore per-variant errors */
			}
		}
		return { keyText: raw, definition: null };
	}

	keys(): string[] {
		return this.handle ? this.handle.keys() : [];
	}

	/** 从 mdd 提取资源（图片/音频/css），返回原始字节 */
	resource(key: string): Uint8Array | null {
		if (!this.mddHandle) return null;
		try {
			const r = this.mddHandle.lookup(key);
			if (!r || r.definition == null) return null;
			const d = r.definition;
			if (typeof d === "string") return new TextEncoder().encode(d);
			if (d instanceof Uint8Array) return d;
			return null;
		} catch (e) {
			return null;
		}
	}

	resourceAsBlobUrl(key: string, mime = "application/octet-stream"): string | null {
		const data = this.resource(key);
		if (!data) return null;
		try {
			const blob = new Blob([data as unknown as BlobPart], { type: mime });
			return URL.createObjectURL(blob);
		} catch (e) {
			return null;
		}
	}

	private variants(w: string): string[] {
		const out: string[] = [];
		const seen = new Set<string>();
		const push = (s: string) => {
			if (!seen.has(s)) {
				seen.add(s);
				out.push(s);
			}
		};
		push(w);
		const lw = w.toLowerCase();
		const lx = w[0]?.toUpperCase() + w.slice(1);
		if (lw.endsWith("ies") && lw.length > 3) push(lw.slice(0, -3) + "y");
		if (lw.endsWith("es")) push(lw.slice(0, -2));
		if (lw.endsWith("ing") && lw.length > 4) {
			push(lw.slice(0, -3));
			push(lw.slice(0, -3) + "e");
		}
		if (lw.endsWith("ed") && lw.length > 3) {
			push(lw.slice(0, -2));
			push(lw.slice(0, -1));
		}
		if (lw.endsWith("s") && lw.length > 2) push(lw.slice(0, -1));
		if (lw !== w) push(lw);
		if (lw !== lx) push(lx);
		return out;
	}
}
