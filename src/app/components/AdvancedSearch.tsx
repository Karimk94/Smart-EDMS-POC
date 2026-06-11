"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PersonOption {
  id: string;
  name: string;
}

interface AdvancedSearchProps {
  selectedPersons: PersonOption[];
  setSelectedPersons: (persons: PersonOption[]) => void;
  personCondition: "any" | "all";
  setPersonCondition: (cond: "any" | "all") => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

export function AdvancedSearch({
  selectedPersons,
  setSelectedPersons,
  personCondition,
  setPersonCondition,
  selectedTags,
  setSelectedTags,
  isOpen,
  onClose,
  t,
}: AdvancedSearchProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Person search state ──
  const [personSearch, setPersonSearch] = useState("");
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [isLoadingPersons, setIsLoadingPersons] = useState(false);
  const [isPersonDropdownOpen, setIsPersonDropdownOpen] = useState(false);

  // ── Tag state ──
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  // ── Close on outside click ──
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  // ── Fetch persons with faces ──
  const fetchPersons = useCallback(async (search = "") => {
    setIsLoadingPersons(true);
    try {
      const params = new URLSearchParams({ withFaces: "true", pageSize: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/persons?${params}`);
      const data = await res.json();
      setPersons(
        (data.persons || []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        }))
      );
    } catch {
      setPersons([]);
    } finally {
      setIsLoadingPersons(false);
    }
  }, []);

  // ── Fetch tags ──
  const fetchTags = useCallback(async () => {
    setIsLoadingTags(true);
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch {
      setAllTags([]);
    } finally {
      setIsLoadingTags(false);
    }
  }, []);

  // ── Load data when panel opens ──
  useEffect(() => {
    if (isOpen) {
      void fetchPersons();
      void fetchTags();
    }
  }, [isOpen, fetchPersons, fetchTags]);

  // ── Debounced person search ──
  useEffect(() => {
    if (!isOpen || !isPersonDropdownOpen) return;
    const timer = setTimeout(() => void fetchPersons(personSearch), 300);
    return () => clearTimeout(timer);
  }, [personSearch, isOpen, isPersonDropdownOpen, fetchPersons]);

  // ── Filtered & sorted tags ──
  const filteredTags = useMemo(() => {
    const filtered = tagSearch
      ? allTags.filter((tag) => tag.toLowerCase().includes(tagSearch.toLowerCase()))
      : allTags;
    const selectedSet = new Set(selectedTags);
    return [...filtered].sort((a, b) => {
      const aS = selectedSet.has(a);
      const bS = selectedSet.has(b);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      return a.localeCompare(b);
    });
  }, [allTags, tagSearch, selectedTags]);

  const togglePerson = (person: PersonOption) => {
    const exists = selectedPersons.some((p) => p.id === person.id);
    if (exists) {
      setSelectedPersons(selectedPersons.filter((p) => p.id !== person.id));
    } else {
      setSelectedPersons([...selectedPersons, person]);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const clearAll = () => {
    setSelectedPersons([]);
    setSelectedTags([]);
    setPersonCondition("any");
  };

  const hasAnyFilter = selectedPersons.length > 0 || selectedTags.length > 0;

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 sm:left-auto mt-2 bg-white dark:bg-[#282828] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
      style={{ width: "450px", maxWidth: "90vw" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f]">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {t("advancedSearch")}
        </h3>
        <div className="flex items-center gap-2">
          {hasAnyFilter && (
            <button
              onClick={clearAll}
              className="text-xs text-red-500 hover:text-red-400 font-semibold transition"
            >
              {t("clearFilters")}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <Image src="/icons/close.svg" alt="" width={16} height={16} className="dark:invert" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-h-[480px] overflow-y-auto">
        {/* ── Person / Face Filter ── */}
        <section className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("person")}
          </label>

          {/* Selected persons chips */}
          {selectedPersons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedPersons.map((person) => (
                <span
                  key={person.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 text-xs font-semibold"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  {person.name}
                  <button
                    onClick={() => togglePerson(person)}
                    className="ml-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 w-4 h-4 flex items-center justify-center transition"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Person condition toggle */}
          {selectedPersons.length > 1 && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 mb-2">
              <button
                onClick={() => setPersonCondition("any")}
                className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${
                  personCondition === "any"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {t("anyOr")}
              </button>
              <button
                onClick={() => setPersonCondition("all")}
                className={`flex-1 px-3 py-1.5 text-xs font-semibold transition ${
                  personCondition === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {t("allAnd")}
              </button>
            </div>
          )}

          {/* Person search dropdown */}
          <div className="relative">
            <input
              type="text"
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              onFocus={() => setIsPersonDropdownOpen(true)}
              placeholder={t("searchForPerson")}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-[#121212] text-sm text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
            {isPersonDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                {isLoadingPersons ? (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center">
                    <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                    Loading...
                  </div>
                ) : persons.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center italic">{t("noPersonsAvailable")}</div>
                ) : (
                  persons.map((person) => {
                    const isSelected = selectedPersons.some((p) => p.id === person.id);
                    return (
                      <button
                        key={person.id}
                        onClick={() => {
                          togglePerson(person);
                          setPersonSearch("");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate">{person.name}</span>
                        {isSelected && (
                          <svg className="w-4 h-4 ml-auto text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })
                )}
                {/* Close button at bottom */}
                <button
                  onClick={() => setIsPersonDropdownOpen(false)}
                  className="w-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-700 transition"
                >
                  {t("close")}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Divider ── */}
        <hr className="border-gray-100 dark:border-gray-700" />

        {/* ── Tag Filter ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("tags")}
            </label>
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-xs text-red-500 hover:text-red-400 font-semibold transition"
              >
                {t("clearAllTags")}
              </button>
            )}
          </div>

          <input
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder={t("searchTags")}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-[#121212] text-sm text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          />

          {isLoadingTags ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              {t("loadingTags")}
            </div>
          ) : filteredTags.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-2">
              {tagSearch ? t("noTagsMatch") : t("noTagsAvailable")}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1.5 content-start py-1">
              {filteredTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    selectedTags.includes(tag)
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f] flex justify-end">
        <button
          onClick={onClose}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}
