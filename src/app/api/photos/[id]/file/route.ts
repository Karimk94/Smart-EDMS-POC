import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getPhoto, getUploadPath } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const photo = getPhoto(id);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  try {
    const fileBuffer = await readFile(getUploadPath(photo));
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": photo.mime_type,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${encodeURIComponent(photo.original_name)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo file was not found on disk." }, { status: 404 });
  }
}
