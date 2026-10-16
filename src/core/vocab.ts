import { Vault } from "obsidian";

export interface VocabEntry {
	word: string;
	dictId: string;
	definition?: string;
	addedAt: number;
	reviewCount: number;
	lastReviewAt?: number;
	/** 收录时所在上下文片段（截断 80 字） */
	context?: string;
	/** SM-2：熟练度 0 陌生 / 1 渐熟 / 2 熟悉 */
	proficiency?: number;
	/** SM-2：连续答对次数（晋级计数） */
	consecutiveCorrect?: number;
	/** SM-2：间隔天数（1 / 3 / 7 …） */
	interval?: number;
	/** SM-2：难度系数，默认 2.5，范围 [1.3, 3] */
	easeFactor?: number;
	/** SM-2：上次复习时间戳 */
	lastReviewed?: number;
	/** SM-2：下次到期复习时间戳 */
	nextReview?: number;
}

/** SM-2 复习算法可调参数（复习页「算法参数设置」折叠面板可配置） */
export interface ReviewConfig {
	/** 陌生评级后的间隔天数 */
	intervalNew: number;
	/** 渐熟评级后的间隔天数 */
	intervalFamiliar: number;
	/** 熟悉评级后的间隔天数 */
	intervalKnown: number;
	/** 认识评级 easeFactor 增加步长 */
	easeStep: number;
	/** 忘记评级 easeFactor 扣减量 */
	easePenalty: number;
	/** 模糊评级晋级（渐熟）所需连对次数 */
	hardStreak: number;
	/** 认识评级晋级（熟悉）所需连对次数 */
	goodStreak: number;
	/** 复习数据面板展示的未来天数 */
	planDays: number;
}

export const DEFAULT_REVIEW: ReviewConfig = {
	intervalNew: 1,
	intervalFamiliar: 3,
	intervalKnown: 7,
	easeStep: 0.1,
	easePenalty: 0.2,
	hardStreak: 2,
	goodStreak: 3,
	planDays: 30,
};

/**
 * SM-2 评级（参考 fleurdict flashcard-engine，按规划 2.5 三档简化）：
 * 0=忘记（重置熟练度，easeFactor-扣减）；1=模糊（连对 hardStreak 次晋级渐熟）；
 * 2=认识（熟悉需连对 goodStreak 次，easeFactor 递增）。
 * 间隔阶梯：proficiency 0 → intervalNew 天；1 → intervalFamiliar 天；2 → intervalKnown 天。
 */
export function applyRating(e: VocabEntry, rating: 0 | 1 | 2, cfg?: Partial<ReviewConfig>): VocabEntry {
	const c: ReviewConfig = { ...DEFAULT_REVIEW, ...(cfg ?? {}) };
	const now = Date.now();
	const next: VocabEntry = {
		...e,
		reviewCount: (e.reviewCount ?? 0) + 1,
		lastReviewed: now,
		lastReviewAt: now,
	};
	next.proficiency = e.proficiency ?? 0;
	next.consecutiveCorrect = e.consecutiveCorrect ?? 0;
	next.easeFactor = e.easeFactor ?? 2.5;

	if (rating === 0) {
		// 忘记：重置
		next.proficiency = 0;
		next.consecutiveCorrect = 0;
		next.easeFactor = Math.max(1.3, next.easeFactor - c.easePenalty);
	} else if (rating === 1) {
		// 模糊：连对 hardStreak 次晋级渐熟
		next.consecutiveCorrect += 1;
		if (next.consecutiveCorrect >= c.hardStreak) {
			next.proficiency = Math.max(next.proficiency, 1);
			next.consecutiveCorrect = 0;
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep);
		} else {
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep / 2);
		}
	} else {
		// 认识：晋级熟悉
		next.consecutiveCorrect += 1;
		if (next.proficiency === 0 && next.consecutiveCorrect >= c.hardStreak) {
			next.proficiency = 2;
			next.consecutiveCorrect = 0;
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep * 2);
		} else if (next.proficiency === 1 && next.consecutiveCorrect >= c.goodStreak) {
			next.proficiency = 2;
			next.consecutiveCorrect = 0;
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep * 1.5);
		} else {
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep);
		}
	}
	next.interval =
		next.proficiency === 0
			? c.intervalNew
			: next.proficiency === 1
				? c.intervalFamiliar
				: c.intervalKnown;
	next.nextReview = now + next.interval * 24 * 60 * 60 * 1000;
	return next;
}

/** 按复习算法排序：该复习的在前（已到期/未安排），再按到期时间由近到远 */
export function sortByDue(entries: VocabEntry[], now = Date.now()): VocabEntry[] {
	return [...entries].sort((a, b) => {
		const aDue = a.nextReview === undefined || a.nextReview <= now;
		const bDue = b.nextReview === undefined || b.nextReview <= now;
		if (aDue !== bDue) return aDue ? -1 : 1;
		return (a.nextReview ?? a.addedAt) - (b.nextReview ?? b.addedAt);
	});
}

/** 复习计划分组：一组词条共享一个到期偏移（0=今天已到期，-1=未安排，N=未来第 N 天） */
export interface ScheduleGroup {
	/** 距今天数：-1=未安排随时可复习；0=今天已到期（含过期）；>0 为未来第 N 天 */
	dayOffset: number;
	label: string;
	count: number;
	entries: VocabEntry[];
}

