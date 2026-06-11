import { existsSync, unlinkSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DatabaseSync } from "node:sqlite";
import { dbPath, ensureDataDirs, uploadsDir } from "./paths";
import type { AnalysisResult, AnalysisStatus, Breadcrumb, FolderItem, PhotoDetails, PhotoRecord } from "@/types/poc";

type Row = Record<string, unknown>;

let database: DatabaseSync | null = null;

function nowIso() {
  return new Date().toISOString();
}

function getDb() {
  if (database) return database;

  ensureDataDirs();
  database = new DatabaseSync(dbPath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      folder_id TEXT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      title TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      analysis_json TEXT NULL,
      analysis_started_at TEXT NULL,
      analysis_completed_at TEXT NULL,
      analysis_error TEXT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faces (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      encoding TEXT NOT NULL,
      photo_id TEXT NULL,
      location_json TEXT NOT NULL,
      thumbnail_b64 TEXT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);
    CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(analysis_status);
    CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id);
    CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);
  `);
  return database;
}

function normalizeParentId(parentId: string | null | undefined) {
  if (!parentId || parentId === "null" || parentId === "undefined") return null;
  return parentId;
}

function folderWhere(parentId: string | null, alias = "") {
  const column = `${alias ? `${alias}.` : ""}parent_id`;
  return parentId === null ? `${column} IS NULL` : `${column} = ?`;
}

function folderArgs(parentId: string | null) {
  return parentId === null ? [] : [parentId];
}

function rowToPhoto(row: Row): PhotoRecord {
  return {
    id: String(row.id),
    folder_id: row.folder_id === null ? null : String(row.folder_id),
    original_name: String(row.original_name),
    stored_name: String(row.stored_name),
    mime_type: String(row.mime_type),
    size: Number(row.size),
    title: String(row.title),
    uploaded_at: String(row.uploaded_at),
    analysis_status: String(row.analysis_status) as AnalysisStatus,
    analysis_json: row.analysis_json === null ? null : String(row.analysis_json),
    analysis_started_at: row.analysis_started_at === null ? null : String(row.analysis_started_at),
    analysis_completed_at: row.analysis_completed_at === null ? null : String(row.analysis_completed_at),
    analysis_error: row.analysis_error === null ? null : String(row.analysis_error),
  };
}

function parseAnalysis(raw: string | null): AnalysisResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnalysisResult;
  } catch {
    return null;
  }
}

function photoToDetails(photo: PhotoRecord): PhotoDetails {
  const rest = {
    id: photo.id,
    folder_id: photo.folder_id,
    original_name: photo.original_name,
    stored_name: photo.stored_name,
    mime_type: photo.mime_type,
    size: photo.size,
    title: photo.title,
    uploaded_at: photo.uploaded_at,
    analysis_status: photo.analysis_status,
    analysis_started_at: photo.analysis_started_at,
    analysis_completed_at: photo.analysis_completed_at,
    analysis_error: photo.analysis_error,
  };
  return {
    ...rest,
    file_url: `/api/photos/${photo.id}/file`,
    analysis: parseAnalysis(photo.analysis_json),
  };
}

function getDirectChildCount(folderId: string) {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM folders WHERE parent_id = ?) +
        (SELECT COUNT(*) FROM photos WHERE folder_id = ?) AS total
    `)
    .get(folderId, folderId) as Row | undefined;

  return Number(row?.total ?? 0);
}

export function getBreadcrumbs(folderId: string | null | undefined): Breadcrumb[] {
  const db = getDb();
  const crumbs: Breadcrumb[] = [];
  let currentId = normalizeParentId(folderId);
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const row = db.prepare("SELECT id, name, parent_id FROM folders WHERE id = ?").get(currentId) as Row | undefined;
    if (!row) break;
    crumbs.unshift({
      id: String(row.id),
      name: String(row.name),
    });
    currentId = row.parent_id === null ? null : String(row.parent_id);
  }

  return crumbs;
}

