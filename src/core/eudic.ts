/**
 * LinguaNex - Eudic Service
 * 欧路词典 OpenAPI 集成（纯 API 层，与插件 UI 解耦）
 * 文档: https://my.eudic.net/OpenAPI/doc_api_study
 *
 * 移植自 fleurdict(MIT) eudic-service.ts，适配 LinguaNex 生词本数据层。
 */

const EUDIC_API_BASE = "https://api.frdic.com/api/open/v1";

export interface EudicCategory {
	id?: string;
	name?: string;
	word_count?: number;
	language?: string;
}

export interface EudicWord {
	word: string;
	/** 星级 1-5 */
	star?: number;
	context_line?: string;
	created_at?: number;
	updated_at?: number;
}

export interface EudicApiResponse<T> {
	code?: number;
	message?: string;
	msg?: string;
	data?: T;
}

export interface EudicConfig {
	enabled: boolean;
	token: string;
	language: string;
	/** 目标分类 id，'0' 为默认生词本 */
	categoryId: string;
	/** manual=手动；auto=收藏生词时自动同步 */
	syncMode: "manual" | "auto";
}

export interface SyncLocalToEudicResult {
	added: number;
	failed: number;
	skipped: number;
	details: { word: string; status: "added" | "skipped" | "failed" }[];
}

export interface SyncEudicToLocalResult {
	imported: number;
	skipped: number;
	words: string[];
}

/**
 * Eudic Service - 管理欧路词典生词本同步
 */
export class EudicService {
	constructor(private config: () => EudicConfig) {}

	getConfig(): EudicConfig {
		return this.config();
	}

	isConfigured(): boolean {
		const c = this.config();
		return !!c.token;
	}

	/** 发起带认证的 API 请求（fetch 直连，4xx 时读取完整错误体） */
	private async request<T>(
		path: string,
		method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
		body?: unknown,
	): Promise<EudicApiResponse<T>> {
		const c = this.config();
		if (!c.token) throw new Error("未配置欧路词典 API Token");

		const url = `${EUDIC_API_BASE}${path}`;
		const headers: Record<string, string> = {
			Authorization: `NIS ${c.token}`,
			"Content-Type": "application/json",
		};

		try {
			const resp = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
			});

			if (resp.status === 204) {
				return { message: "success" };
			}

