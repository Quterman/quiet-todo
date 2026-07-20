const STORAGE_KEY = "quiet-todo.tasks";
const HISTORY_KEY = "quiet-todo.history";
const ACTIVE_DAY_KEY = "quiet-todo.active-day";
const RECURRING_KEY = "quiet-todo.recurring";
const THEME_KEY = "quiet-todo.theme";
const SECTION_KEY = "quiet-todo.section";
const WORKDAYS_MODE_KEY = "quiet-todo.workdays-mode";
const CLOUD_LOAD_TIMEOUT_MS = 8000;
const supabaseClient = window.quietTodoSupabase;
const loginUrl = window.quietTodoConfig?.loginUrl ?? "./login.html";
const verificationTaskTitles = new Set([
  "Тест: уйти в выполненное",
  "Тест: перенести в Позже",
  "Тест: pointer перенос",
]);

const initialTasks = [
  {
    id: crypto.randomUUID(),
    title: "Придумать первую маленькую задачу",
    view: "now",
    done: false,
    completedFrom: null,
    priority: "medium",
    dueAt: null,
    note: "",
    recurringId: null,
    dateKey: getTodayKey(),
  },
];

const views = {
  now: "Сегодня",
  later: "Позже",
  soft: "Когда будут силы",
  done: "Выполнено",
};

const priorities = {
  low: "Обычная",
  medium: "Обычная",
  high: "Важная",
};

const taskControls = document.querySelector(".task-controls");
const form = document.querySelector("#task-form");
const composerOpen = document.querySelector("#composer-open");
const input = document.querySelector("#task-input");
const composerSubmit = document.querySelector(".composer-submit");
const composerClose = document.querySelector("#composer-close");
const list = document.querySelector("#task-list");
const listShell = document.querySelector(".list-shell");
const emptyState = document.querySelector("#empty-state");
const openCount = document.querySelector("#open-count");
const progressFill = document.querySelector("#progress-fill");
const progressLabel = document.querySelector("#progress-label");
const progressDetail = document.querySelector("#progress-detail");
const progressTrack = document.querySelector(".progress-track");
const closeDayButton = document.querySelector("#close-day");
const activeDayTitle = document.querySelector("#active-day-title");
const dayDateButton = document.querySelector("#day-date-button");
const dayPicker = document.querySelector("#day-picker");
const dayPrevButton = document.querySelector("#day-prev");
const dayNextButton = document.querySelector("#day-next");
const dayReview = document.querySelector("#day-review");
const dayRatingButtons = Array.from(document.querySelectorAll("[data-rating]"));
const dayNote = document.querySelector("#day-note");
const dayReviewSubmit = document.querySelector("#day-review-submit");
const dayReviewCancel = document.querySelector("#day-review-cancel");
const historyCount = document.querySelector("#history-count");
const historyList = document.querySelector("#history-list");
const weekTrend = document.querySelector("#week-trend");
const periodMetrics = document.querySelector("#period-metrics");
const statsMonthPrev = document.querySelector("#stats-month-prev");
const statsMonthNext = document.querySelector("#stats-month-next");
const statsMonthLabel = document.querySelector("#stats-month-label");
const authLogout = document.querySelector("#auth-logout");
const authStatus = document.querySelector("#auth-status");
const accountEmail = document.querySelector("#account-email");
const workspace = document.querySelector(".workspace");
const bootLoader = document.querySelector("#boot-loader");
const sectionTitle = document.querySelector("#section-title");
const sectionTabs = Array.from(document.querySelectorAll(".section-tab"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));
const recurringForm = document.querySelector("#recurring-form");
const recurringTitle = document.querySelector("#recurring-title");
const recurringTime = document.querySelector("#recurring-time");
const recurringList = document.querySelector("#recurring-list");
const recurringCount = document.querySelector("#recurring-count");
const recurringEmpty = document.querySelector("#recurring-empty");
const themeToggle = document.querySelector("#theme-toggle");
const themeStatus = document.querySelector("#theme-status");
const workdaysStatus = document.querySelector("#workdays-status");
const workdaysModeButtons = Array.from(document.querySelectorAll("[data-workdays-mode]"));

let currentTheme = loadTheme();
let workdaysMode = loadWorkdaysMode();
let activeDayKey = loadActiveDayKey();
let tasks = loadTasks();
let history = loadHistory();
let recurringTasks = loadRecurringTasks();
activeDayKey = chooseActiveDayKey(activeDayKey);
let statsMonthDate = getMonthStart(parseDateKey(activeDayKey));
let draggedTaskId = null;
let pointerDrag = null;
let composerExpanded = false;
let currentSection = loadSection();
let statsTrendMode = "week";
let selectedDayRating = 4;
let editingDueTaskId = null;
let editingNoteTaskId = null;
let currentUser = null;
let cloudSaveTimer = null;
let isLoadingCloudData = false;
let cloudHistorySyncEnabled = true;

applyTheme(currentTheme);
applyWorkdaysMode(workdaysMode);

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === "dark" || saved === "light") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;

  if (themeToggle) {
    themeToggle.checked = currentTheme === "dark";
  }

  if (themeStatus) {
    themeStatus.textContent = currentTheme === "dark" ? "Тёмная" : "Светлая";
  }
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, currentTheme);
}

function loadWorkdaysMode() {
  const saved = localStorage.getItem(WORKDAYS_MODE_KEY);
  return saved === "everyday" ? "everyday" : "weekdays";
}

function applyWorkdaysMode(mode) {
  workdaysMode = mode === "everyday" ? "everyday" : "weekdays";

  if (workdaysStatus) {
    workdaysStatus.textContent = workdaysMode === "everyday" ? "Каждый день" : "Пн–Пт";
  }

  for (const button of workdaysModeButtons) {
    const isActive = button.dataset.workdaysMode === workdaysMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function setWorkdaysMode(mode) {
  applyWorkdaysMode(mode);
  localStorage.setItem(WORKDAYS_MODE_KEY, workdaysMode);
  render();
}

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return initialTasks;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed
          .filter((task) => !verificationTaskTitles.has(task.title))
          .map((task) => normalizeTask(task))
      : initialTasks;
  } catch {
    return initialTasks;
  }
}

function loadHistory() {
  const saved = localStorage.getItem(HISTORY_KEY);

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeHistoryItem(item)) : [];
  } catch {
    return [];
  }
}

function loadRecurringTasks() {
  const saved = localStorage.getItem(RECURRING_KEY);

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeRecurringTask(item)) : [];
  } catch {
    return [];
  }
}

function loadActiveDayKey() {
  const saved = localStorage.getItem(ACTIVE_DAY_KEY);
  return normalizeDateKey(saved) || getTodayKey();
}

function loadSection() {
  const saved = localStorage.getItem(SECTION_KEY);
  return normalizeSection(saved);
}

function saveSection() {
  localStorage.setItem(SECTION_KEY, currentSection);
}

function normalizeSection(section) {
  return ["tasks", "stats", "recurring", "account"].includes(section) ? section : "tasks";
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "Без названия",
    view: views[task.view] ? task.view : "now",
    done: Boolean(task.done),
    completedFrom: task.completedFrom || (task.done ? task.view : null),
    priority: priorities[task.priority] ? task.priority : "medium",
    dueAt: normalizeDueAt(task.dueAt),
    note: normalizeTaskNote(task.note),
    recurringId: task.recurringId || task.recurring_id || null,
    dateKey: normalizeDateKey(task.dateKey) || getTodayKey(),
  };
}

function normalizeRecurringTask(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: normalizeTaskTitle(item.title),
    time: normalizeRecurringTime(item.time),
    isActive: item.isActive ?? item.is_active ?? true,
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
  };
}

function normalizeHistoryItem(item) {
  const date = item.date || new Date().toISOString();
  const dateKey = normalizeDateKey(item.dateKey) || getDateKey(new Date(date));

  return {
    id: item.id || crypto.randomUUID(),
    date,
    dateKey,
    total: Number(item.total) || 0,
    completed: Number(item.completed) || 0,
    moved: Number(item.moved) || 0,
    percent: Number(item.percent) || 0,
    rating: item.rating ? Number(item.rating) : null,
    note: item.note || "",
    archivedTasks: Array.isArray(item.archivedTasks)
      ? item.archivedTasks.map((task) => normalizeTask({ ...task, dateKey: task.dateKey || dateKey }))
      : [],
  };
}

