export type AnalysisStatus = "pending" | "queued" | "running" | "complete" | "partial" | "failed";
export const ANALYSIS_SERVICE_KEYS = ["captioning", "ocr", "face"] as const;
export type AnalysisServiceKey = (typeof ANALYSIS_SERVICE_KEYS)[number];

export interface Breadcrumb {
  id: string | null;
  name: string;
}

export interface FolderItem {
  id: string;
  name: string;
  type: "folder" | "file";
  parent_id: string | null;
  media_type?: "image" | "folder";
  count?: number;
  thumbnail_url?: string;
  analysis_status?: AnalysisStatus;
}

export interface ServiceResult {
  status: "success" | "error" | "skipped";
  error?: string;
}

export interface FaceLocation {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface FaceDetection {
  index: number;
  name?: string;
  personId?: string;
  location: FaceLocation;
  encoding?: string;
  confidence?: number;
  distance?: number;
  thumbnailB64?: string;
  thumbnail_b64?: string;
}

export interface Person {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisResult {
  caption: string;
  objects: string[];
  ocrText: string;
  faces: FaceDetection[];
  rawResponses: Partial<Record<AnalysisServiceKey, unknown>>;
  services: Record<AnalysisServiceKey, ServiceResult>;
  completedAt: string;
}

export interface PhotoRecord {
  id: string;
  folder_id: string | null;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  title: string;
  uploaded_at: string;
  analysis_status: AnalysisStatus;
  analysis_json: string | null;
  analysis_started_at: string | null;
  analysis_completed_at: string | null;
  analysis_error: string | null;
}

export interface PhotoDetails extends Omit<PhotoRecord, "analysis_json"> {
  file_url: string;
  analysis: AnalysisResult | null;
}
