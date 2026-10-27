import { Vault, TFile, TFolder } from "obsidian";

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

/** 递归扫描目录下所有层级的 mdx（走 Obsidian 内存文件树，零文件系统 I/O） */
export async function scanDirRecursive(
	vault: Vault,
	rootDir: string,
): Promise<ScanResult[]> {
	const root = vault.getAbstractFileByPath(rootDir);
	if (!root || !(root instanceof TFolder)) return [];
	const mdxList: { mdx: string; mdd: string | null; res: string[] }[] = [];
	const walk = (folder: TFolder): void => {
		const files = folder.children
			.filter((c): c is TFile => c instanceof TFile)
			.map((c) => c.path);
		for (const f of files) {
			if (!f.toLowerCase().endsWith(".mdx")) continue;
			const stem = f.toLowerCase().slice(0, -4);
			const mdd = files.find((x) => x.toLowerCase() === stem + ".mdd") ?? null;
			const res = files.filter((x) =>
				RESOURCE_EXTS.includes(x.toLowerCase().split(".").pop() ?? ""),
			);
			mdxList.push({ mdx: f, mdd, res });
		}
		for (const c of folder.children) {
			if (c instanceof TFolder) walk(c);
		}
	};
	walk(root);
	const results: ScanResult[] = [];
	for (const { mdx, mdd, res } of mdxList) {
		results.push({
			mdxPath: mdx,
			mddPath: mdd,
			resourceFiles: res,
			...(await inspectMdx(vault, mdx)),
		});
	}
	return results;
}

async function inspectMdx(
	vault: Vault,
	path: string
): Promise<Pick<ScanResult, "valid" | "error" | "magicOk">> {
	try {
		// 统一走 Obsidian Vault API（adapter），桌面/移动一致，符合社区审查要求。
		// Obsidian 无 range read，扫描阶段只做存在性校验；
		// 魔数（MDX/MDD 头）完整校验在词典 load 时由 vendor 解析失败自然触发。
		const stat = await vault.adapter.stat(path);
		if (!stat) return { valid: false, error: "文件不存在", magicOk: false };
		return { valid: true, magicOk: null };
	} catch (e: any) {
		return { valid: false, error: e?.message ?? "读取失败", magicOk: false };
	}
}

async function listFiles(vault: Vault, dir: string): Promise<string[]> {
	// 统一走 Obsidian Vault API（adapter），桌面/移动一致，符合社区审查要求
	try {
		const entries = await vault.adapter.list(dir);
		return entries.files.filter((f) => !f.toLowerCase().includes("temp"));
	} catch (e: any) {
		return [];
	}
}

export { MDX_MAGIC, MDD_MAGIC };
