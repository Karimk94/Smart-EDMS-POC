"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { formatName } from "@/lib/formatters";
import type { AnalysisResult, AnalysisServiceKey, AnalysisStatus, PhotoDetails, FaceDetection, Person } from "@/types/poc";
import { LoadingButton } from "./LoadingButton";
import { Spinner } from "./Spinner";
import { useToast } from "./ToastProvider";
import { FaceNameModal } from "./FaceNameModal";

interface PhotoModalProps {
  photoId: string;
  lang?: Lang;
  onClose: () => void;
  onChanged: () => void;
}

function statusClass(status: AnalysisStatus) {
  switch (status) {
    case "complete":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800";
    case "partial":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800";
    case "queued":
    case "running":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  }
}

function serviceClass(status: string) {
  if (status === "success") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200";
  if (status === "skipped") return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200";
}

function serviceDisplayName(name: string) {
  if (name === "captioning") return "Captions / Objects";
  if (name === "ocr") return "OCR";
  if (name === "face") return "Face";
  return name;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isBusy(status: AnalysisStatus) {
  return status === "pending" || status === "queued" || status === "running";
}

function RawJson({ analysis }: { analysis: AnalysisResult }) {
  return (
    <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Raw API responses</summary>
      <pre className="max-h-72 overflow-auto border-t border-gray-200 dark:border-gray-700 p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {JSON.stringify(analysis.rawResponses, null, 2)}
      </pre>
    </details>
  );
}

const analysisActions: Array<{ key: string; label: string; service: AnalysisServiceKey }> = [
  { key: "ocr", label: "OCR", service: "ocr" },
  { key: "face", label: "Face Detection", service: "face" },
  { key: "objects", label: "Object Detection + Caption", service: "captioning" }
];

// ─── EditableTextarea ────────────────────────────────────────────────────────
function EditableTextarea({
  label,
  value,
  onSave,
  isSaving,
  minHeight = "min-h-[80px]",
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  isSaving: boolean;
  minHeight?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = async () => {
    await onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className={`w-full rounded-lg bg-white dark:bg-[#1a1a1a] border-2 border-blue-400 dark:border-blue-500 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-blue-400/50 ${minHeight}`}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <LoadingButton
              onClick={handleSave}
              isLoading={isSaving}
              loadingText="Saving..."
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </LoadingButton>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={`rounded-lg bg-gray-50 dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-700 p-4 text-sm leading-relaxed whitespace-pre-wrap ${minHeight}`}>
          {value || <span className="italic text-gray-400">No {label.toLowerCase()} returned.</span>}
        </p>
      )}
    </section>
  );
}