export interface SearchFilters {
  search?: string;
  selectedPersonIds?: string[];
  personCondition?: "any" | "all";
  selectedTags?: string[];
}

export function listFolderContents(
  parentIdInput: string | null | undefined,
  searchInput: string | null | undefined,
  filters?: SearchFilters,
) {
  const db = getDb();
  const parentId = normalizeParentId(parentIdInput);
  const search = (filters?.search || searchInput || "").trim();
  const searchTokens = search ? search.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const hasTextSearch = searchTokens.length > 0;
  const hasPersonFilter = (filters?.selectedPersonIds?.length ?? 0) > 0;
  const hasTagFilter = (filters?.selectedTags?.length ?? 0) > 0;
  const hasAdvancedFilters = hasPersonFilter || hasTagFilter;

  // ── Folders: only text-search by name (no analysis data on folders) ──
  const folderWhereCond = folderWhere(parentId);
  const folderBaseArgs = folderArgs(parentId);
  const folderSearchClause = hasTextSearch ? " AND LOWER(name) LIKE LOWER(?)" : "";
  const folderSearchArgs = hasTextSearch ? [`%${searchTokens.join("%")}%`] : [];

  // When advanced filters are active, hide folders (they don't have tags/faces)
  const folderRows = hasAdvancedFilters
    ? []
    : (db
        .prepare(`SELECT id, name, parent_id FROM folders WHERE ${folderWhereCond}${folderSearchClause} ORDER BY LOWER(name) ASC`)
        .all(...folderBaseArgs, ...folderSearchArgs) as Row[]);

  // ── Photos: search across title, caption, tags, and face names ──
  const photoWhere = parentId === null ? "p.folder_id IS NULL" : "p.folder_id = ?";
  const photoBaseArgs: (string | number | null)[] = parentId === null ? [] : [parentId];
  const conditions: string[] = [photoWhere];
  const params: (string | number | null)[] = [...photoBaseArgs];

  // Text search: build a combined searchable string and check each token
  if (hasTextSearch) {
    // Use a CTE to build a searchable text blob for each photo:
    //   title + caption + objects + face names
    for (const token of searchTokens) {
      const likeVal = `%${token}%`;
      conditions.push(`(
        LOWER(p.title) LIKE LOWER(?) OR
        LOWER(COALESCE(json_extract(p.analysis_json, '$.caption'), '')) LIKE LOWER(?) OR
        LOWER(COALESCE(p.analysis_json, '')) LIKE LOWER(?) OR
        EXISTS (
          SELECT 1 FROM faces f2
          JOIN persons pr2 ON pr2.id = f2.person_id
          WHERE f2.photo_id = p.id AND LOWER(pr2.name) LIKE LOWER(?)
        )
      )`);
      params.push(likeVal, likeVal, likeVal, likeVal);
    }
  }

  // Person filter: photos that have faces linked to selected person IDs
  if (hasPersonFilter) {
    const personIds = filters!.selectedPersonIds!;
    const condition = filters?.personCondition || "any";

    if (condition === "all") {
      // Photo must have faces for ALL selected persons
      for (const pid of personIds) {
        conditions.push(`EXISTS (SELECT 1 FROM faces f3 WHERE f3.photo_id = p.id AND f3.person_id = ?)`);
        params.push(pid);
      }
    } else {
      // Photo must have a face for ANY of the selected persons
      const placeholders = personIds.map(() => "?").join(",");
      conditions.push(`EXISTS (SELECT 1 FROM faces f3 WHERE f3.photo_id = p.id AND f3.person_id IN (${placeholders}))`);
      params.push(...personIds);
    }
  }

  // Tag filter: photos whose analysis_json objects array contains selected tags
  if (hasTagFilter) {
    const tags = filters!.selectedTags!;
    for (const tag of tags) {
      // Check if the tag exists in the objects JSON array
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(COALESCE(json_extract(p.analysis_json, '$.objects'), '[]')) je
        WHERE LOWER(je.value) = LOWER(?)
      )`);
      params.push(tag);
    }
  }

  const whereClause = conditions.join(" AND ");

  const photoRows = db
    .prepare(`
      SELECT p.id, p.title, p.folder_id, p.analysis_status
      FROM photos p
      WHERE ${whereClause}
      ORDER BY LOWER(p.title) ASC
    `)
    .all(...params) as Row[];

  const contents: FolderItem[] = [
    ...folderRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: "folder" as const,
      parent_id: row.parent_id === null ? null : String(row.parent_id),
      media_type: "folder" as const,
      count: getDirectChildCount(String(row.id)),
    })),
    ...photoRows.map((row) => ({
      id: String(row.id),
      name: String(row.title),
      type: "file" as const,
      parent_id: row.folder_id === null ? null : String(row.folder_id),
      media_type: "image" as const,
      thumbnail_url: `/api/photos/${String(row.id)}/file`,
      analysis_status: String(row.analysis_status) as AnalysisStatus,
    })),
  ];

  return {
    contents,
    breadcrumbs: getBreadcrumbs(parentId),
  };
}

export function createFolder(nameInput: string, parentIdInput?: string | null) {
  const db = getDb();
  const name = nameInput.trim();
  if (!name) throw new Error("Folder name is required.");

  const id = randomUUID();
  const parentId = normalizeParentId(parentIdInput);
  const timestamp = nowIso();

  db.prepare("INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name,
    parentId,
    timestamp,
    timestamp,
  );

  return { id, name, parent_id: parentId };
}

export function renameFolder(id: string, nameInput: string) {
  const db = getDb();
  const name = nameInput.trim();
  if (!name) throw new Error("Folder name is required.");

  const result = db.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?").run(name, nowIso(), id);
  if (result.changes === 0) throw new Error("Folder not found.");
  return { id, name };
}

export function deleteFolderRecursive(id: string) {
  const db = getDb();
  const photoRows = db
    .prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT folders.id FROM folders JOIN descendants ON folders.parent_id = descendants.id
      )
      SELECT stored_name FROM photos WHERE folder_id IN (SELECT id FROM descendants)
    `)
    .all(id) as Row[];

  const result = db
    .prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT folders.id FROM folders JOIN descendants ON folders.parent_id = descendants.id
      )
      DELETE FROM folders WHERE id IN (SELECT id FROM descendants)
    `)
    .run(id);

  if (result.changes === 0) throw new Error("Folder not found.");

  photoRows.forEach((row) => deleteUploadByStoredName(String(row.stored_name)));
  return { id, deleted_files: photoRows.length };
}

export function createPhoto(input: {
  folderId?: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  title?: string;
}) {
  const db = getDb();
  const id = randomUUID();
  const folderId = normalizeParentId(input.folderId);
  const title = (input.title || path.parse(input.originalName).name || input.originalName).trim();
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO photos (
      id, folder_id, original_name, stored_name, mime_type, size, title,
      uploaded_at, analysis_status, analysis_json, analysis_started_at, analysis_completed_at, analysis_error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL)
  `).run(id, folderId, input.originalName, input.storedName, input.mimeType, input.size, title, timestamp);

  return getPhoto(id)!;
}

