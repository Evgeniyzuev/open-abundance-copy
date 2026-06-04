"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, ImagePlus, Link, Plus, Repeat2, Trash2 } from "lucide-react";
import {
  completeTask,
  completeTaskDay,
  deleteTask,
  failTask,
  getAllTasks,
  getTaskCompletions,
  purgeTask,
  saveTask
} from "@/lib/tasksStore";
import type { TaskCompletion, TaskItem, TaskSchedule, TaskStreakSettings } from "@/lib/tasksStore";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";

type ScheduleType = "once" | "daily" | "weekdays";

const weekdayOptions = [
  { value: 1, labelKey: "tasks.weekday.mon" },
  { value: 2, labelKey: "tasks.weekday.tue" },
  { value: 3, labelKey: "tasks.weekday.wed" },
  { value: 4, labelKey: "tasks.weekday.thu" },
  { value: 5, labelKey: "tasks.weekday.fri" },
  { value: 6, labelKey: "tasks.weekday.sat" },
  { value: 7, labelKey: "tasks.weekday.sun" }
] satisfies { value: number; labelKey: MessageKey }[];

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
  hardcore: false,
  initialLives: "0",
  livesEveryDays: "0",
  weekdays: [1, 2, 3, 4, 5],
  imageMode: "url" as "url" | "upload",
  imageUrl: "",
  thumbnailDataUrl: "",
  subtaskTitle: "",
  subtasks: [] as string[]
};

export default function TasksApp() {
  const { locale, t } = useUserContext();
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

  function openNewTaskModal() {
    setForm({ ...emptyTaskForm, startDate: todayKey() });
    setModalOpen(true);
  }

  function repeatTask(task: TaskItem) {
    setForm(buildFormFromTask(task, today));
    setSelectedTaskId(null);
    setArchiveOpen(false);
    setModalOpen(true);
  }

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
      streak: buildStreakSettings(form),
      imageUrl: form.imageMode === "url" ? form.imageUrl.trim() || undefined : undefined,
      thumbnailDataUrl: form.imageMode === "upload" ? form.thumbnailDataUrl || undefined : undefined,
      syncStatus: "local"
    });

    setForm({ ...emptyTaskForm, startDate: todayKey() });
    setModalOpen(false);
    await refreshTasks();
  }

  async function markToday(task: TaskItem) {
    const taskCompletions = completions.filter((completion) => completion.taskId === task.id);
    const missedDays = getMissedPlannedDays(task, today, taskCompletions);
    let rescuedCount = 0;

    if (task.schedule.type !== "once" && task.streak && missedDays.length > 0) {
      if (task.streak.hardcore) {
        await failTask(task.id);
        setSelectedTaskId(null);
        await refreshTasks();
        window.alert(t("tasks.streakFailedAlert", { title: task.title }));
        return;
      }

      const livesAvailable = getAvailableLives(task.streak, taskCompletions);
      const rescuedDays = missedDays.slice(0, livesAvailable);
      rescuedCount = rescuedDays.length;
      await Promise.all(rescuedDays.map((day) => completeTaskDay(task.id, day, "life")));

      if (livesAvailable < missedDays.length) {
        await failTask(task.id);
        setSelectedTaskId(null);
        await refreshTasks();
        window.alert(t("tasks.streakFailedAlert", { title: task.title }));
        return;
      }
    }

    const completedBefore = taskCompletions.length + rescuedCount;
    await completeTaskDay(task.id, today);
    await refreshTasks();

    if (task.schedule.type === "once") {
      setSelectedTaskId(null);
      window.alert(t("tasks.alertDone", { title: task.title }));
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
      streak: task.streak,
      imageUrl: task.imageUrl,
      thumbnailDataUrl: task.thumbnailDataUrl,
      syncStatus: "local"
    });
    setStreakDecisionTask(null);
    await refreshTasks();
  }

  async function removeTask(task: TaskItem) {
    const confirmed = window.confirm(t("tasks.deleteConfirm", { title: task.title }));
    if (!confirmed) return;
    await deleteTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  async function removeTaskForever(task: TaskItem) {
    const confirmed = window.confirm(t("tasks.deleteForeverConfirm", { title: task.title }));
    if (!confirmed) return;
    await purgeTask(task.id);
    setSelectedTaskId(null);
    await refreshTasks();
  }

  if (archiveOpen) {
    return (
      <TaskArchiveScreen
        completions={completions}
        locale={locale}
        tasks={archiveTasks}
        today={today}
        onBack={() => setArchiveOpen(false)}
        onDeleteForever={removeTaskForever}
        onRepeat={repeatTask}
      />
    );
  }

  return (
    <section className="tasks-screen">
      <header className="tasks-header">
        <div>
          <span>Checks</span>
          <h1>{t("tasks.title")}</h1>
        </div>
        <button className="tasks-add-button" type="button" aria-label={t("tasks.newTask")} onClick={openNewTaskModal}>
          <Plus size={24} />
        </button>
      </header>

      <TaskSection title={t("tasks.today")} emptyText={t("tasks.todayEmpty")} tasks={todayTasks} completions={completions} today={today} onMarkToday={markToday} onOpen={setSelectedTaskId} onRepeat={repeatTask} />

      <section className="task-section">
        <button className="task-section-toggle" type="button" onClick={() => setOtherExpanded((value) => !value)}>
          <span>{t("tasks.other")}</span>
          <strong>{otherTasks.length}</strong>
        </button>
        {otherExpanded ? (
          <TaskList emptyText={t("tasks.otherEmpty")} tasks={otherTasks} completions={completions} today={today} onMarkToday={markToday} onOpen={setSelectedTaskId} onRepeat={repeatTask} />
        ) : null}
      </section>

      <section className="task-section">
        <button className="task-archive-link" type="button" onClick={() => setArchiveOpen(true)}>
          <span>{t("tasks.archive")}</span>
          <strong>{archiveTasks.length}</strong>
        </button>
      </section>

      {modalOpen ? <TaskModal form={form} setForm={setForm} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} /> : null}
      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          completions={completions.filter((completion) => completion.taskId === selectedTask.id)}
          locale={locale}
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
  onRepeat: (task: TaskItem) => void;
};