// ─── TagsEditor ───────────────────────────────────────────────────────────────
function TagsEditor({
  tags,
  onSave,
  isSaving,
}: {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(tags);
  const [newTag, setNewTag] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(tags);
    setIsDirty(false);
  }, [tags]);

  const removeTag = (index: number) => {
    const updated = draft.filter((_, i) => i !== index);
    setDraft(updated);
    setIsDirty(true);
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || draft.includes(trimmed)) {
      setNewTag("");
      return;
    }
    const updated = [...draft, trimmed];
    setDraft(updated);
    setNewTag("");
    setIsDirty(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Escape") {
      setNewTag("");
    }
  };

  const handleSave = async () => {
    await onSave(draft);
    setIsDirty(false);
  };

  const handleDiscard = () => {
    setDraft(tags);
    setNewTag("");
    setIsDirty(false);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Objects / Tags</h3>
      <div className="flex flex-wrap gap-2">
        {draft.length === 0 && !newTag && (
          <p className="text-sm text-gray-400 italic">No tags. Add one below.</p>
        )}
        {draft.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 text-xs font-semibold group"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              aria-label={`Remove tag ${tag}`}
              className="ml-0.5 rounded-full w-4 h-4 flex items-center justify-center text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition opacity-60 group-hover:opacity-100"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {/* Add new tag */}
      <div className="flex items-center gap-2 pt-1">
        <input
          ref={inputRef}
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag…"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!newTag.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* Save / Discard */}
      {isDirty && (
        <div className="flex items-center gap-2 pt-1">
          <LoadingButton
            onClick={handleSave}
            isLoading={isSaving}
            loadingText="Saving..."
            className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Tags
          </LoadingButton>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSaving}
            className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      )}
    </section>
  );
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────
export function PhotoModal({ photoId, onClose, onChanged }: PhotoModalProps) {
  const [photo, setPhoto] = useState<PhotoDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalysisMenuOpen, setIsAnalysisMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceToName, setFaceToName] = useState<FaceDetection | null>(null);
  const [isSavingCaption, setIsSavingCaption] = useState(false);
  const [isSavingOcr, setIsSavingOcr] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const analysisMenuRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();

  const loadPhoto = useCallback(async () => {
    try {
      const response = await fetch(`/api/photos/${photoId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load photo.");
      setPhoto(data.photo);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [photoId]);

  useEffect(() => {
    void loadPhoto();
  }, [loadPhoto]);

  useEffect(() => {
    if (!photo || !isBusy(photo.analysis_status)) return;
    const interval = window.setInterval(() => {
      void loadPhoto();
      onChanged();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [loadPhoto, onChanged, photo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isAnalysisMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (analysisMenuRef.current && event.target instanceof Node && !analysisMenuRef.current.contains(event.target)) {
        setIsAnalysisMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isAnalysisMenuOpen]);

  const runAnalysis = async (service?: AnalysisServiceKey, label = "Analysis") => {
    if (!photo) return;
    setIsAnalyzing(true);
    setIsAnalysisMenuOpen(false);
    try {
      const response = await fetch(`/api/photos/${photo.id}/analyze`, {
        method: "POST",
        headers: service ? { "Content-Type": "application/json" } : undefined,
        body: service ? JSON.stringify({ service }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to queue analysis.");
      setPhoto(data.photo);
      onChanged();
      showToast(data.queue?.reason === "all_success" ? "All analysis services already succeeded." : `${label} queued.`, "success");
    } catch (runError) {
      showToast(runError instanceof Error ? runError.message : String(runError), "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Patch helpers ──────────────────────────────────────────────────────────
  const patchAnalysis = async (fields: { caption?: string; ocrText?: string; objects?: string[] }) => {
    const response = await fetch(`/api/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save.");
    setPhoto(data.photo);
    onChanged();
  };

  const handleSaveCaption = async (caption: string) => {
    setIsSavingCaption(true);
    try {
      await patchAnalysis({ caption });
      showToast("Caption saved.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleSaveOcr = async (ocrText: string) => {
    setIsSavingOcr(true);
    try {
      await patchAnalysis({ ocrText });
      showToast("OCR text saved.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsSavingOcr(false);
    }
  };

  const handleSaveTags = async (objects: string[]) => {
    setIsSavingTags(true);
    try {
      await patchAnalysis({ objects });
      showToast("Tags saved.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsSavingTags(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const faces = Array.isArray(photo?.analysis?.faces) ? (photo.analysis.faces as FaceDetection[]) : [];
  const analysisDisabled = !photo || photo.analysis_status === "running" || photo.analysis_status === "queued";

  const handleFaceSave = (person: Person) => {
    showToast(`Successfully saved "${person.name}" to the known faces database`, "success");
    setFaceToName(null);
    void loadPhoto();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#282828] text-gray-900 dark:text-gray-100 rounded-xl w-full max-w-6xl max-h-[92vh] overflow-hidden relative shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{photo?.title || "Photo"}</h2>
            {photo && (
              <div className="mt-2 flex items-center flex-wrap gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${statusClass(photo.analysis_status)}`}>{photo.analysis_status}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{photo.original_name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div ref={analysisMenuRef} className="relative flex items-stretch">
              <LoadingButton
                onClick={() => runAnalysis()}
                isLoading={isAnalyzing}
                loadingText="Queuing..."
                disabled={analysisDisabled}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-l-lg hover:bg-red-700 transition disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                Re-run Analysis
              </LoadingButton>
              <button
                type="button"
                aria-label="Choose analysis service"
                aria-expanded={isAnalysisMenuOpen}
                onClick={() => setIsAnalysisMenuOpen((isOpen) => !isOpen)}
                disabled={analysisDisabled || isAnalyzing}
                className="flex w-10 items-center justify-center rounded-r-lg border-l border-red-500 bg-red-600 text-white hover:bg-red-700 transition disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                <Image src="/icons/chevron-down.svg" alt="" width={18} height={18} className="invert" />
              </button>
              {isAnalysisMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-[#1f1f1f]">
                  {analysisActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => runAnalysis(action.service, action.label)}
                      className="block w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
              <Image src="/icons/close.svg" alt="" width={24} height={24} className="dark:invert" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {isLoading ? (
          <Spinner label="Loading photo..." />
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : photo ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] overflow-hidden">
            {/* Image – sticky at top of the left column */}
            <div className="bg-black self-start sticky top-0 min-h-[300px] lg:h-[calc(92vh-92px)] flex items-start justify-center p-4">
              <div className="relative w-full h-full min-h-[300px]">
                <Image src={photo.file_url} alt={photo.title} fill className="object-contain object-top" unoptimized />
              </div>
            </div>

            {/* Details panel – scrollable */}
            <div className="overflow-y-auto p-5 space-y-5">
              {isBusy(photo.analysis_status) && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 text-blue-800 dark:text-blue-200">
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Analysis is {photo.analysis_status}.
                  </div>
                </div>
              )}

              {photo.analysis_error && (
                <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 p-4 text-sm text-yellow-900 dark:text-yellow-200">
                  {photo.analysis_error}
                </div>
              )}

              {photo.analysis ? (
                <>
                  {/* Caption */}
                  <EditableTextarea
                    label="Caption"
                    value={photo.analysis.caption || ""}
                    onSave={handleSaveCaption}
                    isSaving={isSavingCaption}
                    minHeight="min-h-[60px]"
                  />

                  {/* Tags */}
                  <TagsEditor
                    tags={photo.analysis.objects}
                    onSave={handleSaveTags}
                    isSaving={isSavingTags}
                  />

                  {/* OCR Text */}
                  <EditableTextarea
                    label="OCR Text"
                    value={photo.analysis.ocrText || ""}
                    onSave={handleSaveOcr}
                    isSaving={isSavingOcr}
                    minHeight="min-h-[96px]"
                  />

                  {/* Detected Faces */}
                  {faces.length ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Detected Faces</h3>
                      <div className="space-y-2">
                        {faces.map((face, index) => {
                          const colors = [
                            "bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700",
                            "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700",
                            "bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700",
                            "bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700",
                            "bg-pink-100 border-pink-300 dark:bg-pink-900/30 dark:border-pink-700",
                          ];
                          const colorClass = colors[index % colors.length];
                          return (
                            <div key={`${face.name || "unknown"}-${index}`} className={`flex items-center gap-3 rounded-lg border ${colorClass} p-3`}>
                              <div className="flex-shrink-0 w-12 h-12 rounded-md border-2 border-current overflow-hidden flex items-center justify-center bg-white dark:bg-[#1f1f1f]">
                                {face.thumbnailB64 || face.thumbnail_b64 ? (
                                  <Image
                                    src={`data:image/jpeg;base64,${face.thumbnailB64 || face.thumbnail_b64}`}
                                    alt=""
                                    width={48}
                                    height={48}
                                    className="h-full w-full object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="text-2xl font-bold text-gray-400">#{index + 1}</div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold">{formatName(face.name || "Unknown")}</div>
                                {face.distance !== undefined && <div className="text-xs opacity-70">Confidence: {(100 - Number(face.distance) * 100).toFixed(1)}%</div>}
                              </div>
                              <button
                                onClick={() => setFaceToName(face)}
                                className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition whitespace-nowrap"
                              >
                                {face.personId || face.name ? "Update Name" : "Name & Save"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : (
                    <section className="space-y-2">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Detected Faces</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">No faces returned.</p>
                    </section>
                  )}

                  {/* Service Status */}
                  <section className="space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Service Status</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {Object.entries(photo.analysis.services).map(([name, service]) => (
                        <div key={name} className={`rounded-lg p-3 text-xs font-semibold ${serviceClass(service.status)}`}>
                          <div className="uppercase">{serviceDisplayName(name)}</div>
                          <div className="mt-1">{service.status}</div>
                          {service.error && <div className="mt-1 font-normal break-words">{service.error}</div>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <RawJson analysis={photo.analysis} />
                </>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f] p-6 text-center text-gray-500 dark:text-gray-400">
                  No analysis result has been saved yet.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {faceToName && (
        <FaceNameModal
          face={faceToName}
          photoId={photoId}
          onClose={() => setFaceToName(null)}
          onSave={handleFaceSave}
        />
      )}
    </div>
  );
}
