# Smart EDMS Photo AI POC

A standalone Next.js proof-of-concept that keeps the Smart EDMS folder browsing feel while storing photos locally and sending them to OCR, caption/object detection, and face recognition APIs.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Data

Runtime data is stored under `data/`:

- `data/poc.sqlite`
- `data/uploads/`

Both are ignored by git.

## How Folders Work

The POC does not call the Smart EDMS backend for folders. It creates its own local folder tree:

- `folders.parent_id` points to another local folder row, or `NULL` for root-level folders.
- `photos.folder_id` points to the local folder that contains the uploaded photo, or `NULL` for root-level photos.
- `GET /api/folders?parent_id=<folder-id>` reads those two tables and returns direct child folders plus direct child photos.
- Breadcrumbs are built by walking `folders.parent_id` back to the root.
- Uploaded image bytes are streamed from `GET /api/photos/:id/file`, using the `stored_name` saved in SQLite.
