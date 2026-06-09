import { NextRequest, NextResponse } from "next/server";
import { getPhoto, getOrCreatePerson, saveFace, getFacesByPhoto, getUploadPath, savePhotoAnalysis } from "@/lib/db";
import { readFileSync } from "fs";
import type { FaceDetection } from "@/types/poc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await context.params;
    const photo = getPhoto(photoId);
    if (!photo) {
      return errorResponse(new Error("Photo not found."), 404);
    }

    const body = await request.json();
    const { face } = body as { face: FaceDetection & { encoding?: string } };

    if (!face) {
      return errorResponse(new Error("Face data is required."), 400);
    }

    if (!face.name || !face.name.trim()) {
      return errorResponse(new Error("Face name is required."), 400);
    }

    if (!face.encoding) {
      return errorResponse(new Error("Face encoding is required."), 400);
    }

    // Get or create person
    const person = getOrCreatePerson(face.name);

    // Save face to database
    const savedFace = saveFace({
      personId: person.id,
      encoding: face.encoding,
      photoId,
      location: face.location,
      thumbnailB64: face.thumbnailB64 || face.thumbnail_b64,
    });

    try {
      const photoPath = getUploadPath(photo);
      const original_image_b64 = readFileSync(photoPath, { encoding: "base64" });

      const faceApiUrl = process.env.FACE_API_URL || "http://localhost:5002";
      
      const faceRecogResponse = await fetch(`${faceApiUrl.endsWith("/") ? faceApiUrl.slice(0, -1) : faceApiUrl}/api/add_face`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: person.name,
          location: face.location,
          original_image_b64,
        }),
      });

      if (!faceRecogResponse.ok) {
        const errText = await faceRecogResponse.text().catch(() => "");
        console.error("Face recognition service failed to save face:", faceRecogResponse.status, errText);
      }
    } catch (error) {
      console.error("Failed to forward face to face recognition service:", error);
    }

    if (photo.analysis_json) {
      try {
        const analysis = JSON.parse(photo.analysis_json);
        if (analysis && Array.isArray(analysis.faces)) {
          const targetFace = analysis.faces.find((f: any) => f.index === face.index);
          if (targetFace) {
            targetFace.name = person.name;
            targetFace.personId = person.id;
            savePhotoAnalysis(photoId, photo.analysis_status, analysis, photo.analysis_error);
          }
        }
      } catch (e) {
        console.error("Failed to update photo analysis_json:", e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        face: savedFace,
        person,
        isNewPerson: person.isNew,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await context.params;
    const photo = getPhoto(photoId);
    if (!photo) {
      return errorResponse(new Error("Photo not found."), 404);
    }

    const faces = getFacesByPhoto(photoId);

    return NextResponse.json({
      photoId,
      faces,
      count: faces.length,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
