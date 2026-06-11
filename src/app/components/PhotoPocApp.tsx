"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lang, Theme } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import type { AnalysisStatus, Breadcrumb, FolderItem } from "@/types/poc";
import { LoadingButton } from "./LoadingButton";
import { PhotoModal } from "./PhotoModal";
import { Spinner } from "./Spinner";
import { UploadModal } from "./UploadModal";
import { useToast } from "./ToastProvider";
import { AdvancedSearch } from "./AdvancedSearch";

interface FoldersResponse {
  contents: FolderItem[];
  breadcrumbs: Breadcrumb[];
}

interface PromptState {
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}

function getStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("lang") === "ar" ? "ar" : "en";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem("theme") === "dark" ? "dark" : "light";
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with HTTP ${response.status}`);
  }

  return data as T;
}

function statusBadgeClass(status: AnalysisStatus | undefined) {
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

function PromptModal({ prompt, onClose }: { prompt: PromptState; onClose: () => void }) {
  const [value, setValue] = useState(prompt.initialValue);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    setIsSaving(true);
    try {
      await prompt.onSubmit(value.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="bg-white dark:bg-[#333] rounded-lg p-6 max-w-sm w-full shadow-xl border border-gray-200 dark:border-gray-600">
        <h3 className="text-lg font-bold dark:text-white mb-4">{prompt.title}</h3>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">{prompt.label}</label>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-600">
            Cancel
          </button>
          <LoadingButton
            type="submit"
            isLoading={isSaving}
            loadingText="Saving..."
            disabled={!value.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-500"
          >
            {prompt.submitLabel}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

function ConfirmModal({ confirm, onClose }: { confirm: ConfirmState; onClose: () => void }) {
  const [isWorking, setIsWorking] = useState(false);

  const submit = async () => {
    setIsWorking(true);
    try {
      await confirm.onConfirm();
      onClose();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-[#333] rounded-lg p-6 max-w-md w-full shadow-xl border border-gray-200 dark:border-gray-600">
        <div className="flex items-center gap-3 mb-4 text-red-600">
          <Image src="/icons/trash.svg" alt="" width={28} height={28} className="dark:invert" />
          <h3 className="text-lg font-bold dark:text-white">{confirm.title}</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{confirm.message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded dark:text-gray-300 dark:hover:bg-gray-600">
            Cancel
          </button>
          <LoadingButton
            onClick={submit}
            isLoading={isWorking}
            loadingText="Deleting..."
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            {confirm.confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export function PhotoPocApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [contents, setContents] = useState<FolderItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  
  // ── Search State ──
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPersons, setSelectedPersons] = useState<{ id: string; name: string }[]>([]);
  const [personCondition, setPersonCondition] = useState<"any" | "all">("any");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { showToast } = useToast();
  const t = useCallback((key: string, replacements?: Record<string, string | number>) => translate(lang, key, replacements), [lang]);

  useEffect(() => {
    setLang(getStoredLang());
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = "ltr";
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const loadContents = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (options.quiet) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (currentFolderId) params.set("parent_id", currentFolderId);
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (selectedPersons.length > 0) {
          params.set("personIds", selectedPersons.map((p) => p.id).join(","));
          params.set("personCondition", personCondition);
        }
        if (selectedTags.length > 0) {
          params.set("tags", selectedTags.join(","));
        }

        const data = await requestJson<FoldersResponse>(`/api/folders?${params.toString()}`, { cache: "no-store" });
        setContents(data.contents);
        setBreadcrumbs(data.breadcrumbs || []);
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), "error");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentFolderId, searchTerm, selectedPersons, personCondition, selectedTags, showToast],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadContents();
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [loadContents]);

  useEffect(() => {
    const hasBusyPhotos = contents.some((item) => item.type === "file" && ["pending", "queued", "running"].includes(item.analysis_status || ""));
    if (!hasBusyPhotos) return;
    const interval = window.setInterval(() => void loadContents({ quiet: true }), 2500);
    return () => window.clearInterval(interval);
  }, [contents, loadContents]);

  const displayBreadcrumbs = useMemo(() => [{ id: null, name: t("home") }, ...breadcrumbs], [breadcrumbs, t]);
  const currentFolderName = displayBreadcrumbs[displayBreadcrumbs.length - 1]?.name || t("home");
  const folderCount = contents.filter((item) => item.type === "folder").length;
  const photoCount = contents.filter((item) => item.type === "file").length;

  const createFolder = () => {
    setPrompt({
      title: "Create Folder",
      label: t("folderName"),
      initialValue: "",
      submitLabel: t("create"),
      onSubmit: async (name) => {
        await requestJson("/api/folders", {
          method: "POST",
          body: JSON.stringify({ name, parent_id: currentFolderId }),
        });
        showToast(t("folderCreated"), "success");
        await loadContents({ quiet: true });
      },
    });
  };

  const renameItem = (item: FolderItem) => {
    setPrompt({
      title: item.type === "folder" ? t("renameFolder") : t("renamePhoto"),
      label: t("name"),
      initialValue: item.name,
      submitLabel: t("save"),
      onSubmit: async (name) => {
        const endpoint = item.type === "folder" ? `/api/folders/${item.id}` : `/api/photos/${item.id}`;
        await requestJson(endpoint, {
          method: "PUT",
          body: JSON.stringify({ name }),
        });
        showToast(t("nameUpdated"), "success");
        await loadContents({ quiet: true });
      },
    });
  };

  const deleteItem = (item: FolderItem) => {
    setConfirm({
      title: item.type === "folder" ? t("deleteFolder") : t("deletePhoto"),
      message:
        item.type === "folder"
          ? t("deleteFolderMessage", { name: item.name })
          : t("deletePhotoMessage", { name: item.name }),
      confirmLabel: t("delete"),
      onConfirm: async () => {
        const endpoint = item.type === "folder" ? `/api/folders/${item.id}` : `/api/photos/${item.id}`;
        await requestJson(endpoint, { method: "DELETE" });
        showToast(t("deleted"), "success");
        await loadContents({ quiet: true });
      },
    });
  };

  const navigateToCrumb = (crumb: Breadcrumb) => {
    setSearchTerm("");
    setCurrentFolderId(crumb.id);
  };

  const openItem = (item: FolderItem) => {
    if (item.type === "folder") {
      setSearchTerm("");
      setCurrentFolderId(item.id);
    } else {
      setSelectedPhotoId(item.id);
    }
  };

  return (
    <div className="flex flex-col h-screen min-h-screen bg-gray-100 dark:bg-[#1f1f1f] text-gray-900 dark:text-gray-100">
      <header className="bg-white dark:bg-[#212121] border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/smart-edms.svg" alt="" width={34} height={34} />
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">{t("appTitle")}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t("appSubtitle")}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-1 max-w-4xl">
          <div className="relative flex-1 hidden sm:flex items-center gap-2">
            <div className="relative flex-1">
              <Image src="/search-icon.svg" alt="" width={18} height={18} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("searchEverything")}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-[#121212] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            
            <div className="relative">
              <button
                onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition ${
                  isAdvancedSearchOpen || selectedPersons.length > 0 || selectedTags.length > 0
                    ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#121212] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span className="hidden lg:inline">{t("filters")}</span>
                {(selectedPersons.length > 0 || selectedTags.length > 0) && (
                  <span className="ml-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {selectedPersons.length + selectedTags.length}
                  </span>
                )}
              </button>

              <AdvancedSearch
                selectedPersons={selectedPersons}
                setSelectedPersons={setSelectedPersons}
                personCondition={personCondition}
                setPersonCondition={setPersonCondition}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                isOpen={isAdvancedSearchOpen}
                onClose={() => setIsAdvancedSearchOpen(false)}
                t={t}
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] p-1">
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${lang === "en" ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              title={t("english")}
            >
              EN
            </button>
            <button
              onClick={() => setLang("ar")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${lang === "ar" ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              title={t("arabic")}
            >
              AR
            </button>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title={theme === "dark" ? t("switchToLight") : t("switchToDark")}
          >
            <Image src={theme === "dark" ? "/sun.svg" : "/moon.svg"} alt="" width={18} height={18} className="dark:invert" />
          </button>
          <button onClick={() => setUploadOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm font-medium">
            <Image src="/upload.svg" alt="" width={18} height={18} className="dark:invert" />
            {t("upload")}
          </button>
          <button onClick={createFolder} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
            <Image src="/icons/plus.svg" alt="" width={18} height={18} className="invert" />
            {t("folder")}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center flex-wrap gap-2 text-sm min-w-0">
                {displayBreadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.id || "root"}-${index}`} className="flex items-center gap-2">
                    {index > 0 && <Image src="/icons/chevron-right.svg" alt="" width={14} height={14} className="dark:invert opacity-50" />}
                    <button
                      onClick={() => navigateToCrumb(crumb)}
                      className={`hover:underline truncate max-w-[180px] ${
                        index === displayBreadcrumbs.length - 1 ? "font-semibold text-gray-900 dark:text-white" : "text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>
              <button onClick={() => loadContents({ quiet: true })} className="sm:ml-auto flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <Image src="/icons/refresh.svg" alt="" width={16} height={16} className={`dark:invert ${isRefreshing ? "animate-spin" : ""}`} />
                {t("refresh")}
              </button>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] p-1">
                <button
                  onClick={() => setLang("en")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${lang === "en" ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLang("ar")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${lang === "ar" ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
                >
                  AR
                </button>
              </div>
            </div>

            <div className="sm:hidden relative">
              <Image src="/search-icon.svg" alt="" width={18} height={18} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("searchThisFolder")}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-[#121212] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">{folderCount} {t("folders")}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">{photoCount} {t("photos")}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {isLoading ? (
              <Spinner label={t("loading")} />
            ) : contents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Image src="/folder-icon.svg" alt="" width={64} height={64} className="opacity-50" />
                <p className="mt-4 text-sm">{searchTerm ? t("noMatchingItems") : t("emptyFolder")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {contents.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => openItem(item)}
                    className="group relative flex flex-col items-center p-4 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:bg-gray-50 hover:border-gray-200 hover:shadow-sm dark:hover:bg-[#2c2c2c] dark:hover:border-gray-700 min-h-44"
                  >
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          renameItem(item);
                        }}
                        className="p-1.5 rounded-md bg-white/95 dark:bg-gray-800/95 shadow hover:bg-blue-50 dark:hover:bg-gray-700"
                        title="Rename"
                      >
                        <Image src="/icons/rename.svg" alt="" width={14} height={14} className="dark:invert" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteItem(item);
                        }}
                        className="p-1.5 rounded-md bg-white/95 dark:bg-gray-800/95 shadow hover:bg-red-50 dark:hover:bg-red-900/30"
                        title="Delete"
                      >
                        <Image src="/icons/trash.svg" alt="" width={14} height={14} className="dark:invert" />
                      </button>
                    </div>

                    {item.type === "folder" ? (
                      <>
                        <div className="mb-3 transform group-hover:scale-105 transition-transform text-gray-400 group-hover:text-blue-500">
                          <Image src="/folder-icon.svg" alt="" width={72} height={72} />
                        </div>
                        <span className="text-sm font-medium text-center text-gray-700 dark:text-gray-300 break-words w-full line-clamp-2 px-1">{item.name}</span>
                        <span className="mt-1 text-xs text-gray-400">{item.count || 0} items</span>
                      </>
                    ) : (
                      <>
                        <div className="relative mb-3 w-full aspect-[4/3] min-h-32 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm">
                          {item.thumbnail_url ? (
                            <Image src={item.thumbnail_url} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <Image src="/file-image.svg" alt="" width={48} height={48} className="m-auto mt-4" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-center text-gray-700 dark:text-gray-300 break-words w-full line-clamp-2 px-1">{item.name}</span>
                        <span className={`mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass(item.analysis_status)}`}>
                          {t(item.analysis_status || "pending")}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {uploadOpen && (
        <UploadModal
          parentId={currentFolderId}
          parentName={currentFolderName}
          lang={lang}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => void loadContents({ quiet: true })}
        />
      )}
      {selectedPhotoId && <PhotoModal photoId={selectedPhotoId} lang={lang} onClose={() => setSelectedPhotoId(null)} onChanged={() => void loadContents({ quiet: true })} />}
      {prompt && (
        <PromptModal
          prompt={prompt}
          onClose={() => {
            setPrompt(null);
          }}
        />
      )}
      {confirm && (
        <ConfirmModal
          confirm={confirm}
          onClose={() => {
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