function saveTasks() {
  if (!currentUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  scheduleCloudSave();
}

function saveHistory() {
  if (!currentUser) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
  scheduleCloudSave();
}

function saveRecurringTasks() {
  if (!currentUser) {
    localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringTasks));
  }
  scheduleCloudSave();
}

function saveActiveDayKey() {
  localStorage.setItem(ACTIVE_DAY_KEY, activeDayKey);
}

function scheduleCloudSave() {
  if (!currentUser || isLoadingCloudData) {
    return;
  }

  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    saveCloudData();
  }, 250);
}

async function saveCloudData() {
  if (!currentUser || !supabaseClient) {
    return;
  }

  setAuthStatus("Сохраняю в облако...");

  const userId = currentUser.id;
  const skippedTaskColumns = new Set();
  const cloudWarnings = [];
  const taskRows = tasks.map((task, index) => ({
    id: task.id,
    user_id: userId,
    title: task.title,
    view: task.view,
    done: task.done,
    completed_from: task.completedFrom,
    priority: task.priority,
    due_at: task.dueAt,
    note: task.note,
    recurring_id: task.recurringId,
    date_key: task.dateKey,
    sort_order: index,
  }));
  const recurringRows = recurringTasks.map((item) => ({
    id: item.id,
    user_id: userId,
    title: item.title,
    time: item.time,
    is_active: item.isActive,
    created_at: item.createdAt,
  }));
  const historyRows = history.map((item) => ({
    id: item.id,
    user_id: userId,
    date_key: item.dateKey,
    total: item.total,
    completed: item.completed,
    moved: item.moved,
    percent: item.percent,
    rating: item.rating,
    note: item.note,
    archived_tasks: item.archivedTasks,
    created_at: item.date,
  }));

  if (cloudHistorySyncEnabled) {
    if (historyRows.length > 0) {
      const historyUpsert = await supabaseClient
        .from("day_history")
        .upsert(historyRows, { onConflict: "user_id,date_key" });
      if (historyUpsert.error) {
        setAuthStatus(`Ошибка сохранения истории: ${historyUpsert.error.message}`);
        return;
      }

      const historyDelete = await supabaseClient
        .from("day_history")
        .delete()
        .eq("user_id", userId)
        .not("id", "in", `(${historyRows.map((item) => item.id).join(",")})`);
      if (historyDelete.error) {
        setAuthStatus(`Ошибка очистки истории: ${historyDelete.error.message}`);
        return;
      }
    } else {
      const historyDelete = await supabaseClient.from("day_history").delete().eq("user_id", userId);
      if (historyDelete.error) {
        setAuthStatus(`Ошибка очистки истории: ${historyDelete.error.message}`);
        return;
      }
    }
  } else {
    cloudWarnings.push("история временно не перезаписывается, потому что не загрузилась");
  }

  if (recurringRows.length > 0) {
    const recurringUpsert = await supabaseClient
      .from("recurring_tasks")
      .upsert(recurringRows, { onConflict: "id" });
    if (recurringUpsert.error) {
      cloudWarnings.push(`регулярные не сохранены: ${recurringUpsert.error.message}`);
    } else {
      const recurringDelete = await supabaseClient
        .from("recurring_tasks")
        .delete()
        .eq("user_id", userId)
        .not("id", "in", `(${recurringRows.map((item) => item.id).join(",")})`);
      if (recurringDelete.error) {
        cloudWarnings.push(`регулярные не очищены: ${recurringDelete.error.message}`);
      }
    }
  } else {
    const recurringDelete = await supabaseClient.from("recurring_tasks").delete().eq("user_id", userId);
    if (recurringDelete.error) {
      cloudWarnings.push(`регулярные не очищены: ${recurringDelete.error.message}`);
    }
  }

  if (taskRows.length > 0) {
    let tasksUpsert = await supabaseClient.from("tasks").upsert(taskRows, { onConflict: "id" });

    while (tasksUpsert.error) {
      const missingColumn = getMissingOptionalTaskColumn(tasksUpsert.error);

      if (!missingColumn || skippedTaskColumns.has(missingColumn)) {
        break;
      }

      skippedTaskColumns.add(missingColumn);
      const fallbackTaskRows = taskRows.map((row) => {
        const nextRow = { ...row };
        for (const column of skippedTaskColumns) {
          delete nextRow[column];
        }
        return nextRow;
      });
      tasksUpsert = await supabaseClient.from("tasks").upsert(fallbackTaskRows, { onConflict: "id" });
    }

    if (tasksUpsert.error) {
      setAuthStatus(`Ошибка сохранения задач: ${tasksUpsert.error.message}`);
      return;
    }

    const tasksDelete = await supabaseClient
      .from("tasks")
      .delete()
      .eq("user_id", userId)
      .not("id", "in", `(${taskRows.map((item) => item.id).join(",")})`);
    if (tasksDelete.error) {
      setAuthStatus(`Ошибка очистки задач: ${tasksDelete.error.message}`);
      return;
    }
  } else {
    const tasksDelete = await supabaseClient.from("tasks").delete().eq("user_id", userId);
    if (tasksDelete.error) {
      setAuthStatus(`Ошибка очистки задач: ${tasksDelete.error.message}`);
      return;
    }
  }

  setAuthStatus(
    skippedTaskColumns.size > 0
      ? `Задачи сохранены. Для новых полей добавь в Supabase: ${Array.from(skippedTaskColumns).join(", ")}.`
      : cloudWarnings.length > 0
      ? `Задачи сохранены. ${cloudWarnings[0]}`
      : "Синхронизировано",
  );
}

function getMissingOptionalTaskColumn(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();

  if (!(message.includes("column") || message.includes("schema cache"))) {
    return null;
  }

  if (message.includes("due_at")) {
    return "due_at";
  }

  if (message.includes("note")) {
    return "note";
  }

  if (message.includes("recurring_id")) {
    return "recurring_id";
  }

  return null;
}