export function getPhoto(id: string) {
  const row = getDb().prepare("SELECT * FROM photos WHERE id = ?").get(id) as Row | undefined;
  return row ? rowToPhoto(row) : null;
}

export function getPhotoDetails(id: string) {
  const photo = getPhoto(id);
  return photo ? photoToDetails(photo) : null;
}

export function renamePhoto(id: string, titleInput: string) {
  const title = titleInput.trim();
  if (!title) throw new Error("Photo name is required.");

  const result = getDb().prepare("UPDATE photos SET title = ? WHERE id = ?").run(title, id);
  if (result.changes === 0) throw new Error("Photo not found.");
  return getPhotoDetails(id)!;
}

export function deletePhoto(id: string) {
  const photo = getPhoto(id);
  if (!photo) throw new Error("Photo not found.");

  getDb().prepare("DELETE FROM photos WHERE id = ?").run(id);
  deleteUploadByStoredName(photo.stored_name);
  return { id };
}

export function setPhotoAnalysisStatus(
  id: string,
  status: AnalysisStatus,
  options: { clearResult?: boolean; error?: string | null } = {},
) {
  const timestamp = nowIso();

  if (options.clearResult) {
    getDb()
      .prepare(`
        UPDATE photos
        SET analysis_status = ?, analysis_json = NULL, analysis_started_at = ?, analysis_completed_at = NULL, analysis_error = ?
        WHERE id = ?
      `)
      .run(status, status === "running" ? timestamp : null, options.error ?? null, id);
    return;
  }

  getDb()
    .prepare(`
      UPDATE photos
      SET analysis_status = ?,
          analysis_started_at = CASE WHEN ? = 'running' THEN ? ELSE analysis_started_at END,
          analysis_error = ?
      WHERE id = ?
    `)
    .run(status, status, timestamp, options.error ?? null, id);
}

