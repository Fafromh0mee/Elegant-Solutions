import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const files: Record<string, string> = {
  "windows-x64": "ElegantAgentSetup_0.5.0_x64.exe",
  "macos-arm64": "elegant-agent_0.5.0_darwin_arm64.pkg",
  "macos-x86_64": "elegant-agent_0.5.0_darwin_x86_64.pkg",
  "linux-amd64": "elegant-agent_0.5.0_amd64.deb",
};

export async function GET(_request: Request, context: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session || !isAdminRole(session.user.role)) return new Response("Unauthorized", { status: 401 });
  const { platform } = await context.params;
  const filename = files[platform];
  if (!filename) return new Response("Unknown platform", { status: 404 });
  const directory = process.env.AGENT_INSTALLER_DIR;
  if (!directory) return new Response("Installer directory is not configured", { status: 503 });
  try {
    const content = await readFile(path.join(directory, filename));
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Installer has not been staged", { status: 404 });
  }
}