type TaskArchiveScreenProps = {
  tasks: TaskItem[];
  completions: TaskCompletion[];
  locale: AppLocale;
  today: string;
  onBack: () => void;
  onDeleteForever: (task: TaskItem) => void;
  onRepeat: (task: TaskItem) => void;
};

function TaskArchiveScreen({ tasks, completions, locale, today, onBack, onDeleteForever, onRepeat }: TaskArchiveScreenProps) {
  const { t } = useUserContext();

  return (
    <section className="tasks-screen task-archive-screen">
      <header className="task-archive-topbar">
        <button className="back-button" type="button" onClick={onBack}>{"\u2039"}</button>
        <h1>{t("tasks.archive")}</h1>
      </header>

      {tasks.length === 0 ? (
        <div className="task-empty">{t("tasks.archiveEmpty")}</div>
      ) : (
        <div className="task-panel-list">
          {tasks.map((task) => (
            <ArchiveTaskPanel
              completions={completions}
              locale={locale}
              key={task.id}
              task={task}
              today={today}
              onDeleteForever={() => onDeleteForever(task)}
              onRepeat={() => onRepeat(task)}
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

function TaskList({ emptyText, tasks, completions, today, onMarkToday, onOpen, onRepeat }: Omit<TaskSectionProps, "title">) {
  if (tasks.length === 0) return <div className="task-empty">{emptyText}</div>;

  return (
    <div className="task-panel-list">
      {tasks.map((task) => (
        <TaskPanel key={task.id} task={task} completions={completions} today={today} onMarkToday={() => onMarkToday(task)} onOpen={() => onOpen(task.id)} onRepeat={() => onRepeat(task)} />
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
  onRepeat: () => void;
};

function TaskPanel({ task, completions, today, onMarkToday, onOpen, onRepeat }: TaskPanelProps) {
  const { t } = useUserContext();
  const progress = getProgress(task, completions, t);
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
          {task.description ? <small>{task.description}</small> : task.subtasks.length > 0 ? <small>{t("tasks.subtasksCount", { count: task.subtasks.length })}</small> : null}
          {progress.percent !== null ? (
            <span className="task-progress">
              <span style={{ width: `${progress.percent}%` }} />
            </span>
          ) : null}
        </span>
      </button>
      <div className="task-panel-actions">
        <button className="task-repeat-button" type="button" aria-label={t("tasks.repeatTask")} onClick={onRepeat}>
          <Repeat2 size={17} />
        </button>
        {isDueOn(task, today) ? (
          <button className={doneToday ? "task-done-button done" : "task-done-button"} type="button" disabled={doneToday} onClick={onMarkToday}>
            {doneToday ? "\u2713" : ""}
          </button>
        ) : null}
      </div>
    </article>
  );
}

type ArchiveTaskPanelProps = {
  task: TaskItem;
  completions: TaskCompletion[];
  locale: AppLocale;
  today: string;
  onDeleteForever: () => void;
  onRepeat: () => void;
};

function ArchiveTaskPanel({ task, completions, locale, today, onDeleteForever, onRepeat }: ArchiveTaskPanelProps) {
  const { t } = useUserContext();
  const progress = getProgress(task, completions, t);
  const image = task.thumbnailDataUrl || task.imageUrl;

  return (
    <article className="task-panel archive">
      <div className="task-panel-main">
        <span className="task-thumb">{image ? <img alt="" src={image} /> : <CheckSquare size={24} />}</span>
        <span className="task-panel-body">
          <span className="task-panel-title">
            {task.title}
            <em>{task.deleted ? t("tasks.deleted") : task.failed ? t("tasks.failed") : t("tasks.completed")}</em>
          </span>
          <small>{getArchiveSubtitle(task, today, progress.label, t)}</small>
          {progress.percent !== null ? (
            <span className="task-progress">
              <span style={{ width: `${progress.percent}%` }} />
            </span>
          ) : null}
        </span>
      </div>
      <div className="task-panel-actions">
        <button className="task-repeat-button" type="button" aria-label={t("tasks.repeatTask")} onClick={onRepeat}>
          <Repeat2 size={17} />
        </button>
        <button className="task-forever-delete-button" type="button" aria-label={t("tasks.deleteForever")} onClick={onDeleteForever}>
          <Trash2 size={18} />
        </button>
      </div>
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
  const { t } = useUserContext();
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
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("tasks.newTask")}</h2>
          <button className="text-button primary" type="submit">{t("app.common.done")}</button>
        </div>

        <input aria-label={t("tasks.titleLabel")} autoFocus placeholder={t("tasks.titlePlaceholder")} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <textarea aria-label={t("tasks.descriptionLabel")} placeholder={t("tasks.descriptionPlaceholder")} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />

        <div className="subtask-editor">
          <div className="subtask-input-row">
            <input
              aria-label={t("tasks.subtaskLabel")}
              placeholder={t("tasks.subtaskPlaceholder")}
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
            <ImagePlus size={16} /> {t("tasks.file")}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>

        {form.imageMode === "url" ? (
          <input aria-label={t("tasks.imageUrlLabel")} placeholder={t("tasks.imageUrlPlaceholder")} value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} />
        ) : null}
        {form.thumbnailDataUrl ? <img className="task-image-preview" alt="" src={form.thumbnailDataUrl} /> : null}

        <div className="task-modal-row">
          {(["once", "daily", "weekdays"] as ScheduleType[]).map((type) => (
            <button className={form.scheduleType === type ? "mode-button active" : "mode-button"} key={type} type="button" onClick={() => setForm((current) => ({ ...current, scheduleType: type }))}>
              {getScheduleTypeLabel(type, t)}
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
                {t(day.labelKey)}
              </button>
            ))}
          </div>
        ) : null}

        {form.scheduleType !== "once" ? (
          <>
            <div className="duration-row">
              <input
                aria-label={t("tasks.daysCountLabel")}
                disabled={form.infinite}
                min={1}
                type="number"
                value={form.targetDays}
                onChange={(event) => setForm((current) => ({ ...current, targetDays: event.target.value }))}
              />
              <label>
                <input type="checkbox" checked={form.infinite} onChange={(event) => setForm((current) => ({ ...current, infinite: event.target.checked }))} />
                {t("tasks.infiniteDays")}
              </label>
            </div>
            <div className="streak-options">
              <label>
                <input type="checkbox" checked={form.hardcore} onChange={(event) => setForm((current) => ({ ...current, hardcore: event.target.checked }))} />
                {t("tasks.hardcore")}
              </label>
              {!form.hardcore ? (
                <div className="life-settings-row">
                  <label className="life-field">
                    <span>{t("tasks.initialLivesLabel")}</span>
                    <input
                      aria-label={t("tasks.initialLivesLabel")}
                      min={0}
                      placeholder={t("tasks.initialLivesPlaceholder")}
                      type="number"
                      value={form.initialLives}
                      onChange={(event) => setForm((current) => ({ ...current, initialLives: event.target.value }))}
                    />
                  </label>
                  <label className="life-field">
                    <span>{t("tasks.livesEveryDaysLabel")}</span>
                    <input
                      aria-label={t("tasks.livesEveryDaysLabel")}
                      min={0}
                      placeholder={t("tasks.livesEveryDaysPlaceholder")}
                      type="number"
                      value={form.livesEveryDays}
                      onChange={(event) => setForm((current) => ({ ...current, livesEveryDays: event.target.value }))}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}

type TaskDetailModalProps = {
  task: TaskItem;
  completions: TaskCompletion[];
  locale: AppLocale;
  today: string;
  onClose: () => void;
  onDelete: () => void;
  onDone: () => void;
};

function TaskDetailModal({ task, completions, locale, today, onClose, onDelete, onDone }: TaskDetailModalProps) {
  const { t } = useUserContext();
  const image = task.thumbnailDataUrl || task.imageUrl;
  const doneToday = isCompletedOn(task.id, today, completions);
  const progress = getProgress(task, completions, t);
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
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("tasks.task")}</h2>
          <button className="text-button primary danger-icon-button" type="button" aria-label={t("tasks.deleteTask")} onClick={onDelete}><Trash2 size={18} /></button>
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
                  <button className="subtask-check-button" type="button" aria-label={t("tasks.completeSubtask")} onClick={() => toggleSubtask(index)}>
                    {checkedSubtasks.has(index) ? "\u2713" : ""}
                  </button>
                  <span>{subtask}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <TaskMonthCalendar task={task} completions={completions} locale={locale} today={today} />
          {isDueOn(task, today) ? (
            <button className="task-done-primary-button" type="button" disabled={doneToday} onClick={onDone}>
              {doneToday ? t("tasks.doneToday") : t("tasks.doneAction")}
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
  const { t } = useUserContext();

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small streak-complete-modal">
        <div className="streak-complete-icon">{"\u2713"}</div>
        <h2>{t("tasks.streakComplete")}</h2>
        <p>{task.title}</p>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onExtend}>{t("tasks.extend")}</button>
          <button className="task-done-primary-button" type="button" onClick={onFinish}>{t("tasks.finish")}</button>
        </div>
      </div>
    </div>
  );
}

function TaskMonthCalendar({ task, completions, locale, today }: { task: TaskItem; completions: TaskCompletion[]; locale: AppLocale; today: string }) {
  const { t } = useUserContext();
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialCalendarMonth(task, completions, today));
  const days = getCalendarMonthDays(visibleMonth);
  const previousMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const canGoPrevious = monthHasCalendarActivity(task, completions, previousMonth);
  const canGoNext = monthHasCalendarActivity(task, completions, nextMonth);

  return (
    <section className="task-calendar">
      <div className="task-calendar-header">
        <button type="button" aria-label={t("tasks.previousMonth")} disabled={!canGoPrevious} onClick={() => setVisibleMonth(previousMonth)}>
          <ChevronLeft size={18} />
        </button>
        <strong>{formatMonthTitle(visibleMonth, locale)}</strong>
        <button type="button" aria-label={t("tasks.nextMonth")} disabled={!canGoNext} onClick={() => setVisibleMonth(nextMonth)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="task-calendar-weekdays">
        {weekdayOptions.map((day) => (
          <span key={day.value}>{t(day.labelKey)}</span>
        ))}
      </div>
      <div className="task-calendar-grid">
      {days.map((day) => {
        const inMonth = day.startsWith(visibleMonth);
        const due = isPlannedOn(task, day);
        const done = isCompletedOn(task.id, day, completions);
        const life = isLifeCompletion(task.id, day, completions);
        const className = [
          "task-calendar-day",
          inMonth ? "" : "outside",
          due ? "due" : "",
          done ? "done" : "",
          life ? "life" : ""
        ].filter(Boolean).join(" ");

        return <span className={className} key={day}>{life ? "\u2764\uFE0F" : parseDateKey(day).getDate()}</span>;
      })}
    </div>
    </section>
  );
}

function buildFormFromTask(task: TaskItem, today: string): typeof emptyTaskForm {
  const targetDays = task.schedule.type === "once" ? "7" : String(task.schedule.targetDays ?? 7);
  const streak = task.streak ?? { hardcore: false, initialLives: 0, livesEveryDays: 0 };

  return {
    ...emptyTaskForm,
    title: task.title,
    description: task.description,
    scheduleType: task.schedule.type,
    startDate: today,
    targetDays,
    infinite: task.schedule.type === "once" ? false : task.schedule.infinite,
    hardcore: streak.hardcore,
    initialLives: String(streak.initialLives),
    livesEveryDays: String(streak.livesEveryDays),
    weekdays: task.schedule.type === "weekdays" ? task.schedule.weekdays : [1, 2, 3, 4, 5],
    imageMode: task.thumbnailDataUrl ? "upload" : "url",
    imageUrl: task.imageUrl ?? "",
    thumbnailDataUrl: task.thumbnailDataUrl ?? "",
    subtasks: task.subtasks
  };
}

function buildSchedule(form: typeof emptyTaskForm): TaskSchedule {
  if (form.scheduleType === "once") return { type: "once", date: form.startDate };
  const targetDays = form.infinite ? undefined : Math.max(1, Number(form.targetDays) || 1);
  if (form.scheduleType === "weekdays") {
    return { type: "weekdays", startDate: form.startDate, weekdays: form.weekdays.length > 0 ? form.weekdays : [1], targetDays, infinite: form.infinite };
  }
  return { type: "daily", startDate: form.startDate, targetDays, infinite: form.infinite };
}

function buildStreakSettings(form: typeof emptyTaskForm): TaskStreakSettings | undefined {
  if (form.scheduleType === "once") return undefined;
  return {
    hardcore: form.hardcore,
    initialLives: Math.max(0, Math.floor(Number(form.initialLives) || 0)),
    livesEveryDays: Math.max(0, Math.floor(Number(form.livesEveryDays) || 0))
  };
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

function getMissedPlannedDays(task: TaskItem, today: string, completions: TaskCompletion[]): string[] {
  if (task.schedule.type === "once") return [];
  const missedDays: string[] = [];
  const cursor = parseDateKey(task.schedule.startDate);
  const end = parseDateKey(today);
  end.setDate(end.getDate() - 1);

  while (cursor <= end) {
    const day = toDateKey(cursor);
    if (isPlannedOn(task, day) && !isCompletedOn(task.id, day, completions)) {
      missedDays.push(day);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return missedDays;
}

function getAvailableLives(settings: TaskStreakSettings, completions: TaskCompletion[]): number {
  const doneDays = completions.filter((completion) => completion.type !== "life").length;
  const spentLives = completions.filter((completion) => completion.type === "life").length;
  const earnedLives = settings.livesEveryDays > 0 ? Math.floor(doneDays / settings.livesEveryDays) : 0;
  return Math.max(0, settings.initialLives + earnedLives - spentLives);
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

function formatMonthTitle(month: string, locale: AppLocale): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { month: "long", year: "numeric" }).format(new Date(year, monthIndex - 1, 1));
}

function isCompletedOn(taskId: string, day: string, completions: TaskCompletion[]): boolean {
  return completions.some((completion) => completion.taskId === taskId && completion.localDate === day);
}

function isLifeCompletion(taskId: string, day: string, completions: TaskCompletion[]): boolean {
  return completions.some((completion) => completion.taskId === taskId && completion.localDate === day && completion.type === "life");
}

function getProgress(task: TaskItem, completions: TaskCompletion[], t: (key: MessageKey, values?: Record<string, string | number>) => string): { label: string | null; percent: number | null } {
  if (task.schedule.type === "once") return { label: null, percent: null };
  const taskCompletions = completions.filter((completion) => completion.taskId === task.id);
  const completedDays = taskCompletions.length;
  const livesLabel = task.streak && !task.streak.hardcore ? ` \u00B7 \u2764\uFE0F ${getAvailableLives(task.streak, taskCompletions)}` : "";
  if (task.schedule.infinite || !task.schedule.targetDays) return { label: `${t("tasks.days", { count: completedDays })}${livesLabel}`, percent: null };
  return {
    label: `${completedDays}/${task.schedule.targetDays}${livesLabel}`,
    percent: Math.min(100, Math.round((completedDays / task.schedule.targetDays) * 100))
  };
}

function getArchiveSubtitle(task: TaskItem, today: string, progressLabel: string | null, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  if (task.deleted) return t("tasks.deleteAvailable");
  if (task.failed) return t("tasks.failedSubtitle");
  if (progressLabel) return progressLabel;
  if (isDueOn(task, today)) return t("tasks.plannedToday");
  return t("tasks.completedSubtitle");
}

function getScheduleTypeLabel(type: ScheduleType, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  if (type === "once") return t("tasks.schedule.once");
  if (type === "weekdays") return t("tasks.schedule.weekdays");
  return t("tasks.schedule.daily");
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
