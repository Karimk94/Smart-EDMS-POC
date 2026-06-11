import { NextRequest, NextResponse } from "next/server";
import { createFolder, listFolderContents } from "@/lib/db";
import type { SearchFilters } from "@/lib/db";

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
    const personIdsParam = request.nextUrl.searchParams.get("personIds");
    const personCondition = request.nextUrl.searchParams.get("personCondition") as "any" | "all" | null;
    const tagsParam = request.nextUrl.searchParams.get("tags");

    const filters: SearchFilters = {
      search: search || undefined,
      selectedPersonIds: personIdsParam ? personIdsParam.split(",").filter(Boolean) : undefined,
      personCondition: personCondition || "any",
      selectedTags: tagsParam ? tagsParam.split(",").filter(Boolean) : undefined,
    };

    return NextResponse.json(listFolderContents(parentId, search, filters));
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

