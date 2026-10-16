import { Platform, Vault } from "obsidian";
import { baseName } from "./scanner";

/**
 * DictResources — 词典目录下配套资源（css/js/ini）的加载与 blob URL 映射。
 * 词条 HTML 中 `<link href="xxx.css">` / `<script src="xxx.js">` 按 basename 命中即替换为 blob URL。
 */
export class DictResources {
	private map = new Map<string, string>();
	private text = new Map<string, string>();

	private constructor() {}

	static async load(
		vault: Vault,
		dir: string,
		resourceFiles: string[]
	): Promise<DictResources> {
		const inst = new DictResources();
		for (const f of resourceFiles) {
			const name = baseName(f).toLowerCase();
			try {
				const content = await readFileText(vault, f);
				inst.text.set(name, content);
				const blob = new Blob([content], {
					type: mimeFor(name),
				});
				inst.map.set(name, URL.createObjectURL(blob));
			} catch (e) {
				/* 单个资源失败不影响整体 */
			}
		}
		return inst;
	}

	/** 按 basename（小写）取 blob URL，未命中返回 null */
	urlFor(name: string): string | null {
		const key = baseName(name).toLowerCase();
		return this.map.get(key) ?? null;
	}

	/** 按 basename（小写）取原始文本内容（用于内联 CSS），未命中返回 null */
	contentFor(name: string): string | null {
		const key = baseName(name).toLowerCase();
		return this.text.get(key) ?? null;
	}

	has(name: string): boolean {
		return this.urlFor(name) != null;
	}

	dispose(): void {
		for (const url of this.map.values()) URL.revokeObjectURL(url);
		this.map.clear();
		this.text.clear();
	}
}

async function readFileText(vault: Vault, f: string): Promise<string> {
	if (Platform.isMobile) {
		return await vault.adapter.read(f);
	}
	const fs = require("fs");
	return fs.readFileSync(f, "utf8");
}

function mimeFor(name: string): string {
	if (name.endsWith(".css")) return "text/css";
	if (name.endsWith(".js")) return "text/javascript";
	if (name.endsWith(".ini")) return "text/javascript";
	return "text/plain";
}
