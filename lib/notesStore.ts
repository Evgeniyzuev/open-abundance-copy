export type SyncStatus = "local" | "pending_sync" | "synced" | "failed";

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  serverVersion?: string;
};

const DB_NAME = "open-abundance-offline";
const DB_VERSION = 1;
const NOTES_STORE = "notes";

type NoteInput = Pick<Note, "id" | "title" | "body" | "syncStatus">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, mode);
    const store = tx.objectStore(NOTES_STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getNotes(): Promise<Note[]> {
  return withStore<Note[]>("readonly", (store) => store.getAll());
}

export async function saveNote(input: NoteInput): Promise<Note> {
  const now = new Date().toISOString();
  const existing = await getNote(input.id);
  const note: Note = {
    id: input.id,
    title: input.title,
    body: input.body,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus
  };
  await withStore<IDBValidKey>("readwrite", (store) => store.put(note));
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const existing = await getNote(id);
  if (!existing) return;
  await withStore<IDBValidKey>("readwrite", (store) => store.put({ ...existing, deleted: true, updatedAt: new Date().toISOString(), syncStatus: navigator.onLine ? "pending_sync" : "local" }));
}

async function getNote(id: string): Promise<Note | undefined> {
  return withStore<Note | undefined>("readonly", (store) => store.get(id));
}

export async function syncPendingNotes(): Promise<void> {
  const notes = await getNotes();
  const pendingNotes = notes.filter((note) => note.syncStatus !== "synced");
  if (pendingNotes.length === 0) return;

  try {
    const response = await fetch("/api/notes/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: pendingNotes })
    });
    if (!response.ok) throw new Error("Sync failed");
    const result = (await response.json()) as { notes: Note[] };
    await Promise.all(result.notes.map((note) => note.deleted ? withStore<undefined>("readwrite", (store) => store.delete(note.id)) : withStore<IDBValidKey>("readwrite", (store) => store.put(note))));
  } catch (error) {
    await Promise.all(pendingNotes.map((note) => withStore<IDBValidKey>("readwrite", (store) => store.put({ ...note, syncStatus: "failed" }))));
    throw error;
  }
}
