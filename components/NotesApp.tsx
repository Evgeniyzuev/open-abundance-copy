"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteList,
  deleteNote,
  getLists,
  getNotes,
  Note,
  ReminderList,
  saveList,
  saveNote,
  syncPendingNotes,
  toggleNoteCompleted
} from "@/lib/notesStore";

type ConnectionState = "online" | "offline";
type ViewId = "today" | "planned" | "all" | "completed" | `list:${string}`;

type SmartList = {
  id: ViewId;
  title: string;
  icon: string;
  tone: string;
};

const smartLists: SmartList[] = [
  { id: "today", title: "Сегодня", icon: "●", tone: "blue" },
  { id: "planned", title: "В планах", icon: "◆", tone: "amber" },
  { id: "all", title: "Все", icon: "◎", tone: "slate" },
  { id: "completed", title: "Завершено", icon: "✓", tone: "green" }
];

const listIcons = ["↗", "☆", "$", "◌", "□", "◇", "+", "#"];
const listColors = ["#0f8f72", "#2f80ed", "#a66a00", "#8a5cf6", "#db4c77", "#506070"];

const emptyNoteForm = {
  title: "",
  body: "",
  listId: "default-growth",
  reminderDraft: "",
  reminders: [] as string[]
};

const emptyListForm = {
  title: "",
  icon: "↗",
  color: "#0f8f72"
};

