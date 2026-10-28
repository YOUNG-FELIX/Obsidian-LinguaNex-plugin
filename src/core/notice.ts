import { Notice } from "obsidian";

/**
 * Toast 生命周期统一管理。
 *
 * 背景：Obsidian 的 `new Notice(msg)` 在未显式传时长时不会自行消失（官方 typing 明确
 * "duration 为 0 时会一直停留到用户手动关闭"），本项目此前所有调用都没传时长，
 * 导致「已收藏」一类的提示长期挂在右上角。
 *
 * 这里统一约定：
 * - 所有提示必须带明确时长，到期自动 hide；
 * - 相同 key 的提示复用同一条 Notice（更新文案 + 重置计时），避免连点造成堆叠；
 * - 插件卸载时 hideAll，杜绝残留。
 */
export interface ToastOptions {
	/** 同 key 复用同一条 Notice；不传则每次新建一条 */
	key?: string;
	/** 显示时长（毫秒）；不传按文案长度自动取值（2200~4000ms） */
	duration?: number;
}

interface ActiveToast {
	notice: Notice;
	timer: number;
}

const MIN_DURATION = 2200;
const MAX_DURATION = 4000;

/** 按文案长度估一个合适的停留时长：短句 2.2s，长句最多 4s */
function autoDuration(msg: string): number {
	const len = msg.replace(/\s+/g, "").length;
	if (len <= 12) return MIN_DURATION;
	if (len >= 60) return MAX_DURATION;
	return Math.round(MIN_DURATION + ((len - 12) / 48) * (MAX_DURATION - MIN_DURATION));
}

export class ToastManager {
	private active = new Map<string, ActiveToast>();
	private seq = 0;

	/**
	 * 弹出一条自动消失的提示。
	 * @param msg 文案
	 * @param opts key 用于去重复用；duration 覆盖自动时长
	 */
	show(msg: string, opts: ToastOptions = {}): void {
		const duration = opts.duration ?? autoDuration(msg);
		// 不给 key 的提示各自独立，用一个自增串做标识，同样纳入统一生命周期管理
		const key = opts.key ?? `lx-auto-${++this.seq}`;
		const existing = this.active.get(key);
		if (existing) {
			// 同 key 不能只 setMessage：Notice 内部的自动隐藏计时不会因此重置，
			// 第二条消息会在上一条的到期时刻被收走，时长就错乱了。
			// 先收起旧的，再用新时长重建一条，保证"最后一条消息"有完整的展示时间。
			this.dismiss(key);
		}
		const notice = new Notice(msg, duration);
		const timer = window.setTimeout(() => this.dismiss(key), duration);
		this.active.set(key, { notice, timer });
	}

	/** 手动收起某条（key 对应的那条） */
	hide(key: string): void {
		this.dismiss(key);
	}

	/** 收起全部由本管理器弹出的提示（插件卸载时调用） */
	hideAll(): void {
		for (const key of [...this.active.keys()]) this.dismiss(key);
	}

	private dismiss(key: string): void {
		const item = this.active.get(key);
		if (!item) return;
		window.clearTimeout(item.timer);
		this.active.delete(key);
		try {
			item.notice.hide();
		} catch {
			/* Notice 已被用户点掉或 DOM 已移除，忽略 */
		}
	}
}
