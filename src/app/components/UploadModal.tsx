"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { LoadingButton } from "./LoadingButton";
import { useToast } from "./ToastProvider";

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface UploadEntry {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
}

interface UploadModalProps {
  parentId: string | null;
  parentName: string;
  lang: Lang;
  onClose: () => void;
  onUploaded: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadModal({ parentId, parentName, lang, onClose, onUploaded }: UploadModalProps) {
  const [files, setFiles] = useState<UploadEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);
  const { showToast } = useToast();
  const t = (key: string, replacements?: Record<string, string | number>) => translate(lang, key, replacements);

  const updateEntry = (id: string, updates: Partial<UploadEntry>) => {
    setFiles((current) => current.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
  };

  const addFiles = (selected: FileList | File[]) => {
    const nextFiles = Array.from(selected).map((file) => ({
      id: `upload-${counterRef.current++}`,
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((current) => [...current, ...nextFiles]);
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
  };

  const uploadOne = (entry: UploadEntry) => {
    return new Promise<boolean>((resolve) => {
      updateEntry(entry.id, { status: "uploading", progress: 0, error: undefined });

      const formData = new FormData();
      formData.append("file", entry.file);
      if (parentId) formData.append("folder_id", parentId);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/photos", true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          updateEntry(entry.id, { progress: Math.round((event.loaded / event.total) * 100) });
        }
      };

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText || "{}");
          const firstError = response.failed?.[0]?.error || response.error;

          if (xhr.status >= 200 && xhr.status < 300 && response.created?.length) {
            updateEntry(entry.id, { status: "success", progress: 100 });
            resolve(true);
            return;
          }

          updateEntry(entry.id, {
            status: "error",
            error: firstError || `Upload failed with HTTP ${xhr.status}`,
          });
        } catch {
          updateEntry(entry.id, { status: "error", error: "Failed to parse upload response." });
        }
        resolve(false);
      };

      xhr.onerror = () => {
        updateEntry(entry.id, { status: "error", error: "Network error during upload." });
        resolve(false);
      };

      xhr.send(formData);
    });
  };

  const startUpload = async () => {
    const pending = files.filter((entry) => entry.status === "pending" || entry.status === "error");
    if (pending.length === 0) return;

    setIsUploading(true);
    const results = await Promise.all(pending.map(uploadOne));
    setIsUploading(false);

    const successCount = results.filter(Boolean).length;
    if (successCount > 0) {
      showToast(t("imageUploaded", { count: successCount }), "success");
      onUploaded();
    }
    if (successCount < pending.length) {
      showToast(t("imageUploadFailed", { count: pending.length - successCount }), "warning");
    }
  };

  const pendingCount = files.filter((entry) => entry.status === "pending" || entry.status === "error").length;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col p-4 md:p-8" role="dialog" aria-modal="true">
      <div className="flex-shrink-0 flex justify-between items-center mb-6 bg-blue-900/30 p-4 rounded-lg border border-blue-800">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Image src="/folder.svg" alt="" width={24} height={24} className="brightness-0 invert" />
            {t("uploadPhotos")}
          </h2>
          <p className="text-sm text-gray-300 mt-1">
            {t("targetFolder")}: <span className="text-blue-300 font-bold underline">{parentName || t("home")}</span>
          </p>
        </div>
        <button onClick={onClose} disabled={isUploading} className="p-2 rounded-full hover:bg-white/10 disabled:opacity-50">
          <Image src="/icons/close.svg" alt="" width={24} height={24} className="invert" />
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-8 overflow-hidden">
        <div className="w-full md:w-1/3 flex flex-col">
          <div
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              addFiles(event.dataTransfer.files);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            className={`flex-1 border-2 border-dashed rounded-xl flex flex-col justify-center items-center p-4 md:p-8 text-center transition-colors min-h-[180px] ${
              isDragOver ? "border-blue-500 bg-[#222]" : "border-gray-600"
            }`}
          >
            <Image src="/upload.svg" alt="" width={44} height={44} className="mb-3 invert" />
            <p className="text-lg text-gray-300">{t("dragDropPhotos")}</p>
            <p className="text-sm text-gray-500">{t("or")}</p>
            <label htmlFor="photo-upload" className="mt-3 cursor-pointer px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition">
              {t("browsePhotos")}
            </label>
            <input
              id="photo-upload"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="w-full md:w-2/3 flex flex-col bg-[#282828] rounded-xl p-4 md:p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">{t("uploadQueue")} ({files.length})</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mb-4">
            {files.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">{t("selectPhotosToBegin")}</div>
            ) : (
              files.map((entry) => (
                <div key={entry.id} className="bg-[#1f1f1f] border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-[#111] flex items-center justify-center flex-shrink-0">
                      <Image src="/file-image.svg" alt="" width={28} height={28} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{entry.file.name}</div>
                      <div className="text-xs text-gray-400">{formatSize(entry.file.size)}</div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        entry.status === "success"
                          ? "bg-green-900/50 text-green-200"
                          : entry.status === "error"
                            ? "bg-red-900/50 text-red-200"
                            : entry.status === "uploading"
                              ? "bg-blue-900/50 text-blue-200"
                              : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {entry.status}
                    </span>
                    {!isUploading && (
                      <button onClick={() => removeFile(entry.id)} className="p-1 rounded hover:bg-gray-700">
                        <Image src="/icons/close.svg" alt="" width={16} height={16} className="invert" />
                      </button>
                    )}
                  </div>
                  {entry.status === "uploading" && (
                    <div className="mt-3 h-2 rounded-full bg-gray-700 overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${entry.progress}%` }} />
                    </div>
                  )}
                  {entry.error && <div className="mt-2 text-xs text-red-300">{entry.error}</div>}
                </div>
              ))
            )}
          </div>

          <div className="flex-shrink-0 pt-4 border-t border-gray-700 flex justify-end gap-3">
            <LoadingButton
              onClick={startUpload}
              isLoading={isUploading}
              loadingText={t("uploading")}
              disabled={pendingCount === 0}
              className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {t("uploadPhotosAction", { count: pendingCount })}
            </LoadingButton>
            <button onClick={onClose} disabled={isUploading} className="px-5 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition disabled:opacity-60">
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