/** 生词本数据层：以 JSON 数组文件存储在 vault 内 <baseDir>/vocab/<book>.json */
export class VocabStore {
	constructor(
		private vault: Vault,
		private baseDir: string,
	) {}

	private bookPath(book: string): string {
		const safe = book.replace(/[\\/:*?"<>|]/g, "_");
		return `${this.baseDir}/vocab/${safe}.json`;
	}

	async ensureBase(): Promise<void> {
		const dir = `${this.baseDir}/vocab`;
		if (!(await this.vault.adapter.exists(dir))) {
			await this.vault.adapter.mkdir(dir);
		}
	}

	async books(): Promise<string[]> {
		await this.ensureBase();
		const dir = `${this.baseDir}/vocab`;
		const listed = await this.vault.adapter.list(dir);
		return listed.files
			.filter((f) => f.toLowerCase().endsWith(".json"))
			.map((f) => {
				const seg = f.split("/").filter(Boolean);
				return (seg[seg.length - 1] ?? "").replace(/\.json$/i, "");
			});
	}

	async createBook(name: string): Promise<boolean> {
		await this.ensureBase();
		const p = this.bookPath(name);
		if (await this.vault.adapter.exists(p)) return false;
		await this.vault.adapter.write(p, "[]");
		return true;
	}

	async deleteBook(name: string): Promise<void> {
		const p = this.bookPath(name);
		if (await this.vault.adapter.exists(p)) {
			await this.vault.adapter.remove(p);
		}
	}

	async renameBook(oldName: string, newName: string): Promise<boolean> {
		const entries = await this.entries(oldName);
		await this.deleteBook(oldName);
		await this.createBook(newName);
		if (entries.length) {
			await this.vault.adapter.write(
				this.bookPath(newName),
				JSON.stringify(entries, null, 2),
			);
		}
		return true;
	}

	async entries(book: string): Promise<VocabEntry[]> {
		const p = this.bookPath(book);
		try {
			if (!(await this.vault.adapter.exists(p))) return [];
			const raw = await this.vault.adapter.read(p);
			return JSON.parse(raw || "[]");
		} catch (e) {
			return [];
		}
	}

	async add(book: string, entry: VocabEntry): Promise<void> {
		const list = await this.entries(book);
		const idx = list.findIndex((e) => e.word.toLowerCase() === entry.word.toLowerCase());
		if (idx >= 0) {
			list[idx] = { ...entry };
		} else {
			list.push(entry);
		}
		await this.save(book, list);
	}

	async remove(book: string, word: string): Promise<void> {
		const list = await this.entries(book);
		const next = list.filter((e) => e.word.toLowerCase() !== word.toLowerCase());
		await this.save(book, next);
	}

	async update(book: string, word: string, patch: Partial<VocabEntry>): Promise<void> {
		const list = await this.entries(book);
		const idx = list.findIndex((e) => e.word.toLowerCase() === word.toLowerCase());
		if (idx < 0) return;
		list[idx] = { ...list[idx], ...patch };
		await this.save(book, list);
	}

	/** 到期复习队列：nextReview 为空（旧词条/从未复习）或已到期的词条 */
	async dueEntries(book: string, now = Date.now()): Promise<VocabEntry[]> {
		const list = await this.entries(book);
		return list.filter((e) => e.nextReview === undefined || e.nextReview <= now);
	}
	/** 复习计划：按到期日由近到远分组（未安排 → 今天到期 → 明天 → N 天后），供复习数据面板展示 */
	async schedule(book: string, horizonDays = 30, now = Date.now()): Promise<ScheduleGroup[]> {
		const list = await this.entries(book);
		const DAY = 24 * 60 * 60 * 1000;
		const groups = new Map<number, ScheduleGroup>();
		const ensure = (offset: number, label: string): ScheduleGroup => {
			let g = groups.get(offset);
			if (!g) {
				g = { dayOffset: offset, label, count: 0, entries: [] };
				groups.set(offset, g);
			}
			return g;
		};
		for (const e of list) {
			if (e.nextReview === undefined) {
				const g = ensure(-1, "未安排 · 随时可复习");
				g.entries.push(e);
				g.count += 1;
			} else {
				const diff = e.nextReview - now;
				if (diff <= 0) {
					const g = ensure(0, "今天已到期");
					g.entries.push(e);
					g.count += 1;
				} else {
					const offset = Math.ceil(diff / DAY);
					if (offset > horizonDays) continue;
					const date = new Date(e.nextReview).toLocaleDateString();
					const g = ensure(offset, `${offset === 1 ? "明天" : `${offset} 天后`} · ${date}`);
					g.entries.push(e);
					g.count += 1;
				}
			}
		}
		const sorted = [...groups.values()].sort((a, b) => a.dayOffset - b.dayOffset);
		for (const g of sorted) {
			g.entries.sort((a, b) => (a.nextReview ?? a.addedAt) - (b.nextReview ?? b.addedAt));
		}
		return sorted;
	}

	private async save(book: string, list: VocabEntry[]): Promise<void> {
		await this.ensureBase();
		await this.vault.adapter.write(this.bookPath(book), JSON.stringify(list, null, 2));
	}
}
