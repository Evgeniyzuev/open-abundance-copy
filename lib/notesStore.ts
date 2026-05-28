export type SyncStatus = "local" | "pending_sync" | "synced" | "failed";

export type ReminderList = {
  id: string;
  title: string;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  serverVersion?: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  listId?: string;
  reminders: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  serverVersion?: string;
};

const DB_NAME = "open-abundance-offline";
const DB_VERSION = 3;
const NOTES_STORE = "notes";
const LISTS_STORE = "lists";
const TASKS_STORE = "tasks";
const TASK_COMPLETIONS_STORE = "taskCompletions";

type NoteInput = Pick<Note, "id" | "title" | "body" | "syncStatus"> & {
  listId?: string;
  reminders?: string[];
  completed?: boolean;
};

type ListInput = Pick<ReminderList, "id" | "title" | "icon" | "color" | "syncStatus">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LISTS_STORE)) {
        db.createObjectStore(LISTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TASK_COMPLETIONS_STORE)) {
        db.createObjectStore(TASK_COMPLETIONS_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getNotes(): Promise<Note[]> {
  const notes = await withStore<Note[]>(NOTES_STORE, "readonly", (store) => store.getAll());
  return notes.map(normalizeNote);
}

export async function getLists(): Promise<ReminderList[]> {
  const lists = await withStore<ReminderList[]>(LISTS_STORE, "readonly", (store) => store.getAll());
  return lists.map(normalizeList).filter((list) => !list.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveList(input: ListInput): Promise<ReminderList> {
  const now = new Date().toISOString();
  const existing = await getList(input.id);
  const list: ReminderList = {
    id: input.id,
    title: input.title,
    icon: input.icon || "•",
    color: input.color || "#0f8f72",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus
  };

  await withStore<IDBValidKey>(LISTS_STORE, "readwrite", (store) => store.put(list));
  return list;
}

export async function deleteList(id: string): Promise<void> {
  const existing = await getList(id);
  if (!existing) return;

  await withStore<IDBValidKey>(LISTS_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      deleted: true,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );

  const notes = await getNotes();
  await Promise.all(
    notes
      .filter((note) => note.listId === id)
      .map((note) =>
        withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
          store.put({
            ...note,
            listId: undefined,
            updatedAt: new Date().toISOString(),
            syncStatus: "local"
          })
        )
      )
  );
}

export async function saveNote(input: NoteInput): Promise<Note> {
  const now = new Date().toISOString();
  const existing = await getNote(input.id);
  const note: Note = {
    id: input.id,
    title: input.title,
    body: input.body,
    listId: input.listId ?? existing?.listId,
    reminders: input.reminders ?? existing?.reminders ?? [],
    completed: input.completed ?? existing?.completed ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus
  };

  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) => store.put(note));
  return note;
}

export async function toggleNoteCompleted(id: string): Promise<void> {
  const existing = await getNote(id);
  if (!existing) return;
  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      completed: !existing.completed,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );
}

export async function deleteNote(id: string): Promise<void> {
  const existing = await getNote(id);
  if (!existing) return;
  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      deleted: true,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );
}

async function getNote(id: string): Promise<Note | undefined> {
  const note = await withStore<Note | undefined>(NOTES_STORE, "readonly", (store) => store.get(id));
  return note ? normalizeNote(note) : undefined;
}

async function getList(id: string): Promise<ReminderList | undefined> {
  const list = await withStore<ReminderList | undefined>(LISTS_STORE, "readonly", (store) => store.get(id));
  return list ? normalizeList(list) : undefined;
}

function normalizeNote(note: Note): Note {
  return {
    ...note,
    reminders: Array.isArray(note.reminders) ? note.reminders : [],
    completed: Boolean(note.completed),
    syncStatus: "local"
  };
}

function normalizeList(list: ReminderList): ReminderList {
  return {
    ...list,
    syncStatus: "local"
  };
}
