import { analyzePhoto, getAnalysisServicesToRun, parseStoredAnalysis } from "./aiClient";
import { getPhoto, savePhotoAnalysis, setPhotoAnalysisStatus } from "./db";
import type { AnalysisServiceKey } from "@/types/poc";

interface QueueItem {
  photoId: string;
  clearResult: boolean;
  services?: AnalysisServiceKey[];
  skipSuccessful: boolean;
}

const queue: QueueItem[] = [];
const queuedIds = new Set<string>();
let runningCount = 0;

function concurrencyLimit() {
  const value = Number(process.env.ANALYSIS_CONCURRENCY || 2);
  return Number.isFinite(value) && value > 0 ? value : 2;
}

function drainQueue() {
  while (runningCount < concurrencyLimit() && queue.length > 0) {
    const item = queue.shift()!;
    queuedIds.delete(item.photoId);
    runningCount += 1;

    void runQueueItem(item).finally(() => {
      runningCount -= 1;
      drainQueue();
    });
  }
}

async function runQueueItem(item: QueueItem) {
  const photo = getPhoto(item.photoId);
  if (!photo) return;

  setPhotoAnalysisStatus(item.photoId, "running", { clearResult: item.clearResult });

  try {
    const result = await analyzePhoto(item.photoId, { services: item.services, skipSuccessful: item.skipSuccessful });
    savePhotoAnalysis(item.photoId, result.status, result.analysis, result.error);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPhotoAnalysisStatus(item.photoId, "failed", { error: message });
  }
}

export function enqueueAnalysis(
  photoId: string,
  options: { clearResult?: boolean; services?: AnalysisServiceKey[]; skipSuccessful?: boolean } = {},
) {
  const photo = getPhoto(photoId);
  if (!photo) throw new Error("Photo not found.");

  if (queuedIds.has(photoId) || photo.analysis_status === "running") {
    return { queued: false, status: photo.analysis_status };
  }

  if (options.skipSuccessful) {
    const servicesToRun = getAnalysisServicesToRun(parseStoredAnalysis(photo.analysis_json), {
      services: options.services,
      skipSuccessful: true,
    });
    if (servicesToRun.length === 0) {
      return { queued: false, status: photo.analysis_status, reason: "all_success" as const };
    }
  }

  setPhotoAnalysisStatus(photoId, "queued", {
    clearResult: options.clearResult ?? true,
    error: null,
  });

  queue.push({
    photoId,
    clearResult: options.clearResult ?? true,
    services: options.services,
    skipSuccessful: options.skipSuccessful ?? false,
  });
  queuedIds.add(photoId);
  void Promise.resolve().then(drainQueue);

  return { queued: true, status: "queued" as const };
}
