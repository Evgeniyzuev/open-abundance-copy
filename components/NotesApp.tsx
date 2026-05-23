"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { deleteNote, getNotes, Note, saveNote, syncPendingNotes } from "@/lib/notesStore";

type ConnectionState = "online" | "offline";

const emptyForm = { title: "", body: "" };

export default function NotesApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const visibleNotes = useMemo(() => notes.filter((note) => !note.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes]);
  const pendingCount = notes.filter((note) => note.syncStatus !== "synced").length;

  async function refreshNotes() {
    setNotes(await getNotes());
  }

  async function syncNow() {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      await syncPendingNotes();
      setLastSync(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
      await refreshNotes();
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    setConnection(navigator.onLine ? "online" : "offline");
    refreshNotes();

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title && !body) return;

    await saveNote({
      id: editingId ?? crypto.randomUUID(),
      title: title || "Без названия",
      body,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    setForm(emptyForm);
    setEditingId(null);
    await refreshNotes();
    if (navigator.onLine) await syncNow();
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setForm({ title: note.title, body: note.body });
  }

  async function removeNote(note: Note) {
    await deleteNote(note.id);
    await refreshNotes();
    if (navigator.onLine) await syncNow();
  }

  return (
    <section className="notes-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">Offline Notes Pilot</p>
          <h1>Заметки роста</h1>
          <p className="lead">Первый экран Open Abundance: заметки сохраняются локально, работают без интернета и синхронизируются, когда связь возвращается.</p>
        </div>
        <button className="secondary-button" type="button" disabled={connection === "offline" || isSyncing || pendingCount === 0} onClick={syncNow}>
          {isSyncing ? "Синхронизация..." : "Синхронизировать"}
        </button>
      </header>

      <div className="status-panel" aria-label="Статус приложения">
        <div className="status-item"><span className="status-label">Связь</span><span className={`status-value status-${connection}`}>{connection}</span></div>
        <div className="status-item"><span className="status-label">Заметки</span><span className="status-value">{visibleNotes.length}</span></div>
        <div className="status-item"><span className="status-label">Ожидают sync</span><span className="status-value status-pending">{pendingCount}</span></div>
        <div className="status-item"><span className="status-label">Последний sync</span><span className="status-value">{lastSync ?? "еще нет"}</span></div>
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <input aria-label="Название заметки" placeholder="Название" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <textarea aria-label="Текст заметки" placeholder="Мысль, наблюдение, идея для задания..." value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
        <div className="toolbar">
          <button className="primary-button" type="submit">{editingId ? "Сохранить" : "Добавить заметку"}</button>
          {editingId ? <button className="ghost-button" type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Отменить</button> : null}
        </div>
      </form>

      <div className="notes-list" aria-live="polite">
        {visibleNotes.length === 0 ? (
          <div className="empty-state">Пока пусто. Создайте первую заметку и проверьте офлайн-режим.</div>
        ) : (
          visibleNotes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-meta"><span className="badge">{note.syncStatus}</span><span>{new Date(note.updatedAt).toLocaleString("ru-RU")}</span></div>
              <h2>{note.title}</h2>
              {note.body ? <p>{note.body}</p> : null}
              <div className="note-actions">
                <button className="secondary-button" type="button" onClick={() => startEdit(note)}>Редактировать</button>
                <button className="danger-button" type="button" onClick={() => removeNote(note)}>Удалить</button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
