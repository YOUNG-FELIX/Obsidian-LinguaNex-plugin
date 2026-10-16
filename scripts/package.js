// LinguaNex release packager
// Usage: node scripts/package.js  (or npm run package)
// Reads version from manifest.json, packs main.js + manifest.json + styles.css
// into release/lingua-nex-<version>.zip (zip root, no folder prefix).
"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const version = manifest.version;
const releaseDir = path.join(root, "release");
fs.mkdirSync(releaseDir, { recursive: true });

const zipName = `lingua-nex-${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

const files = ["main.js", "manifest.json", "styles.css"];
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.error("MISSING required file:", f);
    process.exit(1);
  }
}

execSync(`cd "${root}" && zip -j "${zipPath}" ${files.map((f) => `"${f}"`).join(" ")}`, {
  stdio: "inherit",
});

console.log("PACKAGED:", zipPath);
console.log("--- version info ---");
console.log("id:", manifest.id);
console.log("version:", version);
console.log("minAppVersion:", manifest.minAppVersion);
console.log("isDesktopOnly:", manifest.isDesktopOnly);
