export type SyncStatus = "local" | "pending_sync" | "synced" | "failed";

export type TaskSchedule =
  | { type: "once"; date: string }
  | { type: "daily"; startDate: string; targetDays?: number; infinite: boolean }
  | { type: "weekdays"; startDate: string; weekdays: number[]; targetDays?: number; infinite: boolean };

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  subtasks: string[];
  schedule: TaskSchedule;
  imageUrl?: string;
  thumbnailDataUrl?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
};

export type TaskCompletion = {
  id: string;
  taskId: string;
  localDate: string;
  completedAt: string;
  syncStatus: SyncStatus;
};

export type TaskInput = Pick<TaskItem, "id" | "title" | "description" | "schedule" | "syncStatus"> & {
  subtasks?: string[];
  imageUrl?: string;
  thumbnailDataUrl?: string;
};

const DB_NAME = "open-abundance-offline";
const DB_VERSION = 3;
const TASKS_STORE = "tasks";
const TASK_COMPLETIONS_STORE = "taskCompletions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("notes")) {
        db.createObjectStore("notes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("lists")) {
        db.createObjectStore("lists", { keyPath: "id" });
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

export async function getTasks(): Promise<TaskItem[]> {
  const tasks = await getAllTasks();
  return tasks.filter((task) => !task.deleted);
}

export async function getAllTasks(): Promise<TaskItem[]> {
  const tasks = await withStore<TaskItem[]>(TASKS_STORE, "readonly", (store) => store.getAll());
  return tasks.map(normalizeTask).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTaskCompletions(): Promise<TaskCompletion[]> {
  const completions = await withStore<TaskCompletion[]>(TASK_COMPLETIONS_STORE, "readonly", (store) => store.getAll());
  return completions.map((completion) => ({ ...completion, syncStatus: "local" }));
}

export async function saveTask(input: TaskInput): Promise<TaskItem> {
  const now = new Date().toISOString();
  const existing = await getTask(input.id);
  const task: TaskItem = {
    id: input.id,
    title: input.title,
    description: input.description,
    subtasks: input.subtasks ?? existing?.subtasks ?? [],
    schedule: input.schedule,
    imageUrl: input.imageUrl,
    thumbnailDataUrl: input.thumbnailDataUrl,
    completed: existing?.completed ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus
  };

  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(task));
  return task;
}

export async function completeTaskDay(taskId: string, localDate: string): Promise<void> {
  const existing = await getTaskCompletion(taskId, localDate);
  if (existing) return;

  const completion: TaskCompletion = {
    id: `${taskId}:${localDate}`,
    taskId,
    localDate,
    completedAt: new Date().toISOString(),
    syncStatus: "local"
  };

  await withStore<IDBValidKey>(TASK_COMPLETIONS_STORE, "readwrite", (store) => store.put(completion));
  const task = await getTask(taskId);
  if (task && task.schedule.type === "once") {
    await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
      store.put({ ...task, completed: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
    );
  }
}

export async function completeTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
    store.put({ ...task, completed: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
  );
}

export async function deleteTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
    store.put({ ...task, deleted: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
  );
}

export async function purgeTask(id: string): Promise<void> {
  const completions = await getTaskCompletions();
  await withStore<undefined>(TASKS_STORE, "readwrite", (store) => store.delete(id));
  await Promise.all(
    completions
      .filter((completion) => completion.taskId === id)
      .map((completion) => withStore<undefined>(TASK_COMPLETIONS_STORE, "readwrite", (store) => store.delete(completion.id)))
  );
}

async function getTask(id: string): Promise<TaskItem | undefined> {
  const task = await withStore<TaskItem | undefined>(TASKS_STORE, "readonly", (store) => store.get(id));
  return task ? normalizeTask(task) : undefined;
}

async function getTaskCompletion(taskId: string, localDate: string): Promise<TaskCompletion | undefined> {
  return withStore<TaskCompletion | undefined>(TASK_COMPLETIONS_STORE, "readonly", (store) => store.get(`${taskId}:${localDate}`));
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    description: task.description ?? "",
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    completed: Boolean(task.completed),
    syncStatus: "local"
  };
}
