import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WINDOWS_INSTALLER_CONTENT_TYPE =
  "application/vnd.microsoft.portable-executable";

export async function GET(
  _request: Request,
  context: { params: Promise<{ target: string; arch: string; version: string }> },
) {
  const { target, arch, version } = await context.params;
  if (
    target !== "windows" ||
    arch !== "x86_64" ||
    !/^\d+\.\d+\.\d+$/.test(version)
  ) {
    return NextResponse.json({ error: "Invalid desktop release" }, { status: 400 });
  }

  const installerName = `SlipSurge_${version}_x64-setup.exe`;
  const pathname = `desktop/releases/${version}/${installerName}`;

  try {
    const installer = await get(pathname, { access: "private" });
    if (!installer || installer.statusCode !== 200) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return new Response(installer.stream, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `attachment; filename="${installerName}"`,
        "Content-Length": String(installer.blob.size),
        "Content-Type":
          installer.blob.contentType || WINDOWS_INSTALLER_CONTENT_TYPE,
        ETag: installer.blob.etag,
      },
    });
  } catch (error) {
    console.error("Desktop installer download failed", error);
    return NextResponse.json({ error: "Release unavailable" }, { status: 503 });
  }
}
