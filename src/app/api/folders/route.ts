import { NextRequest, NextResponse } from "next/server";
import { createFolder, listFolderContents } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parentId = request.nextUrl.searchParams.get("parent_id");
    const search = request.nextUrl.searchParams.get("search");
    return NextResponse.json(listFolderContents(parentId, search));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const folder = createFolder(String(body.name || ""), body.parent_id ?? null);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