async function loadCloudData() {
  if (!currentUser || !supabaseClient) {
    return;
  }

  isLoadingCloudData = true;
  setAuthStatus("Загружаю задачи из Supabase...");

  try {
    const [taskResult, historyResult, recurringResult] = await Promise.all([
      withTimeout(
        supabaseClient.from("tasks").select("*").order("sort_order", { ascending: true }),
        CLOUD_LOAD_TIMEOUT_MS,
        "задачи",
      ),
      withTimeout(
        supabaseClient.from("day_history").select("*").order("created_at", { ascending: false }),
        CLOUD_LOAD_TIMEOUT_MS,
        "история",
      ),
      withTimeout(
        supabaseClient.from("recurring_tasks").select("*").order("created_at", { ascending: true }),
        CLOUD_LOAD_TIMEOUT_MS,
        "регулярные",
      ),
    ]);

    if (taskResult.error) {
      setAuthStatus(`Ошибка загрузки задач: ${taskResult.error.message}`);
      return;
    }

    if (recurringResult.error) {
      recurringTasks = [];
      setAuthStatus(`Задачи загрузились. Регулярные пока недоступны: ${recurringResult.error.message}`);
    }

    tasks = taskResult.data.map((row) =>
      normalizeTask({
        id: row.id,
        title: row.title,
        view: row.view,
        done: row.done,
        completedFrom: row.completed_from,
        priority: row.priority,
        dueAt: row.due_at,
        note: row.note,
        recurringId: row.recurring_id,
        dateKey: row.date_key,
      }),
    );
    if (!recurringResult.error) {
      recurringTasks = recurringResult.data.map((row) =>
        normalizeRecurringTask({
          id: row.id,
          title: row.title,
          time: row.time,
          isActive: row.is_active,
          createdAt: row.created_at,
        }),
      );
    }
    cloudHistorySyncEnabled = !historyResult.error;
    history = historyResult.error
      ? history
      : historyResult.data.map((row) =>
          normalizeHistoryItem({
            id: row.id,
            date: row.created_at,
            dateKey: row.date_key,
            total: row.total,
            completed: row.completed,
            moved: row.moved,
            percent: row.percent,
            rating: row.rating,
            note: row.note,
            archivedTasks: row.archived_tasks,
          }),
        );

    activeDayKey = chooseActiveDayKey(activeDayKey);
    syncStatsMonthToActiveDay();
    saveActiveDayKey();
    isLoadingCloudData = false;
    const didCreateRecurringTasks = ensureRecurringTasksForDay(activeDayKey);
    if (didCreateRecurringTasks) {
      scheduleCloudSave();
    }
    setAuthStatus(
      historyResult.error
        ? `Задачи загружены. История пока недоступна: ${historyResult.error.message}`
        : recurringResult.error
        ? `Задачи загружены. Регулярные пока недоступны: ${recurringResult.error.message}`
        : "Данные загружены из Supabase",
    );
    render();
  } catch (error) {
    setAuthStatus(`Не удалось загрузить Supabase, работаем с локальными данными: ${getErrorMessage(error)}`);
  } finally {
    isLoadingCloudData = false;
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "неизвестная ошибка";
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`таймаут загрузки: ${label}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function setAuthStatus(text) {
  if (authStatus) {
    authStatus.textContent = text;
  }
}

function updateAuthUi() {
  if (accountEmail) {
    accountEmail.textContent = currentUser?.email || "Вход не выполнен";
  }

  setAuthStatus(currentUser ? "Supabase" : "Открываю страницу входа");
}

function finishBootLoading() {
  workspace.classList.remove("is-booting");
  workspace.setAttribute("aria-busy", "false");

  if (bootLoader) {
    bootLoader.hidden = true;
  }
}

function renderSafely() {
  try {
    render();
  } catch (error) {
    setAuthStatus(`Ошибка отображения: ${getErrorMessage(error)}`);
  }
}

async function signOut() {
  if (!supabaseClient) {
    return;
  }

  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUi();
  window.location.href = loginUrl;
}

async function initializeAuth() {
  if (!supabaseClient) {
    currentUser = null;
    updateAuthUi();
    setAuthStatus("Supabase не загрузился, работаем локально");
    renderSafely();
    finishBootLoading();
    return;
  }

  let data;

  try {
    ({ data } = await withTimeout(supabaseClient.auth.getSession(), CLOUD_LOAD_TIMEOUT_MS, "сессия"));
  } catch (error) {
    currentUser = null;
    updateAuthUi();
    setAuthStatus(`Не удалось проверить сессию Supabase: ${getErrorMessage(error)}`);
    renderSafely();
    finishBootLoading();
    return;
  }

  currentUser = data.session?.user ?? null;
  updateAuthUi();

  if (!currentUser) {
    window.location.href = loginUrl;
    return;
  }

  try {
    await loadCloudData();
  } catch (error) {
    setAuthStatus(`Не удалось загрузить Supabase, работаем с локальными данными: ${getErrorMessage(error)}`);
  } finally {
    renderSafely();
    finishBootLoading();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const previousUserId = currentUser?.id;
    currentUser = session?.user ?? null;
    updateAuthUi();

    if (!currentUser) {
      window.location.href = loginUrl;
      return;
    }

    if (currentUser && currentUser.id !== previousUserId) {
      loadCloudData();
    }
  });
}

function render() {
  ensureRecurringTasksForDay(activeDayKey);
  const visibleTasks = getVisibleTasks();
  const dayClosed = isActiveDayClosed();
  const dayActiveTasks = getEditableTasksForDay(activeDayKey).filter(
    (task) => !task.done,
  ).length;

  if (openCount) {
    openCount.textContent = dayActiveTasks;
  }
  renderDaySwitcher();
  updateProgress();
  updateComposerLock();
  list.innerHTML = "";
  emptyState.hidden = visibleTasks.length > 0;

  for (const [index, task] of visibleTasks.entries()) {
    const item = document.createElement("li");
    item.className = `task${task.done ? " is-done" : ""}${task.priority === "high" ? " is-focus" : ""}${
      editingNoteTaskId === task.id ? " is-note-open" : ""
    }`;
    item.dataset.id = task.id;
    item.draggable = !dayClosed && !task.done;

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.disabled = dayClosed;
    check.setAttribute("aria-label", task.done ? "Вернуть задачу" : "Отметить выполненной");
    check.textContent = "✓";
    check.addEventListener("click", () => toggleTask(task.id));

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const priority = document.createElement("button");
    priority.className = `task-priority is-${task.priority}`;
    priority.type = "button";
    priority.disabled = dayClosed;
    priority.title = task.priority === "high" ? "Снять фокус" : "Поставить фокус";
    priority.setAttribute(
      "aria-label",
      task.priority === "high" ? "Снять фокус с задачи" : "Поставить фокус на задачу",
    );
    priority.addEventListener("click", () => togglePriority(task.id));

    const titleLine = document.createElement("span");
    titleLine.className = "task-title-line";
    titleLine.append(title, priority);

    const due = document.createElement("div");
    due.className = `task-due${task.dueAt ? " has-due" : ""}`;
    due.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const dueButton = document.createElement("button");
    dueButton.className = "task-due-button";
    dueButton.type = "button";
    dueButton.disabled = dayClosed;
    dueButton.textContent = task.dueAt ? formatDueAt(task.dueAt) : "Установить срок";
    dueButton.title = task.dueAt ? "Изменить срок" : "Установить срок";
    dueButton.setAttribute("aria-label", task.dueAt ? "Изменить срок задачи" : "Установить срок задачи");
    dueButton.addEventListener("click", () => {
      editingDueTaskId = editingDueTaskId === task.id ? null : task.id;
      render();
    });
    due.append(dueButton);

    if (!dayClosed && editingDueTaskId === task.id) {
      const dueEditor = createDueEditor(task);
      due.append(dueEditor);
    }

    const taskCopy = document.createElement("div");
    taskCopy.className = "task-copy";
    taskCopy.append(titleLine);

    if (task.note) {
      const notePreview = document.createElement("button");
      notePreview.className = "task-note-preview";
      notePreview.type = "button";
      notePreview.disabled = dayClosed;
      notePreview.textContent = task.note;
      notePreview.setAttribute("aria-label", "Изменить заметку к задаче");
      notePreview.addEventListener("click", () => {
        editingNoteTaskId = task.id;
        render();
      });
      taskCopy.append(notePreview);
    }

    if (!dayClosed && editingNoteTaskId === task.id) {
      taskCopy.append(createTaskNoteEditor(task));
    }

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.disabled = dayClosed;
    remove.setAttribute("aria-label", "Удалить задачу");
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(check, taskCopy, due, remove);

    if (!task.note && !dayClosed && editingNoteTaskId !== task.id) {
      const noteBubble = document.createElement("button");
      noteBubble.className = "task-note-bubble";
      noteBubble.type = "button";
      noteBubble.textContent = "Добавить заметку";
      noteBubble.setAttribute("aria-label", "Добавить заметку к задаче");
      noteBubble.addEventListener("click", () => {
        editingNoteTaskId = task.id;
        render();
      });
      item.append(noteBubble);
    }

    wireDragEvents(item, task);
    list.append(item);
  }

  renderSecondarySectionsSafely();
}

function renderSecondarySectionsSafely() {
  try {
    renderHistory();
  } catch (error) {
    setAuthStatus(`Ошибка отображения статистики: ${getErrorMessage(error)}`);
  }

  try {
    renderRecurringTasks();
  } catch (error) {
    setAuthStatus(`Ошибка отображения регулярных задач: ${getErrorMessage(error)}`);
  }
}

function switchSection(section) {
  currentSection = normalizeSection(section);
  saveSection();
  workspace.dataset.currentSection = currentSection;
  const sectionTitles = {
    tasks: "Фокус на день",
    stats: "Прогресс и история",
    recurring: "Повторяющиеся задачи",
    account: "Аккаунт",
  };
  if (sectionTitle) {
    sectionTitle.textContent = sectionTitles[currentSection];
  }

  for (const tab of sectionTabs) {
    const isActive = tab.dataset.section === currentSection;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of sectionPanels) {
    panel.hidden = panel.dataset.sectionPanel !== currentSection;
    panel.classList.toggle("is-active", panel.dataset.sectionPanel === currentSection);
  }
}

function updateProgress() {
  const dayGoalTasks = getActiveDayGoalTasks();
  const doneDayTasks = dayGoalTasks.filter((task) => task.done);
  const dayClosed = isActiveDayClosed();
  const progress =
    dayGoalTasks.length === 0
      ? 0
      : Math.round((doneDayTasks.length / dayGoalTasks.length) * 100);
  const progressTone = progress < 33 ? "is-low" : progress <= 66 ? "is-mid" : "is-high";
  const progressAlpha = (0.16 + (progress / 100) * 0.34).toFixed(2);

  progressFill.style.setProperty("--progress", `${progress}%`);
  progressTrack.style.setProperty("--progress-alpha", progressAlpha);
  progressTrack.classList.remove("is-low", "is-mid", "is-high");
  progressTrack.classList.add(progressTone);
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressLabel.textContent = `${progress}%`;
  progressDetail.textContent =
    dayClosed
      ? "День закрыт"
      : dayGoalTasks.length === 0
      ? "Цель пока пустая"
      : `${doneDayTasks.length} из ${dayGoalTasks.length} за день завершено`;
  closeDayButton.disabled = dayGoalTasks.length === 0 || dayClosed;
  closeDayButton.textContent = dayClosed ? "День закрыт" : "Закрыть день";
  for (const button of dayRatingButtons) {
    button.disabled = dayClosed || dayGoalTasks.length === 0;
  }
  dayNote.disabled = dayClosed || dayGoalTasks.length === 0;

  if (dayClosed || dayGoalTasks.length === 0) {
    hideDayReview();
  }
}

function updateComposerLock() {
  const inputLocked = isActiveDayClosed();

  input.disabled = inputLocked;
  composerOpen.disabled = inputLocked;
  composerSubmit.disabled = inputLocked;
  composerClose.disabled = inputLocked;
  form.classList.toggle("is-locked", inputLocked);

  input.placeholder = inputLocked ? "Этот день уже закрыт" : "Новая задача";
  composerOpen.textContent = inputLocked ? "День закрыт" : "Новая задача";

  if (inputLocked) {
    setComposerExpanded(false);
  }
}

function updateComposerSubmitState() {
  composerSubmit.disabled = isActiveDayClosed() || input.value.trim().length === 0;
}

function getActiveDayGoalTasks() {
  const closedItem = getHistoryItem(activeDayKey);

  if (closedItem) {
    return closedItem.archivedTasks;
  }

  return getEditableTasksForDay(activeDayKey);
}

function getActiveDayStats() {
  const dayGoalTasks = getActiveDayGoalTasks();
  const doneDayTasks = dayGoalTasks.filter((task) => task.done);

  return {
    total: dayGoalTasks.length,
    completed: doneDayTasks.length,
    moved: dayGoalTasks.length - doneDayTasks.length,
    percent:
      dayGoalTasks.length === 0
        ? 0
        : Math.round((doneDayTasks.length / dayGoalTasks.length) * 100),
  };
}

function renderHistory() {
  const todayKey = getTodayKey();
  const displayMonth = getMonthStart(statsMonthDate);
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(displayMonth);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(displayMonth);
  const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const monthKey = getMonthKey(displayMonth);
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekdayOffset = (firstDay.getDay() + 6) % 7;
  const activeDate = parseDateKey(activeDayKey);
  const activeWeekStart = getWeekStart(activeDate);
  const activeWeekEnd = new Date(activeWeekStart);
  activeWeekEnd.setDate(activeWeekStart.getDate() + 6);
  const historyByDate = new Map();

  for (const item of history) {
    if (!historyByDate.has(item.dateKey)) {
      historyByDate.set(item.dateKey, item);
    }
  }

  const monthItems = Array.from(historyByDate.values()).filter((item) =>
    item.dateKey.startsWith(monthKey),
  );

  statsMonthDate = displayMonth;
  statsMonthLabel.textContent = capitalize(monthLabel);
  statsMonthNext.disabled = compareMonthKeys(monthKey, getMonthKey(new Date())) >= 0;
  historyCount.textContent = `${capitalize(monthName)} · ${monthItems.length} ${getClosedDayWord(
    monthItems.length,
  )}`;
  renderPeriodMetrics(monthItems);
  renderWeekTrend(activeDate, historyByDate);
  historyList.innerHTML = "";

  for (const dayName of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) {
    const weekday = document.createElement("li");
    weekday.className = "calendar-weekday";
    weekday.textContent = dayName;
    historyList.append(weekday);
  }

  for (let index = 0; index < firstWeekdayOffset; index += 1) {
    const blank = document.createElement("li");
    blank.className = "calendar-blank";
    blank.setAttribute("aria-hidden", "true");
    historyList.append(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = getDateKey(date);
    const item = historyByDate.get(dateKey);
    const dayLabel = dayLabelFormatter.format(date);
    const isSelectedWeek = date >= activeWeekStart && date <= activeWeekEnd;
    const historyItem = document.createElement("li");
    historyItem.className = `calendar-day${item ? ` is-closed ${getSuccessClass(item.percent)}` : ""}${
      dateKey === todayKey ? " is-today" : ""
    }${dateKey === activeDayKey ? " is-active" : ""}${
      compareDateKeys(dateKey, todayKey) <= 0 ? " is-selectable" : ""
    }${isSelectedWeek ? " is-in-selected-week" : ""}`;
    historyItem.setAttribute(
      "aria-label",
      item
        ? `${dayLabel}: закрыто ${item.completed} из ${item.total}, ${item.percent}%${
            item.rating ? `, оценка ${item.rating} из 5` : ""
          }`
        : `${dayLabel}: день не закрыт`,
    );

    const title = document.createElement("span");
    title.className = "calendar-date";
    title.textContent = String(day);
    historyItem.append(title);
    if (compareDateKeys(dateKey, todayKey) <= 0) {
      historyItem.addEventListener("click", () => setActiveDayKey(dateKey));
    }

    if (item) {
      const progress = document.createElement("span");
      progress.className = "calendar-progress";
      progress.style.setProperty("--day-progress", `${item.percent}%`);

      const result = document.createElement("strong");
      result.className = "calendar-result";
      result.textContent = `${item.completed}/${item.total}`;

      progress.append(result);
      historyItem.append(progress);

      if (item.rating) {
        const rating = document.createElement("span");
        rating.className = "calendar-rating";
        rating.textContent = `★${item.rating}`;
        rating.setAttribute("aria-label", `Оценка дня ${item.rating} из 5`);
        historyItem.append(rating);
      }
    } else {
      const empty = document.createElement("span");
      empty.className = "calendar-empty";
      empty.textContent = "—";
      historyItem.append(empty);
    }

    if (item) {
      const undo = document.createElement("button");
      undo.className = "history-undo";
      undo.type = "button";
      undo.setAttribute("aria-label", "Отменить закрытие дня");
      undo.textContent = "×";
      undo.addEventListener("click", (event) => {
        event.stopPropagation();
        undoCloseDay(item.id);
      });
      historyItem.append(undo);
    }

    historyList.append(historyItem);
  }

}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderPeriodMetrics(monthItems) {
  const stats = getPeriodStats(monthItems);
  periodMetrics.innerHTML = "";

  for (const item of [
    { label: "Закрыто дней", value: stats.daysClosed },
    { label: "Выполнено задач", value: stats.completed },
    { label: "Средний процент", value: stats.averagePercent === null ? "—" : `${stats.averagePercent}%` },
    { label: "Средняя оценка", value: stats.averageRating === null ? "—" : stats.averageRating },
  ]) {
    const metric = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");

    label.textContent = item.label;
    value.textContent = item.value;
    metric.append(label, value);
    periodMetrics.append(metric);
  }
}

function getPeriodStats(items) {
  const completed = items.reduce((sum, item) => sum + item.completed, 0);
  const percentSum = items.reduce((sum, item) => sum + item.percent, 0);
  const ratingItems = items.filter((item) => item.rating);
  const ratingSum = ratingItems.reduce((sum, item) => sum + item.rating, 0);

  return {
    daysClosed: items.length,
    completed,
    averagePercent: items.length === 0 ? null : Math.round(percentSum / items.length),
    averageRating:
      ratingItems.length === 0 ? null : (ratingSum / ratingItems.length).toFixed(1).replace(".", ","),
  };
}

function renderWeekTrend(date, historyByDate) {
  const trend = getTrendData(date, historyByDate);
  const stats = getTrendStats(trend.items);
  const todayKey = getTodayKey();
  const dayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  const monthDayFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const chartWidth = 100;
  const chartHeight = 100;
  const chartTop = 14;
  const chartBottom = 78;
  const chartLeft = 5;
  weekTrend.innerHTML = "";

  const head = document.createElement("div");
  head.className = "week-trend-head";

  const title = document.createElement("span");
  title.className = "week-trend-title";
  title.textContent = trend.title;

  const actions = document.createElement("div");
  actions.className = "week-trend-actions";

  const note = document.createElement("span");
  note.className = "week-trend-note";
  note.textContent =
    stats.daysClosed === 0
      ? "нет закрытых дней"
      : `${stats.daysClosed} ${getClosedDayWord(stats.daysClosed)} · ${stats.completed}/${stats.total} · ${stats.percent}%`;

  const switcher = document.createElement("div");
  switcher.className = "trend-mode-switch";
  switcher.setAttribute("aria-label", "Масштаб тренда");

  for (const item of [
    { mode: "week", label: "Неделя" },
    { mode: "month", label: "Месяц" },
  ]) {
    const button = document.createElement("button");
    button.className = item.mode === statsTrendMode ? "is-active" : "";
    button.type = "button";
    button.dataset.trendMode = item.mode;
    button.setAttribute("aria-pressed", String(item.mode === statsTrendMode));
    button.textContent = item.label;
    switcher.append(button);
  }

  actions.append(note, switcher);
  head.append(title, actions);
  weekTrend.append(head);

  const chart = document.createElement("div");
  chart.className = "week-trend-chart";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", trend.title);
  svg.setAttribute("preserveAspectRatio", "none");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  gradient.setAttribute("id", "week-trend-fill");
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("y2", "1");

  for (const stop of [
    { offset: "0%", opacity: "0.26" },
    { offset: "100%", opacity: "0" },
  ]) {
    const item = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    item.setAttribute("offset", stop.offset);
    item.setAttribute("stop-color", "currentColor");
    item.setAttribute("stop-opacity", stop.opacity);
    gradient.append(item);
  }

  defs.append(gradient);
  svg.append(defs);

  for (const level of [100, 50, 0]) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = chartBottom - (level / 100) * (chartBottom - chartTop);
    line.setAttribute("class", `week-trend-grid${level === 0 ? " is-baseline" : ""}`);
    line.setAttribute("x1", chartLeft);
    line.setAttribute("x2", chartWidth - chartLeft);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    svg.append(line);
  }

  const points = [];

  for (let index = 0; index < trend.days.length; index += 1) {
    const day = trend.days[index];
    const dateKey = getDateKey(day);
    const item = historyByDate.get(dateKey);
    const isFuture = compareDateKeys(dateKey, todayKey) > 0;
    const value = item ? item.percent : 0;
    const step = trend.days.length <= 1 ? 0 : (chartWidth - chartLeft * 2) / (trend.days.length - 1);
    const x = chartLeft + index * step;
    const y = chartBottom - (value / 100) * (chartBottom - chartTop);

    points.push({ x, y, item, isFuture, value, dateKey });
  }

  const closedPoints = points.filter((point) => point.item);

  if (closedPoints.length > 1) {
    const linePath = closedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const areaPath = `${linePath} L ${closedPoints[closedPoints.length - 1].x} ${chartBottom} L ${
      closedPoints[0].x
    } ${chartBottom} Z`;

    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("class", "week-trend-area");
    area.setAttribute("d", areaPath);
    svg.append(area);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("class", "week-trend-line");
    line.setAttribute("d", linePath);
    svg.append(line);
  }

  chart.append(svg);

  const overlay = document.createElement("ol");
  overlay.className = "week-trend-points";
  const lastClosedPoint = closedPoints[closedPoints.length - 1] || null;

  for (const point of points) {
    const showPoint = statsTrendMode === "week" || point.item || point.dateKey === activeDayKey;

    if (!showPoint) {
      continue;
    }

    const marker = document.createElement("li");
    const pointDate = parseDateKey(point.dateKey);
    const pointLabel =
      statsTrendMode === "month"
        ? monthDayFormatter.format(pointDate).replace(".", "")
        : capitalize(dayFormatter.format(pointDate)).replace(".", "");
    marker.className = `week-trend-point${point.item ? " is-closed" : ""}${
      point.dateKey === activeDayKey ? " is-active" : ""
    }${point.isFuture ? " is-future" : ""}`;
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.item ? point.y : chartBottom}%`;
    marker.setAttribute(
      "aria-label",
      point.item ? `${pointLabel}: ${point.item.percent}% выполнения` : `${pointLabel}: день не закрыт`,
    );

    const dot = document.createElement("span");
    dot.className = "week-trend-point-dot";
    dot.setAttribute("aria-hidden", "true");
    marker.append(dot);

    if (point.item && (statsTrendMode === "week" || point.dateKey === activeDayKey || point === lastClosedPoint)) {
      const value = document.createElement("strong");
      value.textContent = `${point.value}%`;
      marker.append(value);
    }

    overlay.append(marker);
  }

  chart.append(overlay);
  weekTrend.append(chart);
}