export function savePhotoAnalysis(id: string, status: AnalysisStatus, analysis: AnalysisResult, error?: string | null) {
  getDb()
    .prepare(`
      UPDATE photos
      SET analysis_status = ?, analysis_json = ?, analysis_completed_at = ?, analysis_error = ?
      WHERE id = ?
    `)
    .run(status, JSON.stringify(analysis), nowIso(), error ?? null, id);
}

export function getUploadPath(photo: Pick<PhotoRecord, "stored_name">) {
  ensureDataDirs();
  return path.join(uploadsDir, photo.stored_name);
}

export function deleteUploadByStoredName(storedName: string) {
  const uploadPath = path.join(uploadsDir, storedName);
  if (existsSync(uploadPath)) unlinkSync(uploadPath);
}

// Person management functions
export function createPerson(name: string) {
  const db = getDb();
  const id = randomUUID();
  const timestamp = nowIso();

  db.prepare("INSERT INTO persons (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
    id,
    name.trim(),
    timestamp,
    timestamp,
  );

  return { id, name: name.trim(), created_at: timestamp };
}

export function getOrCreatePerson(name: string) {
  const db = getDb();
  const trimmedName = name.trim();

  // Check if person already exists
  const existing = db.prepare("SELECT id FROM persons WHERE LOWER(name) = LOWER(?)").get(trimmedName) as Row | undefined;
  if (existing) {
    return { id: String(existing.id), name: trimmedName, isNew: false };
  }

  // Create new person
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare("INSERT INTO persons (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
    id,
    trimmedName,
    timestamp,
    timestamp,
  );

  return { id, name: trimmedName, isNew: true };
}

export function listPersons(search?: string, limit = 50, offset = 0) {
  const db = getDb();
  const whereClause = search ? "WHERE LOWER(name) LIKE LOWER(?)" : "";
  const params = search ? [`%${search}%`, limit, offset] : [limit, offset];

  const rows = db
    .prepare(`SELECT id, name, created_at, updated_at FROM persons ${whereClause} ORDER BY LOWER(name) ASC LIMIT ? OFFSET ?`)
    .all(...params) as Row[];

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM persons ${whereClause}`).get(...(search ? [search] : [])) as Row
  ).count;

  return {
    persons: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    })),
    total: Number(total),
    limit,
    offset,
  };
}

// Face management functions
export interface FaceData {
  id: string;
  person_id: string;
  encoding: string;
  photo_id: string | null;
  location_json: string;
  thumbnail_b64: string | null;
  created_at: string;
}

export function saveFace(input: {
  personId: string;
  encoding: string;
  photoId?: string | null;
  location: { top: number; left: number; right: number; bottom: number };
  thumbnailB64?: string | null;
}): FaceData {
  const db = getDb();
  const id = randomUUID();
  const timestamp = nowIso();
  const photoId = input.photoId ?? null;

  db.prepare(`
    INSERT INTO faces (id, person_id, encoding, photo_id, location_json, thumbnail_b64, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.personId, input.encoding, photoId, JSON.stringify(input.location), input.thumbnailB64 ?? null, timestamp);

  return {
    id,
    person_id: input.personId,
    encoding: input.encoding,
    photo_id: photoId,
    location_json: JSON.stringify(input.location),
    thumbnail_b64: input.thumbnailB64 ?? null,
    created_at: timestamp,
  };
}

