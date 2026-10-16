import type { LinguaNexMdict } from "./mdict";

const AUDIO_MIME: Record<string, string> = {
	".mp3": "audio/mpeg",
	".spx": "audio/ogg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
};

/** 从 mdd 中按 sound:// 路径提取音频并播放；失败返回 false */
export async function playMddAudio(
	mdict: LinguaNexMdict,
	soundPath: string,
): Promise<boolean> {
	const key = soundPath
		.replace(/^sound:\/+/, "")
		.replace(/^\/+/, "")
		.replace(/^\\+/, "")
		.replace(/[\x00|]/g, "")
		.trim();
	if (!key) return false;

	const ext = "." + (key.split(".").pop() ?? "").toLowerCase();
	const mime = AUDIO_MIME[ext] ?? "audio/mpeg";

	// 部分词典资源名带大小写差异，先原样尝试，失败再试小写
	const candidates = [key, key.toLowerCase()];
	for (const c of candidates) {
		const url = mdict.resourceAsBlobUrl(c, mime);
		if (!url) continue;
		const ok = await playAudioUrl(url);
		if (ok) return true;
	}
	return false;
}

/** 播放单个音频 URL（http 在线音频或 blob URL 均可），3 秒超时兜底 */
export function playAudioUrl(url: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		let settled = false;
		const finish = (v: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (url.startsWith("blob:")) URL.revokeObjectURL(url);
			resolve(v);
		};
		const timer = window.setTimeout(() => finish(false), 3000);
		try {
			const audio = new Audio(url);
			audio.onended = () => finish(true);
			audio.onerror = () => finish(false);
			audio.play().catch(() => finish(false));
		} catch (e) {
			finish(false);
		}
	});
}

/** TTS 兜底发音 */
export function speakTTS(text: string, rate = 1): void {
	if (!("speechSynthesis" in window)) return;
	try {
		const u = new SpeechSynthesisUtterance(text);
		u.lang = "en-US";
		u.rate = rate;
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(u);
	} catch (e) {
		/* ignore */
	}
}

/** 从词条 HTML 中提取发音按钮可用的 sound:// 路径 */
export function extractSoundPath(html: string): string | null {
	const m = html.match(/sound:\/\/[^\s"'<>]+/i);
	return m ? m[0] : null;
}