function getTrendData(date, historyByDate) {
  if (statsTrendMode === "month") {
    const monthStart = getMonthStart(statsMonthDate);
    const monthLabel = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(monthStart);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const days = Array.from(
      { length: daysInMonth },
      (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth(), index + 1),
    );
    const monthKey = getMonthKey(monthStart);
    const items = Array.from(historyByDate.values()).filter((item) => item.dateKey.startsWith(monthKey));

    return {
      days,
      items,
      title: `Тренд месяца · ${capitalize(monthLabel)}`,
    };
  }

  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
  const items = days.map((day) => historyByDate.get(getDateKey(day))).filter(Boolean);

  return {
    days,
    items,
    title: `Тренд недели · ${formatWeekRange(weekStart, weekEnd)}`,
  };
}

function getTrendStats(items) {
  const completed = items.reduce((sum, item) => sum + item.completed, 0);
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return {
    daysClosed: items.length,
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function getWeekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);

  return start;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthKey(date) {
  const monthStart = getMonthStart(date);
  const year = monthStart.getFullYear();
  const month = String(monthStart.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function compareMonthKeys(left, right) {
  return left.localeCompare(right);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function syncStatsMonthToActiveDay() {
  statsMonthDate = getMonthStart(parseDateKey(activeDayKey));
}

function setStatsMonthDate(date) {
  const nextMonth = getMonthStart(date);

  if (compareMonthKeys(getMonthKey(nextMonth), getMonthKey(new Date())) > 0) {
    return;
  }

  statsMonthDate = nextMonth;
  render();
}

function formatWeekRange(start, end) {
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  return `${formatter.format(start).replace(".", "")} — ${formatter.format(end).replace(".", "")}`;
}

function normalizeDateKey(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const date = parseDateKey(dateKey);
  return Number.isNaN(date.getTime()) ? null : getDateKey(date);
}

function compareDateKeys(left, right) {
  return left.localeCompare(right);
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return getDateKey(date);
}

function getNextWorkdayKey(dateKey) {
  let nextDateKey = addDays(dateKey, 1);

  while (!isWorkday(nextDateKey)) {
    nextDateKey = addDays(nextDateKey, 1);
  }

  return nextDateKey;
}

function isWorkday(dateKey) {
  if (workdaysMode === "everyday") {
    return true;
  }

  const day = parseDateKey(dateKey).getDay();
  return day >= 1 && day <= 5;
}

function formatDayLabel(dateKey) {
  const date = parseDateKey(dateKey);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatDayNavLabel(dateKey) {
  const date = parseDateKey(dateKey);
  const todayKey = getTodayKey();
  const dateLabel = formatDayLabel(dateKey);
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
    .format(date)
    .replace(".", "");

  if (dateKey === todayKey) {
    return `Сегодня, ${dateLabel}, ${weekday}`;
  }

  if (dateKey === addDays(todayKey, 1)) {
    return `Завтра, ${dateLabel}, ${weekday}`;
  }

  if (dateKey === addDays(todayKey, -1)) {
    return `Вчера, ${dateLabel}, ${weekday}`;
  }

  return `${dateLabel}, ${weekday}`;
}

function getSuccessClass(percent) {
  if (percent < 50) {
    return "is-low";
  }

  if (percent <= 80) {
    return "is-mid";
  }

  return "is-high";
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return getDateKey(new Date());
}

function getHistoryItem(dateKey) {
  return history.find((item) => item.dateKey === dateKey);
}

function isDayClosed(dateKey) {
  return Boolean(getHistoryItem(dateKey));
}

function isActiveDayClosed() {
  return isDayClosed(activeDayKey);
}

function getEditableTasksForDay(dateKey) {
  return tasks.filter((task) => task.dateKey === dateKey);
}

function getRenderableTasksForActiveDay() {
  const closedItem = getHistoryItem(activeDayKey);
  return closedItem ? closedItem.archivedTasks : getEditableTasksForDay(activeDayKey);
}

function chooseActiveDayKey(preferredDayKey) {
  const normalizedPreferred = normalizeDateKey(preferredDayKey);
  const todayKey = getTodayKey();

  if (
    normalizedPreferred &&
    (compareDateKeys(normalizedPreferred, todayKey) >= 0 ||
      getEditableTasksForDay(normalizedPreferred).length > 0 ||
      isDayClosed(normalizedPreferred))
  ) {
    return normalizedPreferred;
  }

  if (getEditableTasksForDay(todayKey).length > 0 || isDayClosed(todayKey)) {
    return todayKey;
  }

  const nearestOpenTask = tasks
    .filter((task) => compareDateKeys(task.dateKey, todayKey) >= 0)
    .sort((left, right) => compareDateKeys(left.dateKey, right.dateKey))[0];

  if (nearestOpenTask) {
    return nearestOpenTask.dateKey;
  }

  const latestUnclosedPastTask = tasks
    .filter((task) => !isDayClosed(task.dateKey) && compareDateKeys(task.dateKey, todayKey) < 0)
    .sort((left, right) => compareDateKeys(right.dateKey, left.dateKey))[0];

  if (latestUnclosedPastTask) {
    return latestUnclosedPastTask.dateKey;
  }

  const nearestClosedDay = history
    .filter((item) => compareDateKeys(item.dateKey, todayKey) >= 0)
    .sort((left, right) => compareDateKeys(left.dateKey, right.dateKey))[0];

  return nearestClosedDay?.dateKey || todayKey;
}

function setActiveDayKey(dateKey) {
  const normalized = normalizeDateKey(dateKey);

  if (!normalized) {
    return;
  }

  activeDayKey = normalized;
  syncStatsMonthToActiveDay();
  saveActiveDayKey();
  hideDayReview();
  render();
}

function renderDaySwitcher() {
  activeDayTitle.textContent = formatDayNavLabel(activeDayKey);
  dayPicker.value = activeDayKey;
  dayPrevButton.disabled = false;
  dayNextButton.disabled = false;
}

function setComposerExpanded(expanded, { focus = false } = {}) {
  composerExpanded = Boolean(expanded);
  form.classList.toggle("is-expanded", composerExpanded);
  form.classList.toggle("is-collapsed", !composerExpanded);
  form.setAttribute("aria-expanded", String(composerExpanded));
  taskControls.classList.toggle("is-composer-open", composerExpanded);
  composerClose.hidden = true;
  composerSubmit.setAttribute("aria-label", "Добавить задачу");
  composerSubmit.hidden = !composerExpanded;
  updateComposerSubmitState();
  input.tabIndex = composerExpanded ? 0 : -1;

  if (composerExpanded && focus) {
    input.focus();
  }
}

function getClosedDayWord(count) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "закрытых дней";
  }

  if (last === 1) {
    return "закрытый день";
  }

  if (last >= 2 && last <= 4) {
    return "закрытых дня";
  }

  return "закрытых дней";
}

function normalizeTaskNote(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 240);
}

function normalizeTaskTitle(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 90);
}

function normalizeRecurringTime(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : "";
}

function normalizeDueAt(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function splitDueAt(dueAt) {
  const normalized = normalizeDueAt(dueAt);

  if (!normalized) {
    return { date: "", time: "" };
  }

  const [date, time = ""] = normalized.split("T");
  return { date, time };
}

function formatDueAt(dueAt) {
  const { date, time } = splitDueAt(dueAt);

  if (!date) {
    return "Установить срок";
  }

  const [year, month, day] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  })
    .format(new Date(year, month - 1, day))
    .replace(".", "");

  return time ? `до ${label} · ${time}` : `до ${label}`;
}

