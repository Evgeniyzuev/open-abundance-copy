"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ImagePlus, Link, Plus, Trash2 } from "lucide-react";
import {
  completeTask,
  completeTaskDay,
  deleteTask,
  getTaskCompletions,
  getTasks,
  saveTask
} from "@/lib/tasksStore";
import type { TaskCompletion, TaskItem, TaskSchedule } from "@/lib/tasksStore";

type ScheduleType = "once" | "daily" | "weekdays";

const weekdayOptions = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" }
];

function todayKey(): string {
  return toDateKey(new Date());
}

function toDateKey(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

const emptyTaskForm = {
  title: "",
  description: "",
  scheduleType: "daily" as ScheduleType,
  startDate: todayKey(),
  targetDays: "7",
  infinite: false,
  weekdays: [1, 2, 3, 4, 5],
  imageMode: "url" as "url" | "upload",
  imageUrl: "",
  thumbnailDataUrl: "",
  subtaskTitle: "",
  subtasks: [] as string[]
};

export default function TasksApp() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [form, setForm] = useState(emptyTaskForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState(true);

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : undefined;
  const today = todayKey();

  async function refreshTasks() {
    const [storedTasks, storedCompletions] = await Promise.all([getTasks(), getTaskCompletions()]);
    setTasks(storedTasks);
    setCompletions(storedCompletions);
  }

  useEffect(() => {
    refreshTasks();
  }, []);

  const todayTasks = useMemo(
    () => tasks.filter((task) => !task.completed && isDueOn(task, today) && !isCompletedOn(task.id, today, completions)),
    [completions, tasks, today]
  );
  const otherTasks = useMemo(
    () => tasks.filter((task) => !task.completed && !todayTasks.some((todayTask) => todayTask.id === task.id)),
    [tasks, todayTasks]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;

    await saveTask({
      id: crypto.randomUUID(),
      title,
      description: form.description.trim(),
      subtasks: form.subtasks,
      schedule: buildSchedule(form),
      imageUrl: form.imageMode === "url" ? form.imageUrl.trim() || undefined : undefined,
      thumbnailDataUrl: form.imageMode === "upload" ? form.thumbnailDataUrl || undefined : undefined,
      syncStatus: navigator.onLine ? "pending_sync" : "local"
    });

    setForm({ ...emptyTaskForm, startDate: todayKey() });
    setModalOpen(false);
    await refreshTasks();
  }

  async function markToday(task: TaskItem) {
    await completeTaskDay(task.id, today);
    await refreshTasks();
  }

  async function finishTask(task: TaskItem) {
    await completeTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  async function removeTask(task: TaskItem) {
    await deleteTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  return (
    <section className="tasks-screen">
      <header className="tasks-header">
        <div>
          <span>Checks</span>
          <h1>Задачи</h1>
        </div>
        <button className="tasks-add-button" type="button" aria-label="Новая задача" onClick={() => setModalOpen(true)}>
          <Plus size={24} />
        </button>
      </header>

      <TaskSection title="Сегодня" emptyText="На сегодня задач нет." tasks={todayTasks} completions={completions} today={today} onMarkToday={markToday} onOpen={setSelectedTaskId} />

      <section className="task-section">
        <button className="task-section-toggle" type="button" onClick={() => setOtherExpanded((value) => !value)}>
          <span>Остальные</span>
          <strong>{otherTasks.length}</strong>
        </button>
        {otherExpanded ? (
          <TaskList emptyText="Остальных задач пока нет." tasks={otherTasks} completions={completions} today={today} onMarkToday={markToday} onOpen={setSelectedTaskId} />
        ) : null}
      </section>

      {modalOpen ? <TaskModal form={form} setForm={setForm} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} /> : null}
      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          completions={completions.filter((completion) => completion.taskId === selectedTask.id)}
          today={today}
          onClose={() => setSelectedTaskId(null)}
          onDelete={() => removeTask(selectedTask)}
          onFinish={() => finishTask(selectedTask)}
          onMarkToday={() => markToday(selectedTask)}
        />
      ) : null}
    </section>
  );
}

type TaskSectionProps = {
  title: string;
  emptyText: string;
  tasks: TaskItem[];
  completions: TaskCompletion[];
  today: string;
  onMarkToday: (task: TaskItem) => void;
  onOpen: (id: string) => void;
};

function TaskSection(props: TaskSectionProps) {
  return (
    <section className="task-section">
      <h2>{props.title}</h2>
      <TaskList {...props} />
    </section>
  );
}

function TaskList({ emptyText, tasks, completions, today, onMarkToday, onOpen }: Omit<TaskSectionProps, "title">) {
  if (tasks.length === 0) return <div className="task-empty">{emptyText}</div>;

  return (
    <div className="task-panel-list">
      {tasks.map((task) => (
        <TaskPanel key={task.id} task={task} completions={completions} today={today} onMarkToday={() => onMarkToday(task)} onOpen={() => onOpen(task.id)} />
      ))}
    </div>
  );
}

