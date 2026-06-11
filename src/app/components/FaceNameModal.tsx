"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { FaceDetection, Person } from "@/types/poc";
import { LoadingButton } from "./LoadingButton";

interface FaceNameModalProps {
  face: FaceDetection;
  photoId: string;
  onClose: () => void;
  onSave: (person: Person) => void;
  isLoading?: boolean;
}

export function FaceNameModal({ face, photoId, onClose, onSave, isLoading = false }: FaceNameModalProps) {
  const [name, setName] = useState(face.name || "");
  const [persons, setPersons] = useState<Person[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  useEffect(() => {
    setName(face.name || "");
    setSelectedPerson(null);
    setSearchText("");
  }, [face]);

  const loadPersons = useCallback(
    async (search: string) => {
      setLoadingPersons(true);
      try {
        const params = new URLSearchParams({ pageSize: "10" });
        if (search) params.append("search", search);
        const response = await fetch(`/api/persons?${params}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok) {
          setPersons(data.persons || []);
        }
      } catch (error) {
        console.error("Failed to load persons:", error);
      } finally {
        setLoadingPersons(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPersons("");
  }, [loadPersons]);

  const handleSearch = (text: string) => {
    setSearchText(text);
    setSelectedPerson(null);
    void loadPersons(text);
  };

  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person);
    setName(person.name);
    setSearchText("");
  };

  const handleSave = useCallback(async () => {
    const finalName = name.trim();
    if (!finalName) {
      alert("Please enter a name for the face.");
      return;
    }

    try {
      // Generate a simple encoding if not provided (hash of location and index)
      const encoding = face.encoding || 
        btoa(JSON.stringify({ index: face.index, location: face.location }));

      const response = await fetch(`/api/photos/${photoId}/faces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          face: {
            ...face,
            name: finalName,
            encoding,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save face");
      }

      const result = await response.json();
      onSave(result.person);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save face");
    }
  }, [name, face, photoId, onSave, onClose]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && !isLoading && !loadingPersons) {
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isLoading, loadingPersons, handleSave]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#282828] text-gray-900 dark:text-gray-100 rounded-xl w-full max-w-md shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h2 className="text-lg font-bold">{face.name ? "Update Face Name" : "Name This Face"}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <Image src="/icons/close.svg" alt="" width={20} height={20} className="dark:invert" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(face.thumbnailB64 || face.thumbnail_b64) && (
            <div className="flex justify-center mb-6">
              <div className="relative w-32 h-32 rounded-lg overflow-hidden border-4 border-gray-200 dark:border-gray-700 shadow-lg">
                <Image
                  src={`data:image/jpeg;base64,${face.thumbnailB64 || face.thumbnail_b64}`}
                  alt="Face to name"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-semibold">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter person's name"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {name && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Suggestions</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search existing persons..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {loadingPersons ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">Loading...</div>
              ) : persons.length > 0 ? (
                <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                  {persons.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => handleSelectPerson(person)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                        selectedPerson?.id === person.id ? "bg-blue-100 dark:bg-blue-900/30" : ""
                      }`}
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              ) : searchText ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">No matches found</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            Cancel
          </button>
          <LoadingButton
            onClick={handleSave}
            isLoading={isLoading}
            loadingText={face.name ? "Updating..." : "Saving..."}
            disabled={!name.trim() || isLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {face.name ? "Update Face" : "Save Face"}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