function getDueSortValue(dueAt) {
  const { date, time } = splitDueAt(dueAt);

  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hours = 0, minutes = 0] = time ? time.split(":").map(Number) : [];
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

function createDueEditor(task) {
  const { date, time } = splitDueAt(task.dueAt);
  const editor = document.createElement("div");
  editor.className = "task-due-editor";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = date;
  dateInput.setAttribute("aria-label", "Дата срока");

  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.value = time;
  timeInput.setAttribute("aria-label", "Время срока, необязательно");

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "task-due-save";
  saveButton.textContent = "Ок";
  saveButton.addEventListener("click", () => {
    if (!dateInput.value) {
      dateInput.focus();
      return;
    }

    setTaskDueAt(task.id, timeInput.value ? `${dateInput.value}T${timeInput.value}` : dateInput.value);
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "task-due-clear";
  clearButton.textContent = "Сброс";
  clearButton.addEventListener("click", () => {
    setTaskDueAt(task.id, null);
  });

  editor.append(dateInput, timeInput, saveButton, clearButton);
  window.setTimeout(() => dateInput.focus(), 0);

  return editor;
}

function createTaskNoteEditor(task) {
  const editor = document.createElement("div");
  editor.className = "task-note-editor";

  const noteInput = document.createElement("textarea");
  noteInput.value = task.note || "";
  noteInput.rows = 2;
  noteInput.maxLength = 240;
  noteInput.placeholder = "Детали, шаги или мысль к задаче";
  noteInput.setAttribute("aria-label", "Заметка к задаче");

  const actions = document.createElement("div");
  actions.className = "task-note-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "task-note-save";
  saveButton.textContent = "Сохранить";
  saveButton.addEventListener("click", () => {
    setTaskNote(task.id, noteInput.value);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "task-note-cancel";
  cancelButton.textContent = "Отмена";
  cancelButton.addEventListener("click", () => {
    editingNoteTaskId = null;
    render();
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "task-note-clear";
  clearButton.textContent = "Убрать";
  clearButton.hidden = !task.note;
  clearButton.addEventListener("click", () => {
    setTaskNote(task.id, "");
  });

  actions.append(saveButton, cancelButton, clearButton);
  editor.append(noteInput, actions);
  window.setTimeout(() => noteInput.focus(), 0);

  return editor;
}

function getVisibleTasks() {
  const dayTasks = getRenderableTasksForActiveDay();
  return dayTasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const doneDelta = Number(left.task.done) - Number(right.task.done);
      const priorityDelta = getPriorityRank(right.task.priority) - getPriorityRank(left.task.priority);
      const dueDelta = getDueSortValue(left.task.dueAt) - getDueSortValue(right.task.dueAt);
      return doneDelta || priorityDelta || dueDelta || left.index - right.index;
    })
    .map((item) => item.task);
}

function ensureRecurringTasksForDay(dateKey) {
  if (isDayClosed(dateKey)) {
    return false;
  }

  if (!isWorkday(dateKey)) {
    return false;
  }

  let didCreate = false;

  for (const recurring of recurringTasks) {
    if (!recurring.isActive || !recurring.title) {
      continue;
    }

    const alreadyExists = tasks.some(
      (task) => task.dateKey === dateKey && task.recurringId === recurring.id,
    );

    if (alreadyExists) {
      continue;
    }

    tasks.push({
      id: crypto.randomUUID(),
      title: recurring.title,
      view: "now",
      done: false,
      completedFrom: null,
      priority: "medium",
      dueAt: recurring.time ? `${dateKey}T${recurring.time}` : null,
      note: "",
      recurringId: recurring.id,
      dateKey,
    });
    didCreate = true;
  }

  if (didCreate) {
    saveTasks();
  }

  return didCreate;
}

function renderRecurringTasks() {
  if (!recurringList) {
    return;
  }

  const activeCount = recurringTasks.filter((item) => item.isActive).length;
  recurringCount.textContent = `${activeCount} активных`;
  recurringList.innerHTML = "";
  recurringEmpty.hidden = recurringTasks.length > 0;

  for (const item of recurringTasks) {
    const row = document.createElement("li");
    row.className = `recurring-item${item.isActive ? "" : " is-paused"}`;

    const copy = document.createElement("div");
    copy.className = "recurring-copy";

    const title = document.createElement("strong");
    title.textContent = item.title;
    copy.append(title);

    const meta = document.createElement("span");
    const recurringScope = workdaysMode === "everyday" ? "Каждый день" : "Рабочие дни";
    meta.textContent = item.time ? `${recurringScope} · ${item.time}` : recurringScope;
    copy.append(meta);

    const toggle = document.createElement("button");
    toggle.className = "recurring-toggle";
    toggle.type = "button";
    toggle.textContent = item.isActive ? "Включено" : "Выключено";
    toggle.setAttribute(
      "aria-label",
      item.isActive ? "Отключить регулярную задачу" : "Включить регулярную задачу",
    );
    toggle.addEventListener("click", () => toggleRecurringTask(item.id));

    const remove = document.createElement("button");
    remove.className = "recurring-delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Удалить регулярную задачу");
    remove.addEventListener("click", () => deleteRecurringTask(item.id));

    row.append(copy, toggle, remove);
    recurringList.append(row);
  }
}

function addTask(title) {
  if (isActiveDayClosed()) {
    return;
  }

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    view: "now",
    done: false,
    completedFrom: null,
    priority: "medium",
    dueAt: null,
    note: "",
    recurringId: null,
    dateKey: activeDayKey,
  });
  saveTasks();
  render();
}

function addRecurringTask(title, time) {
  const normalizedTitle = normalizeTaskTitle(title);

  if (!normalizedTitle) {
    recurringTitle.focus();
    return;
  }

  recurringTasks.push({
    id: crypto.randomUUID(),
    title: normalizedTitle,
    time: normalizeRecurringTime(time),
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  saveRecurringTasks();
  ensureRecurringTasksForDay(activeDayKey);
  render();
}

function toggleRecurringTask(id) {
  recurringTasks = recurringTasks.map((item) =>
    item.id === id ? { ...item, isActive: !item.isActive } : item,
  );
  saveRecurringTasks();
  ensureRecurringTasksForDay(activeDayKey);
  render();
}

function deleteRecurringTask(id) {
  recurringTasks = recurringTasks.filter((item) => item.id !== id);
  saveRecurringTasks();
  render();
}

function getPriorityRank(priority) {
  return priority === "high" ? 1 : 0;
}

function togglePriority(id) {
  if (isActiveDayClosed()) {
    return;
  }

  tasks = tasks.map((task) =>
    task.id === id
      ? { ...task, priority: task.priority === "high" ? "medium" : "high" }
      : task,
  );
  saveTasks();
  render();
}

function setTaskDueAt(id, dueAt) {
  if (isActiveDayClosed()) {
    return;
  }

  tasks = tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          dueAt: normalizeDueAt(dueAt),
        }
      : task,
  );
  editingDueTaskId = null;
  saveTasks();
  render();
}

function setTaskNote(id, note) {
  if (isActiveDayClosed()) {
    return;
  }

  tasks = tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          note: normalizeTaskNote(note),
        }
      : task,
  );
  editingNoteTaskId = null;
  saveTasks();
  render();
}

