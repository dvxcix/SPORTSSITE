import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UpdateManifest = {
  version: string;
  pub_date: string;
  notes?: string;
  platforms: Record<string, { url: string; signature: string }>;
};

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ target: string; arch: string; currentVersion: string }> },
) {
  const { target, arch, currentVersion } = await context.params;
  if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  try {
    const { blobs } = await list({ prefix: "desktop/releases/latest.json", limit: 1 });
    const latest = blobs.find((blob) => blob.pathname === "desktop/releases/latest.json");
    if (!latest) return new NextResponse(null, { status: 204 });

    const response = await fetch(latest.downloadUrl, { cache: "no-store" });
    if (!response.ok) return new NextResponse(null, { status: 204 });

    const manifest = (await response.json()) as UpdateManifest;
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      return new NextResponse(null, { status: 204 });
    }
    if (compareVersions(manifest.version, currentVersion) <= 0) {
      return new NextResponse(null, { status: 204 });
    }

    const platform = manifest.platforms[`${target}-${arch}`];
    if (!platform) return new NextResponse(null, { status: 204 });

    return NextResponse.json({
      version: manifest.version,
      pub_date: manifest.pub_date,
      notes: manifest.notes ?? "A new SlipSurge desktop update is ready.",
      url: platform.url,
      signature: platform.signature,
    });
  } catch (error) {
    console.error("Desktop updater lookup failed", error);
    return new NextResponse(null, { status: 204 });
  }
}
