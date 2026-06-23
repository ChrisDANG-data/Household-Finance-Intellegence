import { NextResponse } from "next/server";

import { exportObsidianVaultZip } from "@/services/wiki/obsidian-vault.service";
import { jsonError } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

export const runtime = "nodejs";

/** GET — Download the compiled Obsidian vault as a ZIP */
export async function GET() {
  try {
    const { buffer, compiled } = await exportObsidianVaultZip();
    const filename = `finintel-obsidian-vault-${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Wiki-Page-Count": String(compiled.pageCount),
      },
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