export function getFacesByPerson(personId: string) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM faces WHERE person_id = ? ORDER BY created_at DESC").all(personId) as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    person_id: String(row.person_id),
    encoding: String(row.encoding),
    photo_id: row.photo_id === null ? null : String(row.photo_id),
    location_json: String(row.location_json),
    thumbnail_b64: row.thumbnail_b64 === null ? null : String(row.thumbnail_b64),
    created_at: String(row.created_at),
  }));
}

export function updatePhotoAnalysisFields(
  id: string,
  fields: { caption?: string; ocrText?: string; objects?: string[] },
) {
  const db = getDb();
  const row = db.prepare("SELECT analysis_json FROM photos WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Photo not found.");

  const existing = parseAnalysis(row.analysis_json as string | null) ?? ({} as AnalysisResult);
  const updated: AnalysisResult = {
    ...existing,
    caption: fields.caption !== undefined ? fields.caption : existing.caption,
    ocrText: fields.ocrText !== undefined ? fields.ocrText : existing.ocrText,
    objects: fields.objects !== undefined ? fields.objects : existing.objects,
  };

  db.prepare("UPDATE photos SET analysis_json = ? WHERE id = ?").run(JSON.stringify(updated), id);
  return getPhotoDetails(id)!;
}

export function getFacesByPhoto(photoId: string) {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT f.* FROM faces f
      WHERE f.photo_id = ?
      ORDER BY f.created_at DESC
    `)
    .all(photoId) as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    person_id: String(row.person_id),
    encoding: String(row.encoding),
    photo_id: row.photo_id === null ? null : String(row.photo_id),
    location_json: String(row.location_json),
    thumbnail_b64: row.thumbnail_b64 === null ? null : String(row.thumbnail_b64),
    created_at: String(row.created_at),
  }));
}

// ── Tag listing for advanced search ──────────────────────────────────────────
export function listAllTags(): string[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT DISTINCT je.value AS tag
      FROM photos p, json_each(COALESCE(json_extract(p.analysis_json, '$.objects'), '[]')) je
      WHERE je.value IS NOT NULL AND je.value != ''
      ORDER BY LOWER(je.value) ASC
    `)
    .all() as Row[];

  return rows.map((row) => String(row.tag));
}

// ── Persons with faces for advanced search dropdown ──────────────────────────
export function listPersonsWithFaces(search?: string, limit = 50, offset = 0) {
  const db = getDb();
  const searchClause = search ? "AND LOWER(pr.name) LIKE LOWER(?)" : "";
  const searchArgs = search ? [`%${search}%`] : [];

  const rows = db
    .prepare(`
      SELECT DISTINCT pr.id, pr.name, pr.created_at, pr.updated_at
      FROM persons pr
      INNER JOIN faces f ON f.person_id = pr.id
      WHERE 1=1 ${searchClause}
      ORDER BY LOWER(pr.name) ASC
      LIMIT ? OFFSET ?
    `)
    .all(...searchArgs, limit, offset) as Row[];

  const totalRow = db
    .prepare(`
      SELECT COUNT(DISTINCT pr.id) as count
      FROM persons pr
      INNER JOIN faces f ON f.person_id = pr.id
      WHERE 1=1 ${searchClause}
    `)
    .get(...searchArgs) as Row;

  const total = Number(totalRow.count);

  return {
    persons: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    })),
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

