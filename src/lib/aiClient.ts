import { readFile } from "fs/promises";
import { getPhoto, getUploadPath } from "./db";
import {
  ANALYSIS_SERVICE_KEYS,
  type AnalysisResult,
  type AnalysisServiceKey,
  type AnalysisStatus,
  type ServiceResult,
} from "@/types/poc";

type RawObject = Record<string, unknown>;

interface ServiceOutcome {
  key: AnalysisServiceKey;
  status: ServiceResult["status"];
  data?: unknown;
  error?: string;
  preserved?: boolean;
}

interface AnalyzePhotoOptions {
  services?: AnalysisServiceKey[];
  skipSuccessful?: boolean;
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function joinEndpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function asObject(value: unknown): RawObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawObject) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeRequestedServices(services?: AnalysisServiceKey[]) {
  const requested = new Set(services && services.length > 0 ? services : ANALYSIS_SERVICE_KEYS);
  return ANALYSIS_SERVICE_KEYS.filter((service) => requested.has(service));
}

function hasSuccessfulService(analysis: AnalysisResult | null, service: AnalysisServiceKey) {
  return analysis?.services?.[service]?.status === "success";
}

function preservedOutcome(key: AnalysisServiceKey, previousAnalysis: AnalysisResult | null, fallbackReason: string): ServiceOutcome {
  const previousRawResponses = asObject(previousAnalysis?.rawResponses);
  const previousService = previousAnalysis?.services?.[key];

  if (previousService) {
    return {
      key,
      status: previousService.status,
      data: previousRawResponses[key],
      error: previousService.error,
      preserved: true,
    };
  }

  if (previousRawResponses[key] !== undefined) {
    return {
      key,
      status: "success",
      data: previousRawResponses[key],
      preserved: true,
    };
  }

  return { key, status: "skipped", error: fallbackReason };
}

export function parseStoredAnalysis(raw: string | null): AnalysisResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnalysisResult;
  } catch {
    return null;
  }
}

export function getAnalysisServicesToRun(analysis: AnalysisResult | null, options: AnalyzePhotoOptions = {}) {
  const requestedServices = normalizeRequestedServices(options.services);
  if (!options.skipSuccessful) return requestedServices;
  return requestedServices.filter((service) => !hasSuccessfulService(analysis, service));
}

async function postImageStream(baseUrl: string | undefined, endpoint: string, imageBuffer: Buffer, filename: string) {
  if (!baseUrl) {
    return { skipped: true, reason: "Service URL is not configured." };
  }

  const timeoutMs = envNumber("AI_REQUEST_TIMEOUT_MS", 300000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(joinEndpoint(baseUrl, endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": encodeURIComponent(filename),
      },
      body: new Uint8Array(imageBuffer),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let json: unknown = responseText;
    try {
      json = responseText ? JSON.parse(responseText) : {};
    } catch {
      // Keep the raw text body for inspection in the POC.
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
    }

    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function settleService(key: AnalysisServiceKey, promise: Promise<unknown>): Promise<ServiceOutcome> {
  const settled = await Promise.allSettled([promise]);
  const result = settled[0];

  if (result.status === "rejected") {
    return { key, status: "error", error: getErrorMessage(result.reason) };
  }

  const object = asObject(result.value);
  if (object.skipped === true) {
    return { key, status: "skipped", data: result.value, error: asString(object.reason) };
  }

  return { key, status: "success", data: result.value };
}

function normalizeAnalysis(
  outcomes: ServiceOutcome[],
  previousAnalysis: AnalysisResult | null,
): { status: AnalysisStatus; analysis: AnalysisResult; error: string | null } {
  const byKey = Object.fromEntries(outcomes.map((outcome) => [outcome.key, outcome])) as Record<AnalysisServiceKey, ServiceOutcome>;
  const captionRaw = byKey.captioning?.data;
  const ocrRaw = byKey.ocr?.data;
  const faceRaw = byKey.face?.data;

  const captionObject = asObject(captionRaw);
  const ocrObject = asObject(ocrRaw);
  const faceObject = asObject(faceRaw);

  const services = Object.fromEntries(
    ANALYSIS_SERVICE_KEYS.map((key) => [
      key,
      {
        status: byKey[key]?.status || "error",
        error: byKey[key]?.error,
      },
    ]),
  ) as AnalysisResult["services"];

  const successCount = Object.values(services).filter((service) => service.status === "success").length;
  const status: AnalysisStatus = successCount === ANALYSIS_SERVICE_KEYS.length ? "complete" : successCount > 0 ? "partial" : "failed";
  const errors = Object.entries(services)
    .filter(([, service]) => service.status !== "success")
    .map(([name, service]) => `${name}: ${service.error || service.status}`);
  const parsedObjects = unique([
    ...asStringArray(captionObject.objects),
    ...asStringArray(captionObject.tags),
    ...asStringArray(captionObject.labels),
  ]);

  const analysis: AnalysisResult = {
    caption:
      captionRaw === undefined && byKey.captioning?.preserved
        ? previousAnalysis?.caption || ""
        : asString(captionObject.caption) || asString(captionObject.description),
    objects: captionRaw === undefined && byKey.captioning?.preserved ? previousAnalysis?.objects || [] : parsedObjects,
    ocrText:
      ocrRaw === undefined && byKey.ocr?.preserved ? previousAnalysis?.ocrText || "" : asString(ocrObject.text) || asString(ocrObject.ocr_text),
    faces: faceRaw === undefined && byKey.face?.preserved ? previousAnalysis?.faces || [] : Array.isArray(faceObject.faces) ? faceObject.faces : [],
    rawResponses: {
      captioning: captionRaw,
      ocr: ocrRaw,
      face: faceRaw,
    },
    services,
    completedAt: new Date().toISOString(),
  };

  return { status, analysis, error: errors.length ? errors.join("; ") : null };
}

function callService(key: AnalysisServiceKey, imageBuffer: Buffer, filename: string) {
  switch (key) {
    case "captioning":
      return postImageStream(process.env.CAPTIONING_API_URL, "/process_image_stream", imageBuffer, filename);
    case "ocr":
      return postImageStream(process.env.OCR_API_URL, "/translate_image_stream", imageBuffer, filename);
    case "face":
      return postImageStream(process.env.FACE_API_URL, "/api/analyze_image_stream", imageBuffer, filename);
  }
}

export async function analyzePhoto(photoId: string, options: AnalyzePhotoOptions = {}) {
  const photo = getPhoto(photoId);
  if (!photo) throw new Error("Photo not found.");

  const previousAnalysis = parseStoredAnalysis(photo.analysis_json);
  const requestedServices = new Set(normalizeRequestedServices(options.services));
  const servicesToRun = new Set(getAnalysisServicesToRun(previousAnalysis, options));
  const imageBuffer = servicesToRun.size > 0 ? await readFile(getUploadPath(photo)) : null;

  const calls = ANALYSIS_SERVICE_KEYS.map((key) => {
    if (!servicesToRun.has(key)) {
      const fallbackReason = requestedServices.has(key) ? "Already succeeded; not re-run." : "Service was not requested.";
      return Promise.resolve(preservedOutcome(key, previousAnalysis, fallbackReason));
    }

    return settleService(key, callService(key, imageBuffer!, photo.original_name));
  });

  const outcomes = await Promise.all(calls);
  return normalizeAnalysis(outcomes, previousAnalysis);
}
