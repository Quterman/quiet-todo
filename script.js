const STORAGE_KEY = "quiet-todo.tasks";
const HISTORY_KEY = "quiet-todo.history";
const ACTIVE_DAY_KEY = "quiet-todo.active-day";
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
const dayPrevButton = document.querySelector("#day-prev");
const dayNextButton = document.querySelector("#day-next");
const dayReview = document.querySelector("#day-review");
const dayRatingButtons = Array.from(document.querySelectorAll("[data-rating]"));
const dayNote = document.querySelector("#day-note");
const dayReviewSubmit = document.querySelector("#day-review-submit");
const dayReviewCancel = document.querySelector("#day-review-cancel");
const historyCount = document.querySelector("#history-count");
const historyList = document.querySelector("#history-list");
const weekSummary = document.querySelector("#week-summary");
const authPanel = document.querySelector(".auth-panel");
const authLogout = document.querySelector("#auth-logout");
const authTitle = document.querySelector("#auth-title");
const authStatus = document.querySelector("#auth-status");
const sectionTabs = Array.from(document.querySelectorAll(".section-tab"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));

let activeDayKey = loadActiveDayKey();
let tasks = loadTasks();
let history = loadHistory();
activeDayKey = chooseActiveDayKey(activeDayKey);
let draggedTaskId = null;
let pointerDrag = null;
let composerExpanded = true;
let currentSection = "tasks";
let selectedDayRating = 4;
let currentUser = null;
let cloudSaveTimer = null;
let isLoadingCloudData = false;

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

