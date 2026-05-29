"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, ImagePlus, Link, Plus, Trash2 } from "lucide-react";
import {
  completeTask,
  completeTaskDay,
  deleteTask,
  getAllTasks,
  getTaskCompletions,
  purgeTask,
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

function parseDateKey(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [streakDecisionTask, setStreakDecisionTask] = useState<TaskItem | null>(null);

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : undefined;
  const today = todayKey();

  async function refreshTasks() {
    const [storedTasks, storedCompletions] = await Promise.all([getAllTasks(), getTaskCompletions()]);
    setTasks(storedTasks);
    setCompletions(storedCompletions);
  }

  useEffect(() => {
    refreshTasks();
  }, []);

  const todayTasks = useMemo(
    () => tasks.filter((task) => !task.deleted && !task.completed && isDueOn(task, today) && !isCompletedOn(task.id, today, completions)),
    [completions, tasks, today]
  );
  const otherTasks = useMemo(
    () => tasks.filter((task) => !task.deleted && !task.completed && !todayTasks.some((todayTask) => todayTask.id === task.id)),
    [tasks, todayTasks]
  );
  const archiveTasks = useMemo(() => tasks.filter((task) => task.completed || task.deleted), [tasks]);

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
      syncStatus: "local"
    });

    setForm({ ...emptyTaskForm, startDate: todayKey() });
    setModalOpen(false);
    await refreshTasks();
  }

  async function markToday(task: TaskItem) {
    const completedBefore = completions.filter((completion) => completion.taskId === task.id).length;
    await completeTaskDay(task.id, today);
    await refreshTasks();

    if (task.schedule.type === "once") {
      setSelectedTaskId(null);
      window.alert(`Готово: "${task.title}"`);
      return;
    }

    if (!task.schedule.infinite && task.schedule.targetDays && completedBefore + 1 >= task.schedule.targetDays) {
      setStreakDecisionTask(task);
    }
  }

  async function finishTask(task: TaskItem) {
    await completeTask(task.id);
    setStreakDecisionTask(null);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  async function extendTask(task: TaskItem) {
    const schedule = extendTaskSchedule(task.schedule);
    await saveTask({
      id: task.id,
      title: task.title,
      description: task.description,
      subtasks: task.subtasks,
      schedule,
      imageUrl: task.imageUrl,
      thumbnailDataUrl: task.thumbnailDataUrl,
      syncStatus: "local"
    });
    setStreakDecisionTask(null);
    await refreshTasks();
  }

  async function removeTask(task: TaskItem) {
    const confirmed = window.confirm(`Удалить задачу "${task.title}"? Она попадет в завершенные/удаленные.`);
    if (!confirmed) return;
    await deleteTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  async function removeTaskForever(task: TaskItem) {
    const confirmed = window.confirm(`Удалить задачу "${task.title}" окончательно? Это действие нельзя отменить.`);
    if (!confirmed) return;
    await purgeTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  if (archiveOpen) {
    return (
      <TaskArchiveScreen
        completions={completions}
        tasks={archiveTasks}
        today={today}
        onBack={() => setArchiveOpen(false)}
        onDeleteForever={removeTaskForever}
      />
    );
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

      <section className="task-section">
        <button className="task-archive-link" type="button" onClick={() => setArchiveOpen(true)}>
          <span>Завершенные и удаленные</span>
          <strong>{archiveTasks.length}</strong>
        </button>
      </section>

      {modalOpen ? <TaskModal form={form} setForm={setForm} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} /> : null}
      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          completions={completions.filter((completion) => completion.taskId === selectedTask.id)}
          today={today}
          onClose={() => setSelectedTaskId(null)}
          onDelete={() => removeTask(selectedTask)}
          onDone={() => markToday(selectedTask)}
        />
      ) : null}
      {streakDecisionTask ? (
        <StreakCompleteModal
          task={streakDecisionTask}
          onExtend={() => extendTask(streakDecisionTask)}
          onFinish={() => finishTask(streakDecisionTask)}
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

type TaskArchiveScreenProps = {
  tasks: TaskItem[];
  completions: TaskCompletion[];
  today: string;
  onBack: () => void;
  onDeleteForever: (task: TaskItem) => void;
};

function TaskArchiveScreen({ tasks, completions, today, onBack, onDeleteForever }: TaskArchiveScreenProps) {
  return (
    <section className="tasks-screen task-archive-screen">
      <header className="task-archive-topbar">
        <button className="back-button" type="button" onClick={onBack}>‹</button>
        <h1>Завершенные и удаленные</h1>
      </header>

      {tasks.length === 0 ? (
        <div className="task-empty">Здесь пока ничего нет.</div>
      ) : (
        <div className="task-panel-list">
          {tasks.map((task) => (
            <ArchiveTaskPanel
              completions={completions}
              key={task.id}
              task={task}
              today={today}
              onDeleteForever={() => onDeleteForever(task)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

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

type ArchiveTaskPanelProps = {
  task: TaskItem;
  completions: TaskCompletion[];
  today: string;
  onDeleteForever: () => void;
};

function ArchiveTaskPanel({ task, completions, today, onDeleteForever }: ArchiveTaskPanelProps) {
  const progress = getProgress(task, completions);
  const image = task.thumbnailDataUrl || task.imageUrl;

  return (
    <article className="task-panel archive">
      <div className="task-panel-main">
        <span className="task-thumb">{image ? <img alt="" src={image} /> : <CheckSquare size={24} />}</span>
        <span className="task-panel-body">
          <span className="task-panel-title">
            {task.title}
            <em>{task.deleted ? "Удалено" : "Завершено"}</em>
          </span>
          <small>{getArchiveSubtitle(task, today, progress.label)}</small>
          {progress.percent !== null ? (
            <span className="task-progress">
              <span style={{ width: `${progress.percent}%` }} />
            </span>
          ) : null}
        </span>
      </div>
      <button className="task-forever-delete-button" type="button" aria-label="Удалить окончательно" onClick={onDeleteForever}>
        <Trash2 size={18} />
      </button>
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
  onDone: () => void;
};

function TaskDetailModal({ task, completions, today, onClose, onDelete, onDone }: TaskDetailModalProps) {
  const image = task.thumbnailDataUrl || task.imageUrl;
  const doneToday = isCompletedOn(task.id, today, completions);
  const progress = getProgress(task, completions);
  const [checkedSubtasks, setCheckedSubtasks] = useState<Set<number>>(new Set());

  function toggleSubtask(index: number) {
    setCheckedSubtasks((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet task-detail-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>Закрыть</button>
          <h2>Задача</h2>
          <button className="text-button primary danger-icon-button" type="button" aria-label="Удалить задачу" onClick={onDelete}><Trash2 size={18} /></button>
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
                <li className={checkedSubtasks.has(index) ? "done" : ""} key={`${subtask}-${index}`}>
                  <button className="subtask-check-button" type="button" aria-label="Отметить подзадачу" onClick={() => toggleSubtask(index)}>
                    {checkedSubtasks.has(index) ? "✓" : ""}
                  </button>
                  <span>{subtask}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <TaskMonthCalendar task={task} completions={completions} today={today} />
          {isDueOn(task, today) ? (
            <button className="task-done-primary-button" type="button" disabled={doneToday} onClick={onDone}>
              {doneToday ? "Done today ✓" : "Done ✓"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type StreakCompleteModalProps = {
  task: TaskItem;
  onExtend: () => void;
  onFinish: () => void;
};

function StreakCompleteModal({ task, onExtend, onFinish }: StreakCompleteModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small streak-complete-modal">
        <div className="streak-complete-icon">✓</div>
        <h2>Стрик завершен</h2>
        <p>{task.title}</p>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onExtend}>Продлить</button>
          <button className="task-done-primary-button" type="button" onClick={onFinish}>Завершить</button>
        </div>
      </div>
    </div>
  );
}

function TaskMonthCalendar({ task, completions, today }: { task: TaskItem; completions: TaskCompletion[]; today: string }) {
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialCalendarMonth(task, completions, today));
  const days = getCalendarMonthDays(visibleMonth);
  const previousMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const canGoPrevious = monthHasCalendarActivity(task, completions, previousMonth);
  const canGoNext = monthHasCalendarActivity(task, completions, nextMonth);

  return (
    <section className="task-calendar">
      <div className="task-calendar-header">
        <button type="button" aria-label="Предыдущий месяц" disabled={!canGoPrevious} onClick={() => setVisibleMonth(previousMonth)}>
          <ChevronLeft size={18} />
        </button>
        <strong>{formatMonthTitle(visibleMonth)}</strong>
        <button type="button" aria-label="Следующий месяц" disabled={!canGoNext} onClick={() => setVisibleMonth(nextMonth)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="task-calendar-weekdays">
        {weekdayOptions.map((day) => (
          <span key={day.value}>{day.label}</span>
        ))}
      </div>
      <div className="task-calendar-grid">
      {days.map((day) => {
        const inMonth = day.startsWith(visibleMonth);
        const due = isPlannedOn(task, day);
        const done = isCompletedOn(task.id, day, completions);
        const className = [
          "task-calendar-day",
          inMonth ? "" : "outside",
          due ? "due" : "",
          done ? "done" : ""
        ].filter(Boolean).join(" ");

        return <span className={className} key={day}>{parseDateKey(day).getDate()}</span>;
      })}
    </div>
    </section>
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

function extendTaskSchedule(schedule: TaskSchedule): TaskSchedule {
  if (schedule.type === "once") return schedule;
  const currentTarget = schedule.targetDays ?? 7;
  return { ...schedule, infinite: false, targetDays: currentTarget + Math.max(1, currentTarget) };
}

function isDueOn(task: TaskItem, day: string): boolean {
  if (task.completed) return false;
  return isPlannedOn(task, day);
}

function isPlannedOn(task: TaskItem, day: string): boolean {
  if (task.schedule.type === "once") return task.schedule.date === day;
  if (task.schedule.startDate > day) return false;
  if (task.schedule.type === "daily") {
    if (task.schedule.infinite || !task.schedule.targetDays) return true;
    return daysBetween(task.schedule.startDate, day) < task.schedule.targetDays;
  }

  if (!task.schedule.weekdays.includes(getIsoWeekday(day))) return false;
  if (task.schedule.infinite || !task.schedule.targetDays) return true;
  return countPlannedDaysThrough(task, day) <= task.schedule.targetDays;
}

function getIsoWeekday(day: string): number {
  const value = parseDateKey(day).getDay();
  return value === 0 ? 7 : value;
}

function daysBetween(from: string, to: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / dayMs);
}

function countPlannedDaysThrough(task: TaskItem, day: string): number {
  if (task.schedule.type !== "weekdays") return 0;

  let count = 0;
  const cursor = parseDateKey(task.schedule.startDate);
  const end = parseDateKey(day);

  while (cursor <= end) {
    if (task.schedule.weekdays.includes(getIsoWeekday(toDateKey(cursor)))) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function getInitialCalendarMonth(task: TaskItem, completions: TaskCompletion[], today: string): string {
  const todayMonth = getMonthKey(today);
  if (monthHasCalendarActivity(task, completions, todayMonth)) return todayMonth;

  const completion = completions[0]?.localDate;
  if (completion) return getMonthKey(completion);

  if (task.schedule.type === "once") return getMonthKey(task.schedule.date);
  return getMonthKey(task.schedule.startDate);
}

function getMonthKey(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return toDateKey(new Date(year, monthIndex - 1 + offset, 1)).slice(0, 7);
}

function getCalendarMonthDays(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - (getIsoWeekday(toDateKey(firstDay)) - 1));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date);
  });
}

function monthHasCalendarActivity(task: TaskItem, completions: TaskCompletion[], month: string): boolean {
  if (completions.some((completion) => completion.localDate.startsWith(month))) return true;
  return getCalendarMonthDays(month).some((day) => day.startsWith(month) && isPlannedOn(task, day));
}

function formatMonthTitle(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(new Date(year, monthIndex - 1, 1));
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

function getArchiveSubtitle(task: TaskItem, today: string, progressLabel: string | null): string {
  if (task.deleted) return "Можно удалить окончательно";
  if (progressLabel) return progressLabel;
  if (isDueOn(task, today)) return "Была запланирована на сегодня";
  return "Задача завершена";
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
