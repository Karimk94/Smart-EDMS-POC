import { NextRequest, NextResponse } from "next/server";
import { enqueueAnalysis } from "@/lib/analysisQueue";
import { getPhotoDetails } from "@/lib/db";
import type { AnalysisServiceKey } from "@/types/poc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function readOptionalJson(request: NextRequest) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function normalizeService(value: unknown): AnalysisServiceKey | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, AnalysisServiceKey> = {
    caption: "captioning",
    captions: "captioning",
    captioning: "captioning",
    object: "captioning",
    objects: "captioning",
    object_detected: "captioning",
    object_detection: "captioning",
    detected_objects: "captioning",
    ocr: "ocr",
    face: "face",
    faces: "face",
    face_detection: "face",
    face_recognition: "face",
  };
  return aliases[key] || null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = asRecord(await readOptionalJson(request));
    const serviceInput = body.service ?? body.target ?? request.nextUrl.searchParams.get("service");
    const service = normalizeService(serviceInput);

    if (serviceInput !== undefined && serviceInput !== null && !service) {
      return errorResponse(new Error("Unsupported analysis service."), 400);
    }

    const queue = enqueueAnalysis(
      id,
      service ? { clearResult: false, services: [service] } : { clearResult: false, skipSuccessful: true },
    );

    return NextResponse.json({ photo: getPhotoDetails(id), queue });
  } catch (error) {
    return errorResponse(error, 404);
  }
}
