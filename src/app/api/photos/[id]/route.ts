import { NextRequest, NextResponse } from "next/server";
import { deletePhoto, getPhotoDetails, renamePhoto, updatePhotoAnalysisFields } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const photo = getPhotoDetails(id);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const photo = renamePhoto(id, String(body.name || body.title || ""));
    return NextResponse.json({ photo });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { caption?: string; ocrText?: string; objects?: string[] };
    const photo = updatePhotoAnalysisFields(id, {
      ...(body.caption !== undefined && { caption: String(body.caption) }),
      ...(body.ocrText !== undefined && { ocrText: String(body.ocrText) }),
      ...(body.objects !== undefined && { objects: Array.isArray(body.objects) ? body.objects.map(String) : [] }),
    });
    return NextResponse.json({ photo });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(deletePhoto(id));
  } catch (error) {
    return errorResponse(error, 404);
  }
}
