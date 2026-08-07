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

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required to publish desktop updates.");
}

const installer = await readFile(installerPath);
const signature = (await readFile(signaturePath, "utf8")).trim();
const installerBlob = await put(
  `desktop/releases/${version}/${installerName}`,
  installer,
  {
    access: "public",
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
      url: installerBlob.downloadUrl,
      signature,
    },
  },
};

const manifestBlob = await put(
  "desktop/releases/latest.json",
  JSON.stringify(manifest, null, 2),
  {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  },
);

console.log(`Published SlipSurge ${version}`);
console.log(`Installer: ${installerBlob.downloadUrl}`);
console.log(`Manifest: ${manifestBlob.downloadUrl}`);
