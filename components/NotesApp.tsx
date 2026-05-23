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
type ModalMode = "create" | "edit";

type SmartList = {
  id: ViewId;
  title: string;
  icon: string;
  tone: string;
};

const smartLists: SmartList[] = [
  { id: "today", title: "Сегодня", icon: "🗓", tone: "blue" },
  { id: "planned", title: "В планах", icon: "📋", tone: "red" },
  { id: "all", title: "Все", icon: "📥", tone: "black" },
  { id: "completed", title: "Завершено", icon: "✔️", tone: "gray" }
];

const listColors = ["#ff9500", "#007aff", "#34c759", "#ff3b30", "#af52de", "#8e8e93"];

function getDefaultReminderDraft(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

const emptyNoteForm = {
  title: "",
  body: "",
  listId: "",
  reminderDraft: getDefaultReminderDraft(),
  reminders: [] as string[]
};

const emptyListForm = {
  title: "",
  icon: "↗️",
  color: "#007aff"
};

export default function NotesApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [listForm, setListForm] = useState(emptyListForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<ViewId | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [infoNoteId, setInfoNoteId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("online");

  const activeView = detailView ?? "all";
  const activeTitle = getViewTitle(activeView, lists);
  const activeNote = infoNoteId ? notes.find((note) => note.id === infoNoteId) : undefined;

  const visibleNotes = useMemo(() => {
    const source = notes.filter((note) => !note.deleted);
    return filterNotes(source, activeView).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [activeView, notes]);

  const pendingCount = [...notes, ...lists].filter((item) => item.syncStatus !== "synced").length;

  async function refreshData() {
    const [storedNotes, storedLists] = await Promise.all([getNotes(), getLists()]);
    setNotes(storedNotes);
    setLists(storedLists);
    if (!storedLists.some((list) => list.id === noteForm.listId)) {
      setNoteForm((current) => ({ ...current, listId: "" }));
    }
  }

  async function syncNow() {
    if (!navigator.onLine) return;
    await syncPendingNotes();
    await refreshData();
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

  function openList(view: ViewId) {
    setDetailView(view);
    if (view.startsWith("list:")) {
      setNoteForm((current) => ({ ...current, listId: view.slice(5) }));
    }
  }

  function openCreateNote() {
    const listId = detailView?.startsWith("list:") ? detailView.slice(5) : "";
    setEditingId(null);
    setNoteForm({ ...emptyNoteForm, listId });
    setNoteModalOpen(true);
  }

  function openEditNote(note: Note) {
    setEditingId(note.id);
    setNoteForm({
      title: note.title,
      body: note.body,
      listId: note.listId || "",
      reminderDraft: "",
      reminders: note.reminders || []
    });
    setInfoNoteId(null);
    setNoteModalOpen(true);
  }

  function closeNoteModal() {
    setNoteModalOpen(false);
    setEditingId(null);
    setNoteForm(emptyNoteForm);
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = noteForm.title.trim();
    const body = noteForm.body.trim();
    if (!title && !body) return;

    await saveNote({
      id: editingId ?? crypto.randomUUID(),
      title: title || "Без названия",
      body,
      listId: noteForm.listId || undefined,
      reminders: noteForm.reminders,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    closeNoteModal();
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
      icon: listForm.icon.trim() || "•",
      color: listForm.color,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    setListForm(emptyListForm);
    setListModalOpen(false);
    setDetailView(`list:${id}`);
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

  async function removeNote(note: Note) {
    await deleteNote(note.id);
    setInfoNoteId(null);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  async function completeNote(note: Note) {
    await toggleNoteCompleted(note.id);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  async function removeListConfirmed(list: ReminderList) {
    const confirmed = window.confirm(`Удалить список "${list.title}"? Заметки не будут привязаны к списку, но останутся во "Все".`);
    if (!confirmed) return;
    await deleteList(list.id);
    setDetailView(null);
    await refreshData();
    if (navigator.onLine) await syncNow();
  }

  return (
    <section className="reminders-app">
      {detailView ? (
        <ListDetail
          activeTitle={activeTitle}
          notes={visibleNotes}
          lists={lists}
          onBack={() => setDetailView(null)}
          onCreate={openCreateNote}
          onComplete={completeNote}
          onEdit={openEditNote}
          onInfo={setInfoNoteId}
        />
      ) : (
        <HomeScreen
          connection={connection}
          lists={lists}
          notes={notes}
          pendingCount={pendingCount}
          onCreateList={() => setListModalOpen(true)}
          onCreateNote={openCreateNote}
          onDeleteList={removeListConfirmed}
          onOpenList={openList}
        />
      )}

      {noteModalOpen ? (
        <NoteModal
          mode={editingId ? "edit" : "create"}
          form={noteForm}
          lists={lists}
          onAddReminder={addReminder}
          onClose={closeNoteModal}
          onRemoveReminder={removeReminder}
          onSubmit={handleNoteSubmit}
          setForm={setNoteForm}
        />
      ) : null}

      {listModalOpen ? (
        <ListModal
          form={listForm}
          onClose={() => setListModalOpen(false)}
          onSubmit={handleListSubmit}
          setForm={setListForm}
        />
      ) : null}

      {activeNote ? (
        <InfoModal
          list={lists.find((item) => item.id === activeNote.listId)}
          note={activeNote}
          onClose={() => setInfoNoteId(null)}
          onDelete={() => removeNote(activeNote)}
          onEdit={() => openEditNote(activeNote)}
        />
      ) : null}
    </section>
  );
}

type HomeScreenProps = {
  connection: ConnectionState;
  lists: ReminderList[];
  notes: Note[];
  pendingCount: number;
  onCreateList: () => void;
  onCreateNote: () => void;
  onDeleteList: (list: ReminderList) => void;
  onOpenList: (view: ViewId) => void;
};

function HomeScreen({ connection, lists, notes, pendingCount, onCreateList, onCreateNote, onDeleteList, onOpenList }: HomeScreenProps) {
  return (
    <>
      <header className="home-topbar">
        <div className="status-line">
          <span className={`dot ${connection}`} />
          <span>{connection}</span>
          <span>{pendingCount} sync</span>
        </div>
        <div className="top-actions">
          <button className="round-button search-button" type="button" aria-label="Поиск">⌕</button>
          <button className="round-button list-create-button" type="button" aria-label="Создать список" onClick={onCreateList}>▦</button>
          <button className="round-button primary-add-button" type="button" aria-label="Создать заметку" onClick={onCreateNote}>+</button>
        </div>
      </header>

      <div className="smart-grid compact">
        {smartLists.map((list) => (
          <button key={list.id} className={`smart-card ${list.tone}`} type="button" onClick={() => onOpenList(list.id)}>
            <span className="smart-icon">{list.icon}</span>
            <strong>{getSmartCount(list.id, notes)}</strong>
            <span>{list.title}</span>
          </button>
        ))}
      </div>

      <section className="my-lists-section">
        <h1>Мои списки</h1>
        <div className="ios-list-card">
          {lists.map((list) => (
            <div className="ios-list-row" key={list.id}>
              <button type="button" onClick={() => onOpenList(`list:${list.id}`)}>
                <span className="list-icon" style={{ backgroundColor: list.color }}>{list.icon}</span>
                <span>{list.title}</span>
                <strong>{getListCount(list.id, notes)}</strong>
                <span className="chevron">›</span>
              </button>
              <button className="row-delete" type="button" aria-label={`Удалить ${list.title}`} onClick={() => onDeleteList(list)}>×</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

type ListDetailProps = {
  activeTitle: string;
  notes: Note[];
  lists: ReminderList[];
  onBack: () => void;
  onCreate: () => void;
  onComplete: (note: Note) => void;
  onEdit: (note: Note) => void;
  onInfo: (id: string) => void;
};

function ListDetail({ activeTitle, notes, lists, onBack, onCreate, onComplete, onEdit, onInfo }: ListDetailProps) {
  return (
    <section className="detail-screen">
      <header className="detail-topbar">
        <button className="back-button" type="button" onClick={onBack}>‹</button>
        <h1>{activeTitle}</h1>
        <div className="detail-actions">
          <button className="round-button" type="button" aria-label="Поделиться">⇧</button>
          <button className="round-button" type="button" aria-label="Еще">•••</button>
        </div>
      </header>

      <div className="task-list compact-list">
        {notes.length === 0 ? (
          <div className="empty-state">В этом списке пока пусто.</div>
        ) : (
          notes.map((note) => {
            const list = lists.find((item) => item.id === note.listId);
            return (
              <article className={`task-row ${note.completed ? "completed" : ""}`} key={note.id}>
                <button className="complete-toggle" type="button" aria-label="Завершить" onClick={() => onComplete(note)}>{note.completed ? "✓" : ""}</button>
                <button className="task-text" type="button" onClick={() => onEdit(note)}>
                  <span>{note.title}</span>
                  {note.body ? <small>{note.body}</small> : null}
                  {note.reminders.length > 0 ? <em>{note.reminders.map(formatReminder).join(" · ")}</em> : null}
                  {list ? <i>{list.icon} {list.title}</i> : null}
                </button>
                <button className="info-button" type="button" aria-label="Информация" onClick={() => onInfo(note.id)}>i</button>
              </article>
            );
          })
        )}
      </div>

      <button className="floating-add" type="button" aria-label="Создать заметку" onClick={onCreate}>+</button>
    </section>
  );
}

type NoteModalProps = {
  mode: ModalMode;
  form: typeof emptyNoteForm;
  lists: ReminderList[];
  onAddReminder: () => void;
  onClose: () => void;
  onRemoveReminder: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyNoteForm>>;
};

function NoteModal({ mode, form, lists, onAddReminder, onClose, onRemoveReminder, onSubmit, setForm }: NoteModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet" onSubmit={onSubmit}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Отмена</button>
          <h2>{mode === "edit" ? "Заметка" : "Новая заметка"}</h2>
          <button className="text-button primary" type="submit">Готово</button>
        </div>
        <input aria-label="Название заметки" autoFocus placeholder="Название" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <textarea aria-label="Текст заметки" placeholder="Заметка" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
        <select value={form.listId} onChange={(event) => setForm((current) => ({ ...current, listId: event.target.value }))}>
          <option value="">— Без списка</option>
          {lists.map((list) => <option key={list.id} value={list.id}>{list.icon} {list.title}</option>)}
        </select>
        <div className="date-row">
          <input type="datetime-local" value={form.reminderDraft} onChange={(event) => setForm((current) => ({ ...current, reminderDraft: event.target.value }))} />
          <button className="secondary-button" type="button" onClick={onAddReminder}>Добавить дату</button>
        </div>
        {form.reminders.length > 0 ? (
          <div className="chips">
            {form.reminders.map((reminder) => (
              <button className="chip" key={reminder} type="button" onClick={() => onRemoveReminder(reminder)}>{formatReminder(reminder)} ×</button>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}

type ListModalProps = {
  form: typeof emptyListForm;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyListForm>>;
};

function ListModal({ form, onClose, onSubmit, setForm }: ListModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet small" onSubmit={onSubmit}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Отмена</button>
          <h2>Новый список</h2>
          <button className="text-button primary" type="submit">Готово</button>
        </div>
        <label className="emoji-field">
          <span style={{ backgroundColor: form.color }}>{form.icon || "•"}</span>
          <input aria-label="Эмодзи списка" maxLength={4} placeholder="Эмодзи" value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} />
        </label>
        <input aria-label="Название списка" autoFocus placeholder="Название списка" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <div className="swatches">
          {listColors.map((color) => (
            <button className={form.color === color ? "swatch active" : "swatch"} key={color} style={{ backgroundColor: color }} type="button" onClick={() => setForm((current) => ({ ...current, color }))} />
          ))}
        </div>
      </form>
    </div>
  );
}

type InfoModalProps = {
  list?: ReminderList;
  note: Note;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
};

function InfoModal({ list, note, onClose, onDelete, onEdit }: InfoModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Закрыть</button>
          <h2>Информация</h2>
          <span />
        </div>
        <div className="info-block">
          <strong>{note.title}</strong>
          {note.body ? <p>{note.body}</p> : null}
          <span>{list ? `${list.icon} ${list.title}` : "Без списка"}</span>
          <span>{note.syncStatus}</span>
          {note.reminders.map((reminder) => <span key={reminder}>{formatReminder(reminder)}</span>)}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onEdit}>Редактировать</button>
          <button className="danger-button" type="button" onClick={onDelete}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

function filterNotes(notes: Note[], view: ViewId): Note[] {
  if (view === "today") return notes.filter((note) => !note.completed && note.reminders.some(isTodayReminder));
  if (view === "planned") return notes.filter((note) => !note.completed && note.reminders.length > 0);
  if (view === "completed") return notes.filter((note) => note.completed);
  if (view === "all") return notes.filter((note) => !note.completed);
  if (view.startsWith("list:")) return notes.filter((note) => !note.completed && note.listId === view.slice(5));
  return notes;
}

function getSmartCount(view: ViewId, notes: Note[]): number {
  return filterNotes(notes.filter((note) => !note.deleted), view).length;
}

function getListCount(listId: string, notes: Note[]): number {
  return notes.filter((note) => !note.deleted && !note.completed && note.listId === listId).length;
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