type TaskPanelProps = {
  task: TaskItem;
  completions: TaskCompletion[];
  today: string;
  onMarkToday: () => void;
  onOpen: () => void;
};

function TaskPanel({ task, completions, today, onMarkToday, onOpen }: TaskPanelProps) {
  const progress = getProgress(task, completions);
  const doneToday = isCompletedOn(task.id, today, completions);
  const image = task.thumbnailDataUrl || task.imageUrl;

  return (
    <article className="task-panel">
      <button className="task-panel-main" type="button" onClick={onOpen}>
        <span className="task-thumb">{image ? <img alt="" src={image} /> : <CheckSquare size={24} />}</span>
        <span className="task-panel-body">
          <span className="task-panel-title">
            {task.title}
            {progress.label ? <em>{progress.label}</em> : null}
          </span>
          {task.description ? <small>{task.description}</small> : task.subtasks.length > 0 ? <small>{task.subtasks.length} подзадач</small> : null}
          {progress.percent !== null ? (
            <span className="task-progress">
              <span style={{ width: `${progress.percent}%` }} />
            </span>
          ) : null}
        </span>
      </button>
      {isDueOn(task, today) ? (
        <button className={doneToday ? "task-done-button done" : "task-done-button"} type="button" disabled={doneToday} onClick={onMarkToday}>
          {doneToday ? "✓" : ""}
        </button>
      ) : null}
    </article>
  );
}