			const text = await resp.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}

			if (!resp.ok) {
				const errObj = (parsed ?? {}) as Record<string, unknown>;
				const errMsg =
					(typeof errObj.message === "string" ? errObj.message : "") ||
					(typeof errObj.msg === "string" ? errObj.msg : "") ||
					text ||
					`HTTP ${resp.status}`;
				throw new Error(`欧路 API 错误 (${resp.status}): ${errMsg}`);
			}

			return parsed as EudicApiResponse<T>;
		} catch (err: unknown) {
			const e = err as Error;
			if (e.message?.includes("欧路 API 错误")) throw err;
			const status = (err as { status?: unknown })?.status ?? "unknown";
			console.error(`[LinguaNex-DIAG] Eudic API request failed (status: ${status})`);
			throw new Error(`欧路 API 错误 (${status}): ${e.message ?? JSON.stringify(err)}`);
		}
	}

	// ==========================================================================
	// 生词本分类管理
	// ==========================================================================

	/** 获取所有生词本分类 */
	async getCategories(): Promise<EudicCategory[]> {
		const res = await this.request<EudicCategory[]>(
			`/studylist/category?language=${this.config().language}`,
		);
		return res.data || [];
	}

	/** 创建分类 */
	async createCategory(name: string): Promise<EudicCategory> {
		const res = await this.request<EudicCategory>("/studylist/category", "POST", {
			language: this.config().language,
			name,
		});
		return res.data!;
	}

	/** 重命名分类 */
	async renameCategory(id: string, name: string): Promise<void> {
		await this.request("/studylist/category", "PATCH", {
			id,
			language: this.config().language,
			name,
		});
	}

	/** 删除分类 */
	async deleteCategory(id: string): Promise<void> {
		await this.request("/studylist/category", "DELETE", {
			id,
			language: this.config().language,
			name: "",
		});
	}

	// ==========================================================================
	// 单词管理
	// ==========================================================================

	/** 获取分类中的单词列表（分页） */
	async getWords(
		categoryId: string = "0",
		page = 0,
		pageSize = 100,
	): Promise<EudicWord[]> {
		const res = await this.request<EudicWord[]>(
			`/studylist/words?language=${this.config().language}&category_id=${categoryId}&page=${page}&page_size=${pageSize}`,
		);
		return res.data || [];
	}

	/** 添加单词 */
	async addWord(word: string): Promise<void> {
		await this.request("/studylist/words", "POST", {
			category_id: this.config().categoryId || "0",
			language: this.config().language,
			words: [word],
		});
	}

	/** 批量添加单词（单批 ≤50） */
	async addWords(words: string[]): Promise<void> {
		if (words.length === 0) return;
		await this.request("/studylist/words", "POST", {
			category_id: this.config().categoryId || "0",
			language: this.config().language,
			words,
		});
	}

	/** 删除单词 */
	async deleteWord(word: string): Promise<void> {
		await this.request("/studylist/words", "DELETE", {
			category_id: this.config().categoryId || "0",
			language: this.config().language,
			words: [word],
		});
	}

	// ==========================================================================
	// 同步功能
	// ==========================================================================

	/**
	 * 同步本地生词本到欧路：先全量拉取欧路现有词（分页循环），
	 * 求差后按 50/批批量添加，返回新增/跳过/失败明细。
	 */
	async syncLocalToEudic(localWords: string[]): Promise<SyncLocalToEudicResult> {
		if (!this.isConfigured()) throw new Error("未配置欧路词典 API Token");

		const details: SyncLocalToEudicResult["details"] = [];

		// 获取欧路现有单词（取全部，分页循环）
		let eudicWords: EudicWord[] = [];
		let page = 0;
		const pageSize = 100;
		while (true) {
			const batch = await this.getWords(this.config().categoryId || "0", page, pageSize);
			eudicWords = eudicWords.concat(batch);
			if (batch.length < pageSize) break;
			page++;
		}

		const eudicWordSet = new Set(eudicWords.map((w) => w.word.toLowerCase()));
		const toSync = localWords.filter((w) => !eudicWordSet.has(w.toLowerCase()));

		if (toSync.length === 0) {
			for (const w of localWords) {
				details.push({ word: w, status: "skipped" });
			}
			return { added: 0, failed: 0, skipped: localWords.length, details };
		}

		let added = 0;
		let failed = 0;
		const batchSize = 50;

		for (let i = 0; i < toSync.length; i += batchSize) {
			const batch = toSync.slice(i, i + batchSize);
			try {
				await this.addWords(batch);
				added += batch.length;
				for (const w of batch) details.push({ word: w, status: "added" });
			} catch (error) {
				console.error("[LinguaNex-DIAG] Failed to sync batch:", error);
				failed += batch.length;
				for (const w of batch) details.push({ word: w, status: "failed" });
			}
		}

		return { added, failed, skipped: eudicWordSet.size, details };
	}

	/** 从欧路同步单词到本地（返回单词列表，由调用方合并入生词本） */
	async syncEudicToLocal(): Promise<SyncEudicToLocalResult> {
		if (!this.isConfigured()) throw new Error("未配置欧路词典 API Token");

		const words = await this.getWords(this.config().categoryId || "0");
		return { imported: words.length, skipped: 0, words: words.map((w) => w.word) };
	}

	/** 测试 API 连接：验证 token 并返回账户分类数 */
	async testConnection(): Promise<{ ok: boolean; categoryCount: number; message: string }> {
		try {
			const cats = await this.getCategories();
			return {
				ok: true,
				categoryCount: cats.length,
				message: `连接成功：${cats.length} 个分类`,
			};
		} catch (error) {
			const e = error as Error;
			return { ok: false, categoryCount: 0, message: e.message ?? "连接失败" };
		}
	}
}
