import { NextRequest, NextResponse } from "next/server";
import { deleteFolderRecursive, renameFolder } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const folder = renameFolder(id, String(body.name || ""));
    return NextResponse.json({ folder });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(deleteFolderRecursive(id));
  } catch (error) {
    return errorResponse(error, 404);
  }
}