export default function NotesApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [listForm, setListForm] = useState(emptyListForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("today");
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const visibleNotes = useMemo(() => {
    const source = notes.filter((note) => !note.deleted);
    return filterNotes(source, activeView).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [activeView, notes]);

  const pendingCount = [...notes, ...lists].filter((item) => item.syncStatus !== "synced").length;
  const activeTitle = getViewTitle(activeView, lists);

  async function refreshData() {
    const [storedNotes, storedLists] = await Promise.all([getNotes(), getLists()]);
    setNotes(storedNotes);
    setLists(storedLists);
    if (!storedLists.some((list) => list.id === noteForm.listId)) {
      setNoteForm((current) => ({ ...current, listId: storedLists[0]?.id ?? "default-growth" }));
    }
  }

  async function syncNow() {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      await syncPendingNotes();
      setLastSync(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
      await refreshData();
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    setConnection(navigator.onLine ? "online" : "offline");
    refreshData();

    const handleOnline = () => {
      setConnection("online");
      syncNow();
    };
    const handleOffline = () => setConnection("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = noteForm.title.trim();
    const body = noteForm.body.trim();
    if (!title && !body) return;

    await saveNote({
      id: editingId ?? crypto.randomUUID(),
      title: title || "Без названия",
      body,
      listId: noteForm.listId,
      reminders: noteForm.reminders,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    setNoteForm({ ...emptyNoteForm, listId: noteForm.listId });
    setEditingId(null);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  async function handleListSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = listForm.title.trim();
    if (!title) return;

    const id = crypto.randomUUID();
    await saveList({
      id,
      title,
      icon: listForm.icon,
      color: listForm.color,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    setListForm(emptyListForm);
    setActiveView(`list:${id}`);
    setNoteForm((current) => ({ ...current, listId: id }));
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  function addReminder() {
    if (!noteForm.reminderDraft) return;
    setNoteForm((current) => ({
      ...current,
      reminderDraft: "",
      reminders: [...new Set([...current.reminders, new Date(current.reminderDraft).toISOString()])].sort()
    }));
  }

  function removeReminder(value: string) {
    setNoteForm((current) => ({
      ...current,
      reminders: current.reminders.filter((reminder) => reminder !== value)
    }));
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setNoteForm({
      title: note.title,
      body: note.body,
      listId: note.listId || lists[0]?.id || "default-growth",
      reminderDraft: "",
      reminders: note.reminders || []
    });
  }

  async function removeNote(note: Note) {
    await deleteNote(note.id);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  async function completeNote(note: Note) {
    await toggleNoteCompleted(note.id);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  async function removeList(list: ReminderList) {
    await deleteList(list.id);
    setActiveView("all");
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  return (
    <section className="reminders-app">
      <header className="topbar compact">
        <div>
          <p className="eyebrow">Offline Reminders Pilot</p>
          <h1>Напоминания роста</h1>
          <p className="lead">Списки, задачи, несколько дат и офлайн-синхронизация. Работает даже без связи после первого открытия.</p>
        </div>
        <button className="secondary-button" type="button" disabled={connection === "offline" || isSyncing || pendingCount === 0} onClick={syncNow}>
          {isSyncing ? "Синхронизация..." : "Синхронизировать"}
        </button>
      </header>

      <div className="status-strip" aria-label="Статус приложения">
        <span className={`status-pill status-${connection}`}>{connection}</span>
        <span>{notes.filter((note) => !note.deleted).length} задач</span>
        <span>{pendingCount} ожидают sync</span>
        <span>sync: {lastSync ?? "еще нет"}</span>
      </div>

      <div className="reminders-layout">
        <aside className="sidebar" aria-label="Списки">
          <div className="smart-grid">
            {smartLists.map((list) => (
              <button key={list.id} className={`smart-card ${activeView === list.id ? "active" : ""}`} type="button" onClick={() => setActiveView(list.id)}>
                <span className={`smart-icon ${list.tone}`}>{list.icon}</span>
                <span className="smart-title">{list.title}</span>
                <strong>{getSmartCount(list.id, notes)}</strong>
              </button>
            ))}
          </div>

          <div className="list-section-title">Мои списки</div>
          <div className="custom-lists">
            {lists.map((list) => (
              <div className={`list-row ${activeView === `list:${list.id}` ? "active" : ""}`} key={list.id}>
                <button type="button" onClick={() => { setActiveView(`list:${list.id}`); setNoteForm((current) => ({ ...current, listId: list.id })); }}>
                  <span className="list-icon" style={{ backgroundColor: list.color }}>{list.icon}</span>
                  <span>{list.title}</span>
                  <strong>{notes.filter((note) => !note.deleted && note.listId === list.id).length}</strong>
                </button>
                {list.id !== "default-growth" ? (
                  <button className="icon-delete" type="button" aria-label={`Удалить ${list.title}`} onClick={() => removeList(list)}>×</button>
                ) : null}
              </div>
            ))}
          </div>

          <form className="new-list-form" onSubmit={handleListSubmit}>
            <input aria-label="Название списка" placeholder="Новый список" value={listForm.title} onChange={(event) => setListForm((current) => ({ ...current, title: event.target.value }))} />
            <div className="picker-row">
              {listIcons.map((icon) => (
                <button className={listForm.icon === icon ? "picker active" : "picker"} key={icon} type="button" onClick={() => setListForm((current) => ({ ...current, icon }))}>{icon}</button>
              ))}
            </div>
            <div className="picker-row">
              {listColors.map((color) => (
                <button className={listForm.color === color ? "swatch active" : "swatch"} key={color} style={{ backgroundColor: color }} type="button" onClick={() => setListForm((current) => ({ ...current, color }))} />
              ))}
            </div>
            <button className="secondary-button full" type="submit">Создать список</button>
          </form>
        </aside>

        <main className="tasks-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{activeTitle}</p>
              <h2>{visibleNotes.length} задач</h2>
            </div>
          </div>

          <form className="composer reminder-composer" onSubmit={handleNoteSubmit}>
            <input aria-label="Название задачи" placeholder="Новая задача" value={noteForm.title} onChange={(event) => setNoteForm((current) => ({ ...current, title: event.target.value }))} />
            <textarea aria-label="Заметка к задаче" placeholder="Заметка, идея, контекст..." value={noteForm.body} onChange={(event) => setNoteForm((current) => ({ ...current, body: event.target.value }))} />
            <div className="form-grid">
              <label>
                <span>Список</span>
                <select value={noteForm.listId} onChange={(event) => setNoteForm((current) => ({ ...current, listId: event.target.value }))}>
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.icon} {list.title}</option>)}
                </select>
              </label>
              <label>
                <span>Дата/время</span>
                <div className="date-row">
                  <input type="datetime-local" value={noteForm.reminderDraft} onChange={(event) => setNoteForm((current) => ({ ...current, reminderDraft: event.target.value }))} />
                  <button className="ghost-button" type="button" onClick={addReminder}>Добавить</button>
                </div>
              </label>
            </div>
            {noteForm.reminders.length > 0 ? (
              <div className="chips">
                {noteForm.reminders.map((reminder) => (
                  <button className="chip" key={reminder} type="button" onClick={() => removeReminder(reminder)}>{formatReminder(reminder)} ×</button>
                ))}
              </div>
            ) : null}
            <div className="toolbar">
              <button className="primary-button" type="submit">{editingId ? "Сохранить" : "Добавить"}</button>
              {editingId ? <button className="ghost-button" type="button" onClick={() => { setEditingId(null); setNoteForm(emptyNoteForm); }}>Отменить</button> : null}
            </div>
          </form>

          <div className="task-list" aria-live="polite">
            {visibleNotes.length === 0 ? (
              <div className="empty-state">В этом списке пока пусто.</div>
            ) : (
              visibleNotes.map((note) => {
                const list = lists.find((item) => item.id === note.listId);
                return (
                  <article className={`task-card ${note.completed ? "completed" : ""}`} key={note.id}>
                    <button className="complete-toggle" type="button" aria-label="Завершить" onClick={() => completeNote(note)}>{note.completed ? "✓" : ""}</button>
                    <div className="task-content">
                      <div className="note-meta">
                        <span className="badge">{note.syncStatus}</span>
                        {list ? <span>{list.icon} {list.title}</span> : null}
                      </div>
                      <h3>{note.title}</h3>
                      {note.body ? <p>{note.body}</p> : null}
                      {note.reminders.length > 0 ? (
                        <div className="reminder-list">{note.reminders.map((reminder) => <span key={reminder}>{formatReminder(reminder)}</span>)}</div>
                      ) : null}
                      <div className="note-actions">
                        <button className="secondary-button" type="button" onClick={() => startEdit(note)}>Редактировать</button>
                        <button className="danger-button" type="button" onClick={() => removeNote(note)}>Удалить</button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function filterNotes(notes: Note[], view: ViewId): Note[] {
  if (view === "today") return notes.filter((note) => !note.completed && note.reminders.some(isTodayReminder));
  if (view === "planned") return notes.filter((note) => !note.completed && note.reminders.length > 0);
  if (view === "completed") return notes.filter((note) => note.completed);
  if (view === "all") return notes;
  if (view.startsWith("list:")) return notes.filter((note) => note.listId === view.slice(5));
  return notes;
}

function getSmartCount(view: ViewId, notes: Note[]): number {
  return filterNotes(notes.filter((note) => !note.deleted), view).length;
}

function getViewTitle(view: ViewId, lists: ReminderList[]): string {
  if (view === "today") return "Сегодня";
  if (view === "planned") return "В планах";
  if (view === "all") return "Все";
  if (view === "completed") return "Завершено";
  if (view.startsWith("list:")) return lists.find((list) => list.id === view.slice(5))?.title ?? "Список";
  return "Список";
}

function isTodayReminder(value: string): boolean {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function formatReminder(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}