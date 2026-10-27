import { Vault } from "obsidian";

export interface DailyStats {
	date: string;
	count: number;       // 同词同日最多 3 次后的实际计入次数
	forgot: number;
	fuzzy: number;
	known: number;
	proficiencySum: number;
	proficiencyCount: number;
	uniqueWords: Set<string>;
	wordCountMap: Map<string, number>;
	words: string[];     // 当日去重词条（首次出现顺序）
}

/** 单次复习记录：[日期 YYYY-MM-DD, 评级 0忘记/1模糊/2认识, 当次熟练度] */
export type ReviewPoint = [string, 0 | 1 | 2, number];

export interface VocabEntry {
	word: string;
	dictId: string;
	definition?: string;
	addedAt: number;
	reviewCount: number;
	lastReviewAt?: number;
	context?: string;
	proficiency?: number;
	consecutiveCorrect?: number;
	interval?: number;
	easeFactor?: number;
	lastReviewed?: number;
	nextReview?: number;
	/** 逐次复习记录，热力图数据源；随词条一起存储，不再单独维护日志文件 */
	hist?: ReviewPoint[];
}

export interface ReviewConfig {
	intervalNew: number;
	intervalFamiliar: number;
	intervalKnown: number;
	easeStep: number;
	easePenalty: number;
	hardStreak: number;
	goodStreak: number;
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

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

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
		next.proficiency = 0;
		next.consecutiveCorrect = 0;
		next.easeFactor = Math.max(1.3, next.easeFactor - c.easePenalty);
	} else if (rating === 1) {
		next.consecutiveCorrect += 1;
		if (next.consecutiveCorrect >= c.hardStreak) {
			next.proficiency = Math.max(next.proficiency, 1);
			next.consecutiveCorrect = 0;
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep);
		} else {
			next.easeFactor = Math.min(3, next.easeFactor + c.easeStep / 2);
		}
	} else {
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
	// 复习记录直接挂在词条上：日期、评级、当次熟练度
	next.hist = [...(e.hist ?? []), [DAY_KEY.format(new Date(now)), rating, Math.round(next.proficiency)]];
	return next;
}

export function sortByDue(entries: VocabEntry[], now = Date.now()): VocabEntry[] {
	return [...entries].sort((a, b) => {
		const aDue = a.nextReview === undefined || a.nextReview <= now;
		const bDue = b.nextReview === undefined || b.nextReview <= now;
		if (aDue !== bDue) return aDue ? -1 : 1;
		return (a.nextReview ?? a.addedAt) - (b.nextReview ?? b.addedAt);
	});
}

export interface ScheduleGroup {
	dayOffset: number;
	label: string;
	count: number;
	entries: VocabEntry[];
}

export class VocabStore {
	constructor(
		private vault: Vault,
		private baseDir: string,
	) {}

	private bookPath(book: string): string {
		const safe = book.replace(/[\\/:*?"<>|]/g, "_");
		return `${this.baseDir}/vocab/${safe}.json`;
	}

	private legacyLogPath(): string {
		return `${this.baseDir}/vocab/_review-log.json`;
	}

	async ensureBase(): Promise<void> {
		const dir = `${this.baseDir}/vocab`;
		if (!(await this.vault.adapter.exists(dir))) {
			await this.vault.adapter.mkdir(dir);
		}
		await this.migrateLegacyLog();
	}

	/** 把旧版独立日志合并进各词条 hist，然后删除该文件，历史复习数据不丢 */
	private async migrateLegacyLog(): Promise<void> {
		const p = this.legacyLogPath();
		if (!(await this.vault.adapter.exists(p))) return;
		let rows: {
			word: string;
			book: string;
			rating: 0 | 1 | 2;
			at: number;
			proficiencyAfter?: number;
		}[] = [];
		try {
			rows = JSON.parse((await this.vault.adapter.read(p)) || "[]");
		} catch {
			rows = [];
		}
		const byBook = new Map<string, Map<string, ReviewPoint[]>>();
		for (const r of rows) {
			if (!r?.word || !r?.book || r.at === undefined) continue;
			const key = r.word.toLowerCase();
			const map = byBook.get(r.book) ?? new Map<string, ReviewPoint[]>();
			const pts = map.get(key) ?? [];
			pts.push([DAY_KEY.format(new Date(r.at)), r.rating, Math.round(r.proficiencyAfter ?? 0)]);
			map.set(key, pts);
			byBook.set(r.book, map);
		}
		for (const [bookName, map] of byBook) {
			const list = await this.entries(bookName);
			let changed = false;
			for (const e of list) {
				const pts = map.get(e.word.toLowerCase());
				if (!pts?.length) continue;
				e.hist = [...(e.hist ?? []), ...pts].sort((a, b) =>
					a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
				);
				changed = true;
			}
			if (changed) await this.save(bookName, list);
		}
		await this.vault.adapter.remove(p);
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
			})
			.filter((name) => name !== "" && !name.startsWith("_"));
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
		} catch {
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

	async dueEntries(book: string, now = Date.now()): Promise<VocabEntry[]> {
		const list = await this.entries(book);
		return list.filter((e) => e.nextReview === undefined || e.nextReview <= now);
	}

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

	// ===== 热力图数据源：词条 hist =====

	/** 聚合某本生词本某月的复习统计；同词同日多次最多计 3 次 */
	async getDailyStats(book: string, year: number, month: number): Promise<Map<string, DailyStats>> {
		await this.ensureBase();
		const list = await this.entries(book);
		const daily = new Map<string, DailyStats>();
		const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
		const MAX = 3;
		for (const e of list) {
			for (const [day, rating, prof] of e.hist ?? []) {
				if (!day.startsWith(prefix)) continue;
				let st = daily.get(day);
				if (!st) {
					st = {
						date: day,
						count: 0,
						forgot: 0,
						fuzzy: 0,
						known: 0,
						proficiencySum: 0,
						proficiencyCount: 0,
						uniqueWords: new Set(),
						wordCountMap: new Map(),
						words: [],
					};
					daily.set(day, st);
				}
				const prev = st.wordCountMap.get(e.word) ?? 0;
				if (prev >= MAX) continue;
				st.wordCountMap.set(e.word, prev + 1);
				st.count += 1;
				st.uniqueWords.add(e.word);
				if (prev === 0) st.words.push(e.word);
				if (rating === 0) st.forgot += 1;
				else if (rating === 1) st.fuzzy += 1;
				else st.known += 1;
				st.proficiencySum += prof;
				st.proficiencyCount += 1;
			}
		}
		return daily;
	}

	private async save(book: string, list: VocabEntry[]): Promise<void> {
		await this.ensureBase();
		await this.vault.adapter.write(this.bookPath(book), JSON.stringify(list, null, 2));
	}
}
