import { NextRequest, NextResponse } from "next/server";
import { createPerson, listPersons } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search") || "";
    const pageStr = request.nextUrl.searchParams.get("page") || "1";
    const pageSizeStr = request.nextUrl.searchParams.get("pageSize") || "50";

    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(pageSizeStr, 10) || 50));
    const offset = (page - 1) * pageSize;

    const result = listPersons(search || undefined, pageSize, offset);

    return NextResponse.json({
      persons: result.persons,
      page,
      pageSize,
      total: result.total,
      hasMore: offset + pageSize < result.total,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(new Error("Person name is required."), 400);
    }

    const person = createPerson(name);

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
