import { Platform, Vault } from "obsidian";

const MDX_MAGIC = [0x00, 0x00, 0x03, 0x7c];
const MDD_MAGIC = [0x00, 0x00, 0x03, 0x84];

export interface ScanResult {
	mdxPath: string;
	mddPath: string | null;
	/** 目录下同名配套资源（css/js/ini 候选） */
	resourceFiles: string[];
	valid: boolean;
	error?: string;
	magicOk?: boolean | null;
}

/** 目录内配套资源文件（按词条引用 basename 匹配） */
export const RESOURCE_EXTS = ["css", "js", "ini"];

export function baseName(p: string): string {
	const seg = p.split("/").filter(Boolean);
	return seg.length ? seg[seg.length - 1] : p;
}

/** 扫描一个目录，返回其中所有 mdx 的校验结果 */
export async function scanDir(vault: Vault, dir: string): Promise<ScanResult[]> {
	const files = await listFiles(vault, dir);
	const results: ScanResult[] = [];
	for (const f of files) {
		const lower = f.toLowerCase();
		if (!lower.endsWith(".mdx")) continue;
		const stem = lower.slice(0, -4);
		const mddPath =
			files.find((x) => x.toLowerCase() === stem + ".mdd") ?? null;
		const resourceFiles = files.filter((x) => {
			const lx = x.toLowerCase();
			const ext = lx.split(".").pop() ?? "";
			return RESOURCE_EXTS.includes(ext);
		});
		const r = await inspectMdx(vault, f);
		results.push({ mdxPath: f, mddPath, resourceFiles, ...r });
	}
	return results;
}

async function inspectMdx(
	vault: Vault,
	path: string
): Promise<Pick<ScanResult, "valid" | "error" | "magicOk">> {
	try {
		if (Platform.isMobile) {
			// 移动端 adapter 不支持 range read，加载时再做完整校验
			const stat = await vault.adapter.stat(path);
			if (!stat) return { valid: false, error: "文件不存在", magicOk: false };
			return { valid: true, magicOk: null };
		}
		const fs = require("fs");
		const fd = fs.openSync(path, "r");
		const buf = Buffer.alloc(8);
		try {
			const n = fs.readSync(fd, buf, 0, 8, 0);
			if (n < 8) return { valid: false, error: "文件过短", magicOk: false };
			const ok =
				buf[0] === MDX_MAGIC[0] && buf[1] === MDX_MAGIC[1] && buf[2] === MDX_MAGIC[2] && buf[3] === MDX_MAGIC[3];
			if (!ok) return { valid: false, error: "魔数校验失败（非 MDX）", magicOk: false };
			return { valid: true, magicOk: true };
		} finally {
			fs.closeSync(fd);
		}
	} catch (e: any) {
		return { valid: false, error: e?.message ?? "读取失败", magicOk: false };
	}
}

async function listFiles(vault: Vault, dir: string): Promise<string[]> {
	if (Platform.isMobile) {
		// 移动端：adapter.list 只返回 vault 内相对路径
		const entries = await vault.adapter.list(dir);
		return entries.files.filter((f) => !f.toLowerCase().includes("temp"));
	}
	const fs = require("fs");
	const p = require("path");
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((d: any) => d.isFile())
			.map((d: any) => p.join(dir, d.name));
	} catch (e: any) {
		return [];
	}
}

export { MDX_MAGIC, MDD_MAGIC };
