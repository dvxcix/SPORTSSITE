import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const hubRoot = process.cwd();
const configPath = path.join(hubRoot, "desktop", "src-tauri", "tauri.conf.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const version = config.version;
const targetRoot = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(hubRoot, "desktop", "src-tauri", "target");
const installerName = `SlipSurge_${version}_x64-setup.exe`;
const installerPath = path.join(targetRoot, "release", "bundle", "nsis", installerName);
const signaturePath = `${installerPath}.sig`;
const updateBaseUrl = (
  process.env.DESKTOP_UPDATE_BASE_URL || "https://www.slipsurge.com"
).replace(/\/$/, "");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required to publish desktop updates.");
}

const installer = await readFile(installerPath);
const signature = (await readFile(signaturePath, "utf8")).trim();
const installerBlob = await put(
  `desktop/releases/${version}/${installerName}`,
  installer,
  {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.microsoft.portable-executable",
  },
);

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  notes: process.env.DESKTOP_RELEASE_NOTES || `SlipSurge desktop ${version}`,
  platforms: {
    "windows-x86_64": {
      url: `${updateBaseUrl}/api/desktop/download/windows/x86_64/${version}`,
      signature,
    },
  },
};

const manifestBlob = await put(
  "desktop/releases/latest.json",
  JSON.stringify(manifest, null, 2),
  {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  },
);

console.log(`Published SlipSurge ${version}`);
console.log(`Installer blob: ${installerBlob.pathname}`);
console.log(`Manifest blob: ${manifestBlob.pathname}`);