type TaskModalProps = {
  form: typeof emptyTaskForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyTaskForm>>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function TaskModal({ form, setForm, onClose, onSubmit }: TaskModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await compressImage(file, 420);
    setForm((current) => ({ ...current, imageMode: "upload", thumbnailDataUrl: dataUrl }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet task-modal" onSubmit={onSubmit}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Отмена</button>
          <h2>Новая задача</h2>
          <button className="text-button primary" type="submit">Готово</button>
        </div>

        <input aria-label="Название задачи" autoFocus placeholder="Название" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <textarea aria-label="Описание задачи" placeholder="Описание" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />

        <div className="subtask-editor">
          <div className="subtask-input-row">
            <input
              aria-label="Подзадача"
              placeholder="Подзадача"
              value={form.subtaskTitle}
              onChange={(event) => setForm((current) => ({ ...current, subtaskTitle: event.target.value }))}
            />
            <button className="secondary-button" type="button" onClick={() => addSubtask(setForm)}>
              <Plus size={18} />
            </button>
          </div>
          {form.subtasks.length > 0 ? (
            <div className="subtask-list">
              {form.subtasks.map((subtask, index) => (
                <button className="subtask-chip" key={`${subtask}-${index}`} type="button" onClick={() => removeSubtask(setForm, index)}>
                  {subtask}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="task-modal-row">
          <button className={form.imageMode === "url" ? "mode-button active" : "mode-button"} type="button" onClick={() => setForm((current) => ({ ...current, imageMode: "url" }))}>
            <Link size={16} /> URL
          </button>
          <button className={form.imageMode === "upload" ? "mode-button active" : "mode-button"} type="button" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> Файл
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>

        {form.imageMode === "url" ? (
          <input aria-label="Ссылка на изображение" placeholder="Ссылка на изображение" value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} />
        ) : null}
        {form.thumbnailDataUrl ? <img className="task-image-preview" alt="" src={form.thumbnailDataUrl} /> : null}

        <div className="task-modal-row">
          {(["once", "daily", "weekdays"] as ScheduleType[]).map((type) => (
            <button className={form.scheduleType === type ? "mode-button active" : "mode-button"} key={type} type="button" onClick={() => setForm((current) => ({ ...current, scheduleType: type }))}>
              {getScheduleTypeLabel(type)}
            </button>
          ))}
        </div>

        <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />

        {form.scheduleType === "weekdays" ? (
          <div className="weekday-picker">
            {weekdayOptions.map((day) => (
              <button
                className={form.weekdays.includes(day.value) ? "weekday-button active" : "weekday-button"}
                key={day.value}
                type="button"
                onClick={() => setForm((current) => ({ ...current, weekdays: toggleWeekday(current.weekdays, day.value) }))}
              >
                {day.label}
              </button>
            ))}
          </div>
        ) : null}

        {form.scheduleType !== "once" ? (
          <div className="duration-row">
            <input
              aria-label="Количество дней"
              disabled={form.infinite}
              min={1}
              type="number"
              value={form.targetDays}
              onChange={(event) => setForm((current) => ({ ...current, targetDays: event.target.value }))}
            />
            <label>
              <input type="checkbox" checked={form.infinite} onChange={(event) => setForm((current) => ({ ...current, infinite: event.target.checked }))} />
              Бесконечно дней
            </label>
          </div>
        ) : null}
      </form>
    </div>
  );
}

type TaskDetailModalProps = {
  task: TaskItem;
  completions: TaskCompletion[];
  today: string;
  onClose: () => void;
  onDelete: () => void;
  onFinish: () => void;
  onMarkToday: () => void;
};

function TaskDetailModal({ task, completions, today, onClose, onDelete, onFinish, onMarkToday }: TaskDetailModalProps) {
  const image = task.thumbnailDataUrl || task.imageUrl;
  const doneToday = isCompletedOn(task.id, today, completions);
  const progress = getProgress(task, completions);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet task-detail-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Закрыть</button>
          <h2>Задача</h2>
          <button className="text-button primary" type="button" onClick={onDelete}><Trash2 size={18} /></button>
        </div>
        {image ? <img className="task-detail-image" alt="" src={image} /> : null}
        <div className="task-detail-body">
          <h3>{task.title}</h3>
          {task.description ? <p>{task.description}</p> : null}
          {progress.label ? <strong>{progress.label}</strong> : null}
          {progress.percent !== null ? <span className="task-progress detail"><span style={{ width: `${progress.percent}%` }} /></span> : null}
          {task.subtasks.length > 0 ? (
            <ul className="task-detail-subtasks">
              {task.subtasks.map((subtask, index) => (
                <li key={`${subtask}-${index}`}>
                  <CheckSquare size={16} />
                  <span>{subtask}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <WeekPreview task={task} completions={completions} />
          {isDueOn(task, today) ? (
            <button className="secondary-button" type="button" disabled={doneToday} onClick={onMarkToday}>{doneToday ? "Сегодня выполнено" : "Отметить сегодня"}</button>
          ) : null}
          <button className="secondary-button" type="button" onClick={onFinish}>Завершить задачу</button>
        </div>
      </div>
    </div>
  );
}

function WeekPreview({ task, completions }: { task: TaskItem; completions: TaskCompletion[] }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return toDateKey(date);
  });

  return (
    <div className="week-preview">
      {days.map((day) => {
        const due = isDueOn(task, day);
        const done = isCompletedOn(task.id, day, completions);
        return <span className={done ? "done" : due ? "due" : ""} key={day}>{new Date(day).getDate()}</span>;
      })}
    </div>
  );
}

function buildSchedule(form: typeof emptyTaskForm): TaskSchedule {
  if (form.scheduleType === "once") return { type: "once", date: form.startDate };
  const targetDays = form.infinite ? undefined : Math.max(1, Number(form.targetDays) || 1);
  if (form.scheduleType === "weekdays") {
    return { type: "weekdays", startDate: form.startDate, weekdays: form.weekdays.length > 0 ? form.weekdays : [1], targetDays, infinite: form.infinite };
  }
  return { type: "daily", startDate: form.startDate, targetDays, infinite: form.infinite };
}

function isDueOn(task: TaskItem, day: string): boolean {
  if (task.completed) return false;
  if (task.schedule.type === "once") return task.schedule.date === day;
  if (task.schedule.startDate > day) return false;
  if (task.schedule.type === "daily") return true;
  return task.schedule.weekdays.includes(getIsoWeekday(day));
}

function getIsoWeekday(day: string): number {
  const value = new Date(`${day}T00:00:00`).getDay();
  return value === 0 ? 7 : value;
}

function isCompletedOn(taskId: string, day: string, completions: TaskCompletion[]): boolean {
  return completions.some((completion) => completion.taskId === taskId && completion.localDate === day);
}

function getProgress(task: TaskItem, completions: TaskCompletion[]): { label: string | null; percent: number | null } {
  if (task.schedule.type === "once") return { label: null, percent: null };
  const completedDays = completions.filter((completion) => completion.taskId === task.id).length;
  if (task.schedule.infinite || !task.schedule.targetDays) return { label: `${completedDays} дней`, percent: null };
  return {
    label: `${completedDays}/${task.schedule.targetDays}`,
    percent: Math.min(100, Math.round((completedDays / task.schedule.targetDays) * 100))
  };
}

function getScheduleTypeLabel(type: ScheduleType): string {
  if (type === "once") return "Разовая";
  if (type === "weekdays") return "Дни недели";
  return "Ежедневно";
}

function toggleWeekday(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort();
}

function addSubtask(setForm: React.Dispatch<React.SetStateAction<typeof emptyTaskForm>>) {
  setForm((current) => {
    const title = current.subtaskTitle.trim();
    if (!title) return current;
    return { ...current, subtaskTitle: "", subtasks: [...current.subtasks, title] };
  });
}

function removeSubtask(setForm: React.Dispatch<React.SetStateAction<typeof emptyTaskForm>>, index: number) {
  setForm((current) => ({ ...current, subtasks: current.subtasks.filter((_, currentIndex) => currentIndex !== index) }));
}

async function compressImage(file: File, maxSize: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
