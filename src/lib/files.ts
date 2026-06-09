import path from "path";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { createPhoto, getUploadPath } from "./db";
import { ensureDataDirs } from "./paths";

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif"]);

export function isSupportedImage(filename: string, mimeType: string) {
  const extension = path.extname(filename).toLowerCase();
  return allowedExtensions.has(extension) && allowedMimeTypes.has(mimeType);
}

export async function storeUploadedImage(file: File, folderId?: string | null) {
  if (!file.name) throw new Error("Uploaded file is missing a filename.");
  if (!isSupportedImage(file.name, file.type)) {
    throw new Error(`${file.name} is not a supported image file.`);
  }

  ensureDataDirs();

  const extension = path.extname(file.name).toLowerCase();
  const storedName = `${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const photo = createPhoto({
    folderId,
    originalName: file.name,
    storedName,
    mimeType: file.type,
    size: buffer.length,
  });

  await writeFile(getUploadPath(photo), buffer);
  return photo;
}
