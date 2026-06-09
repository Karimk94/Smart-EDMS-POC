import { NextRequest, NextResponse } from "next/server";
import { enqueueAnalysis } from "@/lib/analysisQueue";
import { storeUploadedImage } from "@/lib/files";
import { getPhotoDetails } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const folderId = String(formData.get("folder_id") || "") || null;
    const fileEntries = [...formData.getAll("files"), ...formData.getAll("file")].filter(isFile);

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "No image files were uploaded." }, { status: 400 });
    }

    const created = [];
    const failed = [];

    for (const file of fileEntries) {
      try {
        const photo = await storeUploadedImage(file, folderId);
        enqueueAnalysis(photo.id, { clearResult: true });
        created.push(getPhotoDetails(photo.id));
      } catch (error) {
        failed.push({
          filename: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (created.length === 0) {
      return NextResponse.json({ created, failed }, { status: 400 });
    }

    return NextResponse.json({ created, failed }, { status: failed.length ? 207 : 201 });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