function toggleTask(id) {
  let toggledTask = null;
  tasks = tasks.map((task) => {
    if (task.id !== id) {
      return task;
    }

    toggledTask = task.done
      ? { ...task, done: false, completedFrom: null }
      : { ...task, done: true, completedFrom: task.view };
    return toggledTask;
  });

  if (toggledTask?.done) {
    tasks = [...tasks.filter((task) => task.id !== id), toggledTask];
  }

  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function closeDay() {
  const stats = getActiveDayStats();

  if (stats.total === 0 || isActiveDayClosed()) {
    return;
  }

  if (dayReview.hidden) {
    showDayReview();
    return;
  }

  const dayGoalTasks = getActiveDayGoalTasks().map((task) => ({
    ...task,
    view: "now",
    dateKey: activeDayKey,
  }));
  const rating = selectedDayRating || null;
  const note = dayNote.value.trim();
  const nextDayKey = getNextWorkdayKey(activeDayKey);

  history = history.filter((item) => item.dateKey !== activeDayKey);
  history.unshift({
    id: crypto.randomUUID(),
    date: parseDateKey(activeDayKey).toISOString(),
    dateKey: activeDayKey,
    rating,
    note,
    archivedTasks: dayGoalTasks,
    ...stats,
  });
  history = history.slice(0, 30);

  tasks = tasks
    .filter((task) => !(task.dateKey === activeDayKey && task.done))
    .map((task) => {
      if (task.dateKey !== activeDayKey) {
        return task;
      }

      return {
        ...task,
        dateKey: nextDayKey,
        view: "now",
        completedFrom: null,
        recurringId: null,
      };
    });

  if (compareDateKeys(activeDayKey, getTodayKey()) < 0) {
    activeDayKey = getTodayKey();
  }
  syncStatsMonthToActiveDay();
  dayNote.value = "";
  saveActiveDayKey();
  saveTasks();
  saveHistory();
  hideDayReview();
  render();
}

function showDayReview() {
  dayReview.hidden = false;
  closeDayButton.hidden = true;
  for (const button of dayRatingButtons) {
    button.disabled = false;
  }
  setDayRating(selectedDayRating);
  dayNote.disabled = false;
  dayNote.focus();
}

function hideDayReview() {
  dayReview.hidden = true;
  closeDayButton.hidden = false;
}

function setDayRating(rating) {
  selectedDayRating = Number(rating) || 4;

  for (const button of dayRatingButtons) {
    const buttonRating = Number(button.dataset.rating);
    const isActive = buttonRating === selectedDayRating;
    const isFilled = buttonRating <= selectedDayRating;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-filled", isFilled);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function undoCloseDay(historyId) {
  const item = history.find((entry) => entry.id === historyId);

  if (!item) {
    return;
  }

  const confirmed = window.confirm("Отменить закрытие дня и вернуть задачи в выбранную дату?");

  if (!confirmed) {
    return;
  }

  const archivedIds = new Set(item.archivedTasks.map((task) => task.id));
  const restoredTasks = item.archivedTasks.map((task) => ({
    ...task,
    dateKey: item.dateKey,
    view: "now",
    completedFrom: task.done ? "now" : null,
  }));

  tasks = [...restoredTasks, ...tasks.filter((task) => !archivedIds.has(task.id))];
  history = history.filter((entry) => entry.id !== historyId);

  activeDayKey = item.dateKey;
  syncStatsMonthToActiveDay();
  saveActiveDayKey();
  saveTasks();
  saveHistory();
  render();
}

function wireDragEvents(item, task) {
  item.addEventListener("pointerdown", (event) => startPointerDrag(event, item, task));

  item.addEventListener("dragstart", (event) => {
    if (task.done) {
      event.preventDefault();
      return;
    }

    draggedTaskId = task.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    item.classList.add("is-dragging");
  });

  item.addEventListener("dragend", () => {
    draggedTaskId = null;
    clearDropHints({ includeDragging: true });
  });
}

function startPointerDrag(event, item, task) {
  if (task.done || event.target.closest("button, input, textarea")) {
    return;
  }

  pointerDrag = {
    id: task.id,
    item,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  };
  item.setPointerCapture?.(event.pointerId);
}

function moveTask(taskId, beforeId = null) {
  const movingTask = tasks.find((task) => task.id === taskId);

  if (
    !movingTask ||
    movingTask.dateKey !== activeDayKey ||
    isActiveDayClosed()
  ) {
    return;
  }

  const remainingTasks = tasks.filter((task) => task.id !== taskId);
  const updatedTask = { ...movingTask, view: "now", done: false, completedFrom: null };
  const insertIndex = beforeId ? remainingTasks.findIndex((task) => task.id === beforeId) : tasks.length;

  if (insertIndex >= 0) {
    remainingTasks.splice(insertIndex, 0, updatedTask);
  } else {
    remainingTasks.push(updatedTask);
  }

  tasks = remainingTasks;
  saveTasks();
  render();
}

function getDropPosition(event) {
  const targetItem = event.target.closest(".task");

  if (!targetItem || !list.contains(targetItem)) {
    return { beforeId: null, targetItem: null };
  }

  const box = targetItem.getBoundingClientRect();
  const isBefore = event.clientY < box.top + box.height / 2;

  if (isBefore) {
    return { beforeId: targetItem.dataset.id, targetItem, placement: "before" };
  }

  const visibleTasks = getVisibleTasks();
  const targetIndex = visibleTasks.findIndex((task) => task.id === targetItem.dataset.id);
  const nextTask = visibleTasks[targetIndex + 1];

  return {
    beforeId: nextTask?.id ?? null,
    targetItem,
    placement: "after",
  };
}

function getDropPositionFromPoint(x, y) {
  const target = document.elementFromPoint(x, y);
  const targetItem = target?.closest(".task");

  if (!targetItem || !list.contains(targetItem)) {
    return { beforeId: null, targetItem: null };
  }

  const box = targetItem.getBoundingClientRect();
  const isBefore = y < box.top + box.height / 2;

  if (isBefore) {
    return { beforeId: targetItem.dataset.id, targetItem, placement: "before" };
  }

  const visibleTasks = getVisibleTasks();
  const targetIndex = visibleTasks.findIndex((task) => task.id === targetItem.dataset.id);
  const nextTask = visibleTasks[targetIndex + 1];

  return {
    beforeId: nextTask?.id ?? null,
    targetItem,
    placement: "after",
  };
}

function clearDropHints({ includeDragging = false } = {}) {
  listShell.classList.remove("is-drop-target");
  list.querySelectorAll(".task").forEach((item) => {
    item.classList.remove("is-drop-before", "is-drop-after");
    if (includeDragging) {
      item.classList.remove("is-dragging");
    }
  });
}

listShell.addEventListener("dragover", (event) => {
  if (!draggedTaskId || isActiveDayClosed()) {
    return;
  }

  event.preventDefault();
  clearDropHints();
  listShell.classList.add("is-drop-target");

  const { targetItem, placement } = getDropPosition(event);
  if (targetItem && targetItem.dataset.id !== draggedTaskId) {
    targetItem.classList.add(placement === "before" ? "is-drop-before" : "is-drop-after");
  }
});

listShell.addEventListener("drop", (event) => {
  if (!draggedTaskId || isActiveDayClosed()) {
    return;
  }

  event.preventDefault();
  const { beforeId } = getDropPosition(event);
  moveTask(draggedTaskId, beforeId === draggedTaskId ? null : beforeId);
});

listShell.addEventListener("dragleave", (event) => {
  if (!listShell.contains(event.relatedTarget)) {
    clearDropHints({ includeDragging: true });
  }
});

document.addEventListener("pointermove", (event) => {
  if (!pointerDrag) {
    return;
  }

  const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
  if (!pointerDrag.active && distance < 6) {
    return;
  }

  pointerDrag.active = true;
  draggedTaskId = pointerDrag.id;
  pointerDrag.item.classList.add("is-dragging");
  event.preventDefault();
  clearDropHints();

  if (isActiveDayClosed()) {
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (target && listShell.contains(target)) {
    listShell.classList.add("is-drop-target");
    const { targetItem, placement } = getDropPositionFromPoint(event.clientX, event.clientY);

    if (targetItem && targetItem.dataset.id !== draggedTaskId) {
      targetItem.classList.add(placement === "before" ? "is-drop-before" : "is-drop-after");
    }
  }
});

document.addEventListener("pointerup", (event) => {
  if (!pointerDrag) {
    return;
  }

  const finishedDrag = pointerDrag;
  pointerDrag = null;

  if (!finishedDrag.active) {
    draggedTaskId = null;
    return;
  }

  event.preventDefault();

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (target && listShell.contains(target) && !isActiveDayClosed()) {
    const { beforeId } = getDropPositionFromPoint(event.clientX, event.clientY);
    moveTask(finishedDrag.id, beforeId === finishedDrag.id ? null : beforeId);
  }

  clearDropHints({ includeDragging: true });
  draggedTaskId = null;
});

document.addEventListener("click", (event) => {
  let shouldRender = false;
  const trendModeButton = event.target.closest("[data-trend-mode]");

  if (trendModeButton) {
    statsTrendMode = trendModeButton.dataset.trendMode === "month" ? "month" : "week";
    render();
    return;
  }

  if (editingDueTaskId && !event.target.closest(".task-due")) {
    editingDueTaskId = null;
    shouldRender = true;
  }

  if (
    editingNoteTaskId &&
    !event.target.closest(".task-note-editor, .task-note-preview, .task-note-bubble")
  ) {
    editingNoteTaskId = null;
    shouldRender = true;
  }

  if (composerExpanded && !input.value.trim() && !event.target.closest("#task-form")) {
    setComposerExpanded(false);
  }

  if (shouldRender) {
    render();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!composerExpanded) {
    setComposerExpanded(true, { focus: true });
    return;
  }

  const title = input.value.trim();

  if (!title) {
    input.focus();
    return;
  }

  addTask(title);
  input.value = "";
  composerSubmit.hidden = true;
  composerSubmit.disabled = true;
  setComposerExpanded(false);
});

input.addEventListener("input", () => {
  updateComposerSubmitState();
});

recurringForm.addEventListener("submit", (event) => {
  event.preventDefault();

  addRecurringTask(recurringTitle.value, recurringTime.value);
  recurringTitle.value = "";
  recurringTime.value = "";
  recurringTitle.focus();
});

composerClose.addEventListener("click", () => {
  input.value = "";
  composerSubmit.hidden = true;
  composerSubmit.disabled = true;
  setComposerExpanded(false);
});

composerOpen.addEventListener("click", () => {
  if (isActiveDayClosed()) {
    return;
  }

  setComposerExpanded(true, { focus: true });
});

for (const tab of sectionTabs) {
  tab.addEventListener("click", () => {
    switchSection(tab.dataset.section);
  });
}

dayPrevButton.addEventListener("click", () => {
  setActiveDayKey(addDays(activeDayKey, -1));
});

dayNextButton.addEventListener("click", () => {
  setActiveDayKey(addDays(activeDayKey, 1));
});

dayDateButton.addEventListener("click", () => {
  if (typeof dayPicker.showPicker === "function") {
    dayPicker.showPicker();
    return;
  }

  dayPicker.click();
  dayPicker.focus();
});

dayPicker.addEventListener("change", () => {
  setActiveDayKey(dayPicker.value);
});

statsMonthPrev.addEventListener("click", () => {
  setStatsMonthDate(addMonths(statsMonthDate, -1));
});

statsMonthNext.addEventListener("click", () => {
  setStatsMonthDate(addMonths(statsMonthDate, 1));
});

closeDayButton.addEventListener("click", closeDay);

dayReviewSubmit.addEventListener("click", closeDay);

dayReviewCancel.addEventListener("click", () => {
  hideDayReview();
});

for (const button of dayRatingButtons) {
  button.addEventListener("click", () => {
    setDayRating(button.dataset.rating);
  });
}

authLogout.addEventListener("click", () => {
  signOut();
});

themeToggle.addEventListener("change", () => {
  setTheme(themeToggle.checked ? "dark" : "light");
});

for (const button of workdaysModeButtons) {
  button.addEventListener("click", () => {
    setWorkdaysMode(button.dataset.workdaysMode);
  });
}

setComposerExpanded(false);
setDayRating(selectedDayRating);
switchSection(currentSection);
initializeAuth().catch((error) => {
  setAuthStatus(`Не удалось запустить приложение: ${getErrorMessage(error)}`);
  renderSafely();
  finishBootLoading();
});