function loadActiveDayKey() {
  const saved = localStorage.getItem(ACTIVE_DAY_KEY);
  return normalizeDateKey(saved) || getTodayKey();
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "Без названия",
    view: views[task.view] ? task.view : "now",
    done: Boolean(task.done),
    completedFrom: task.completedFrom || (task.done ? task.view : null),
    priority: priorities[task.priority] ? task.priority : "medium",
    dateKey: normalizeDateKey(task.dateKey) || getTodayKey(),
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
  const taskRows = tasks.map((task, index) => ({
    id: task.id,
    user_id: userId,
    title: task.title,
    view: task.view,
    done: task.done,
    completed_from: task.completedFrom,
    priority: task.priority,
    date_key: task.dateKey,
    sort_order: index,
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

  if (taskRows.length > 0) {
    const tasksUpsert = await supabaseClient.from("tasks").upsert(taskRows, { onConflict: "id" });
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

  setAuthStatus("Синхронизировано");
}

async function loadCloudData() {
  if (!currentUser || !supabaseClient) {
    return;
  }

  isLoadingCloudData = true;
  setAuthStatus("Загружаю задачи из Supabase...");

  const taskResult = await supabaseClient
    .from("tasks")
    .select("*")
    .order("sort_order", { ascending: true });
  const historyResult = await supabaseClient
    .from("day_history")
    .select("*")
    .order("created_at", { ascending: false });

  if (taskResult.error) {
    setAuthStatus(`Ошибка загрузки задач: ${taskResult.error.message}`);
    isLoadingCloudData = false;
    return;
  }

  if (historyResult.error) {
    setAuthStatus(`Ошибка загрузки истории: ${historyResult.error.message}`);
    isLoadingCloudData = false;
    return;
  }

  tasks = taskResult.data.map((row) =>
    normalizeTask({
      id: row.id,
      title: row.title,
      view: row.view,
      done: row.done,
      completedFrom: row.completed_from,
      priority: row.priority,
      dateKey: row.date_key,
    }),
  );
  history = historyResult.data.map((row) =>
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
  saveActiveDayKey();
  isLoadingCloudData = false;
  setAuthStatus("Данные загружены из Supabase");
  render();
}

function setAuthStatus(text) {
  if (authStatus) {
    authStatus.textContent = text;
  }
}

function updateAuthUi() {
  authPanel.classList.toggle("is-signed-in", Boolean(currentUser));
  authTitle.textContent = currentUser ? currentUser.email : "Нужен вход";
  setAuthStatus(currentUser ? "Supabase" : "Открываю страницу входа");
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
    setAuthStatus("Supabase не загрузился, работаем локально");
    render();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user ?? null;
  updateAuthUi();

  if (!currentUser) {
    window.location.href = loginUrl;
    return;
  }

  await loadCloudData();

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
  renderHistory();
  list.innerHTML = "";
  emptyState.hidden = visibleTasks.length > 0;

  for (const task of visibleTasks) {
    const item = document.createElement("li");
    item.className = `task${task.done ? " is-done" : ""}`;
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
    priority.textContent = task.priority === "high" ? "★" : "☆";
    priority.title =
      task.priority === "high" ? "Снять важность" : "Сделать задачу важной";
    priority.setAttribute(
      "aria-label",
      task.priority === "high" ? "Снять важность" : "Сделать задачу важной",
    );
    priority.addEventListener("click", () => togglePriority(task.id));

    const taskCopy = document.createElement("div");
    taskCopy.className = "task-copy";
    taskCopy.append(title);

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.disabled = dayClosed;
    remove.setAttribute("aria-label", "Удалить задачу");
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(check, taskCopy, priority, remove);
    wireDragEvents(item, task);
    list.append(item);
  }
}

function switchSection(section) {
  currentSection = section === "stats" ? "stats" : "tasks";

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

  progressFill.style.setProperty("--progress", `${progress}%`);
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressLabel.textContent = `${progress}%`;
  progressDetail.textContent =
    dayClosed
      ? "День закрыт. Можно посмотреть задачи и итог"
      : dayGoalTasks.length === 0
      ? "Добавь задачу, и шкала оживёт"
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
  composerSubmit.disabled = inputLocked;
  composerClose.disabled = inputLocked;
  form.classList.toggle("is-locked", inputLocked);

  input.placeholder = inputLocked ? "Этот день уже закрыт" : "Что нужно сделать?";
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
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(today);
  const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekdayOffset = (firstDay.getDay() + 6) % 7;
  const historyByDate = new Map();

  for (const item of history) {
    if (!historyByDate.has(item.dateKey)) {
      historyByDate.set(item.dateKey, item);
    }
  }

  const monthItems = Array.from(historyByDate.values()).filter((item) =>
    item.dateKey.startsWith(monthKey),
  );

  historyCount.textContent = `${capitalize(monthName)} · ${monthItems.length} ${getClosedDayWord(
    monthItems.length,
  )}`;
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
    const historyItem = document.createElement("li");
    historyItem.className = `calendar-day${item ? ` is-closed ${getSuccessClass(item.percent)}` : ""}${
      dateKey === getTodayKey() ? " is-today" : ""
    }${dateKey === activeDayKey ? " is-active" : ""}${
      compareDateKeys(dateKey, getTodayKey()) <= 0 ? " is-selectable" : ""
    }`;
    historyItem.setAttribute(
      "aria-label",
      item
        ? `${dayLabel}: закрыто ${item.completed} из ${item.total}, ${item.percent}%`
        : `${dayLabel}: день не закрыт`,
    );

    const title = document.createElement("span");
    title.className = "calendar-date";
    title.textContent = String(day);
    historyItem.append(title);
    if (compareDateKeys(dateKey, getTodayKey()) <= 0) {
      historyItem.addEventListener("click", () => setActiveDayKey(dateKey));
    }

    if (item) {
      const progress = document.createElement("span");
      progress.className = "calendar-progress";
      progress.style.setProperty("--day-progress", `${item.percent}%`);

      const result = document.createElement("strong");
      result.className = "calendar-result";
      result.textContent = `${item.completed}/${item.total}`;

      const percent = document.createElement("span");
      percent.className = "calendar-percent";
      percent.textContent = item.rating ? `${item.percent}% · ${item.rating}/5` : `${item.percent}%`;

      progress.append(result);
      historyItem.append(progress, percent);
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

  renderWeekSummary(today);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderWeekSummary(date) {
  const stats = getWeekStats(date);
  weekSummary.innerHTML = "";

  const title = document.createElement("span");
  title.className = "week-summary-title";
  title.textContent = "Итог недели";
  weekSummary.append(title);

  if (stats.daysClosed === 0) {
    const empty = document.createElement("p");
    empty.className = "week-summary-empty";
    empty.textContent = "Закрой день, и тут появится ритм недели";
    weekSummary.append(empty);
    return;
  }

  const list = document.createElement("dl");
  list.className = "week-summary-list";

  for (const item of [
    { label: "Дней", value: stats.daysClosed },
    { label: "Задач", value: `${stats.completed}/${stats.total}` },
    { label: "Выполнение", value: `${stats.percent}%` },
  ]) {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");

    term.textContent = item.label;
    value.textContent = item.value;
    group.append(term, value);
    list.append(group);
  }

  weekSummary.append(list);
}

function getWeekStats(date) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const weekItems = history.filter((item) => {
    const itemDate = parseDateKey(item.dateKey);
    return itemDate >= start && itemDate <= end;
  });
  const completed = weekItems.reduce((sum, item) => sum + item.completed, 0);
  const total = weekItems.reduce((sum, item) => sum + item.total, 0);

  return {
    daysClosed: weekItems.length,
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

function formatDayLabel(dateKey) {
  const date = parseDateKey(dateKey);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
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

  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  return getTodayKey();
}

function setActiveDayKey(dateKey) {
  const normalized = normalizeDateKey(dateKey);

  if (!normalized) {
    return;
  }

  activeDayKey = normalized;
  saveActiveDayKey();
  hideDayReview();
  render();
}

function renderDaySwitcher() {
  activeDayTitle.textContent = formatDayLabel(activeDayKey);
  dayPrevButton.disabled = false;
  dayNextButton.disabled = false;
}

function setComposerExpanded(expanded, { focus = false } = {}) {
  composerExpanded = true;
  form.classList.add("is-expanded");
  form.classList.remove("is-collapsed");
  form.setAttribute("aria-expanded", "true");
  taskControls.classList.remove("is-composer-open");
  composerClose.hidden = true;
  composerSubmit.setAttribute("aria-label", "Добавить задачу");
  input.tabIndex = 0;

  if ((expanded || composerExpanded) && focus) {
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

function getVisibleTasks() {
  const dayTasks = getRenderableTasksForActiveDay();
  return dayTasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const priorityDelta = getPriorityRank(right.task.priority) - getPriorityRank(left.task.priority);
      return priorityDelta || left.index - right.index;
    })
    .map((item) => item.task);
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
    dateKey: activeDayKey,
  });
  saveTasks();
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

function toggleTask(id) {
  tasks = tasks.map((task) => {
    if (task.id !== id) {
      return task;
    }

    return task.done
      ? { ...task, done: false, completedFrom: null }
      : { ...task, done: true, completedFrom: task.view };
  });
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
  const nextDayKey = addDays(activeDayKey, 1);

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
      };
    });

  if (compareDateKeys(activeDayKey, getTodayKey()) < 0) {
    activeDayKey = getTodayKey();
  }
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
  if (task.done || event.target.closest("button")) {
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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = input.value.trim();

  if (!title) {
    input.focus();
    return;
  }

  addTask(title);
  input.value = "";
  input.focus();
});

composerClose.addEventListener("click", () => {
  input.value = "";
  input.focus();
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

setComposerExpanded(true);
setDayRating(selectedDayRating);
switchSection(currentSection);
initializeAuth();
