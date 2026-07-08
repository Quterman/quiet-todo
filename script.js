const STORAGE_KEY = "quiet-todo.tasks";
const HISTORY_KEY = "quiet-todo.history";
const SUPABASE_URL = "https://krpibyzyrxvppkxetsul.supabase.co";
const SUPABASE_KEY = "sb_publishable_e94wFEishOZxkBVOd5BAow_F8ffHEBs";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
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
  },
  {
    id: crypto.randomUUID(),
    title: "Перекинуть что-то неважное в “Позже”",
    view: "later",
    done: false,
    completedFrom: null,
  },
  {
    id: crypto.randomUUID(),
    title: "Оставить место для дня без героизма",
    view: "soft",
    done: false,
    completedFrom: null,
  },
];

const views = {
  now: "Сегодня",
  later: "Позже",
  soft: "Когда будут силы",
  done: "Выполнено",
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
const historyCount = document.querySelector("#history-count");
const historyList = document.querySelector("#history-list");
const weekSummary = document.querySelector("#week-summary");
const authPanel = document.querySelector(".auth-panel");
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSignup = document.querySelector("#auth-signup");
const authLogout = document.querySelector("#auth-logout");
const authTitle = document.querySelector("#auth-title");
const authStatus = document.querySelector("#auth-status");
const tabs = Array.from(document.querySelectorAll(".tab"));

let currentView = "now";
let tasks = loadTasks();
let history = loadHistory();
let draggedTaskId = null;
let pointerDrag = null;
let composerExpanded = false;
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

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "Без названия",
    view: views[task.view] ? task.view : "now",
    done: Boolean(task.done),
    completedFrom: task.completedFrom || (task.done ? task.view : null),
  };
}

function normalizeHistoryItem(item) {
  const date = item.date || new Date().toISOString();

  return {
    id: item.id || crypto.randomUUID(),
    date,
    dateKey: item.dateKey || getDateKey(new Date(date)),
    total: Number(item.total) || 0,
    completed: Number(item.completed) || 0,
    moved: Number(item.moved) || 0,
    percent: Number(item.percent) || 0,
    archivedTasks: Array.isArray(item.archivedTasks)
      ? item.archivedTasks.map((task) => normalizeTask(task))
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
    archived_tasks: item.archivedTasks,
    created_at: item.date,
  }));

  const tasksDelete = await supabaseClient.from("tasks").delete().eq("user_id", userId);
  if (tasksDelete.error) {
    setAuthStatus(`Ошибка сохранения задач: ${tasksDelete.error.message}`);
    return;
  }

  if (taskRows.length > 0) {
    const tasksInsert = await supabaseClient.from("tasks").insert(taskRows);
    if (tasksInsert.error) {
      setAuthStatus(`Ошибка сохранения задач: ${tasksInsert.error.message}`);
      return;
    }
  }

  const historyDelete = await supabaseClient.from("day_history").delete().eq("user_id", userId);
  if (historyDelete.error) {
    setAuthStatus(`Ошибка сохранения истории: ${historyDelete.error.message}`);
    return;
  }

  if (historyRows.length > 0) {
    const historyInsert = await supabaseClient.from("day_history").insert(historyRows);
    if (historyInsert.error) {
      setAuthStatus(`Ошибка сохранения истории: ${historyInsert.error.message}`);
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
      archivedTasks: row.archived_tasks,
    }),
  );

  isLoadingCloudData = false;
  setAuthStatus("Данные загружены из Supabase");
  switchView(currentView);
}

function setAuthStatus(text) {
  authStatus.textContent = text;
}

function updateAuthUi() {
  authPanel.classList.toggle("is-signed-in", Boolean(currentUser));
  authForm.hidden = Boolean(currentUser);
  authLogout.hidden = !currentUser;
  authTitle.textContent = currentUser ? currentUser.email : "Локальный режим";
  authStatus.textContent = currentUser
    ? "Задачи сохраняются в Supabase"
    : "Войди, чтобы хранить задачи в Supabase";
}

async function signIn() {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password || !supabaseClient) {
    return;
  }

  setAuthStatus("Вхожу...");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    setAuthStatus(`Не получилось войти: ${error.message}`);
    return;
  }

  currentUser = data.user;
  updateAuthUi();
  await loadCloudData();
}

async function signUp() {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password || !supabaseClient) {
    return;
  }

  setAuthStatus("Создаю аккаунт...");
  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    setAuthStatus(`Не получилось создать аккаунт: ${error.message}`);
    return;
  }

  if (data.session) {
    currentUser = data.user;
    updateAuthUi();
    await loadCloudData();
    return;
  }

  setAuthStatus("Проверь почту и подтверди регистрацию");
}

async function signOut() {
  if (!supabaseClient) {
    return;
  }

  await supabaseClient.auth.signOut();
  currentUser = null;
  tasks = loadTasks();
  history = loadHistory();
  updateAuthUi();
  switchView("now");
}

async function initializeAuth() {
  if (!supabaseClient) {
    setAuthStatus("Supabase не загрузился, работаем локально");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user ?? null;
  updateAuthUi();

  if (currentUser) {
    await loadCloudData();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const previousUserId = currentUser?.id;
    currentUser = session?.user ?? null;
    updateAuthUi();

    if (currentUser && currentUser.id !== previousUserId) {
      loadCloudData();
    }
  });
}

function render() {
  const visibleTasks = getVisibleTasks();
  const todayActiveTasks = tasks.filter((task) => task.view === "now" && !task.done).length;

  if (openCount) {
    openCount.textContent = todayActiveTasks;
  }
  updateProgress();
  renderHistory();
  list.innerHTML = "";
  emptyState.hidden = visibleTasks.length > 0;

  for (const task of visibleTasks) {
    const item = document.createElement("li");
    item.className = `task${task.done ? " is-done" : ""}`;
    item.dataset.id = task.id;
    item.draggable = !task.done && currentView !== "done";

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.setAttribute("aria-label", task.done ? "Вернуть задачу" : "Отметить выполненной");
    check.textContent = "✓";
    check.addEventListener("click", () => toggleTask(task.id));

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.setAttribute("aria-label", "Удалить задачу");
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(check, title, remove);
    wireDragEvents(item, task);
    list.append(item);
  }
}

function updateProgress() {
  const todayGoalTasks = getTodayGoalTasks();
  const doneTodayTasks = todayGoalTasks.filter((task) => task.done);
  const todayClosed = isTodayClosed();
  const progress =
    todayGoalTasks.length === 0
      ? 0
      : Math.round((doneTodayTasks.length / todayGoalTasks.length) * 100);

  progressFill.style.setProperty("--progress", `${progress}%`);
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressLabel.textContent = `${progress}%`;
  progressDetail.textContent =
    todayClosed
      ? "День закрыт. Отмени закрытие в истории, чтобы продолжить"
      : todayGoalTasks.length === 0
      ? "Добавь задачу в “Сегодня”, и шкала оживёт"
      : `${doneTodayTasks.length} из ${todayGoalTasks.length} на сегодня завершено`;
  closeDayButton.disabled = todayGoalTasks.length === 0 || todayClosed;
  closeDayButton.textContent = todayClosed ? "День закрыт" : "Закрыть день";
}

function getTodayGoalTasks() {
  return tasks.filter((task) => task.view === "now" || task.completedFrom === "now");
}

function getTodayStats() {
  const todayGoalTasks = getTodayGoalTasks();
  const doneTodayTasks = todayGoalTasks.filter((task) => task.done);

  return {
    total: todayGoalTasks.length,
    completed: doneTodayTasks.length,
    moved: todayGoalTasks.length - doneTodayTasks.length,
    percent:
      todayGoalTasks.length === 0
        ? 0
        : Math.round((doneTodayTasks.length / todayGoalTasks.length) * 100),
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

    if (item) {
      const progress = document.createElement("span");
      progress.className = "calendar-progress";
      progress.style.setProperty("--day-progress", `${item.percent}%`);

      const result = document.createElement("strong");
      result.className = "calendar-result";
      result.textContent = `${item.completed}/${item.total}`;

      const percent = document.createElement("span");
      percent.className = "calendar-percent";
      percent.textContent = `${item.percent}%`;

      progress.append(result);
      historyItem.append(progress, percent);
    } else {
      const empty = document.createElement("span");
      empty.className = "calendar-empty";
      empty.textContent = "—";
      historyItem.append(empty);
    }

    if (item && item.dateKey === getTodayKey()) {
      const undo = document.createElement("button");
      undo.className = "history-undo";
      undo.type = "button";
      undo.setAttribute("aria-label", "Отменить закрытие сегодняшнего дня");
      undo.textContent = "×";
      undo.addEventListener("click", () => undoCloseDay(item.id));
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

function getTodayHistoryItem() {
  const todayKey = getTodayKey();
  return history.find((item) => item.dateKey === todayKey);
}

function isTodayClosed() {
  return Boolean(getTodayHistoryItem());
}

function setComposerExpanded(expanded, { focus = false } = {}) {
  composerExpanded = expanded;
  form.classList.toggle("is-expanded", expanded);
  form.classList.toggle("is-collapsed", !expanded);
  form.setAttribute("aria-expanded", String(expanded));
  taskControls.classList.toggle("is-composer-open", expanded);
  composerClose.hidden = !expanded;
  composerSubmit.setAttribute(
    "aria-label",
    expanded ? "Добавить задачу" : "Открыть добавление задачи",
  );
  input.tabIndex = expanded ? 0 : -1;

  if (expanded && focus) {
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
  if (currentView === "done") {
    return tasks.filter((task) => task.done);
  }

  return tasks.filter((task) => task.view === currentView);
}

function addTask(title) {
  if (currentView === "now" && isTodayClosed()) {
    return;
  }

  if (currentView === "done") {
    switchView("now");
  }

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    view: currentView === "done" ? "now" : currentView,
    done: false,
    completedFrom: null,
  });
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
  const stats = getTodayStats();

  if (stats.total === 0 || isTodayClosed()) {
    return;
  }

  const todayGoalTasks = getTodayGoalTasks().map((task) => ({ ...task, view: "now" }));
  const confirmed = window.confirm(
    `Закрыть день? Итог: ${stats.completed} из ${stats.total}, ${stats.percent}%. Невыполненные задачи уйдут в “Позже”.`
  );

  if (!confirmed) {
    return;
  }

  history.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    dateKey: getTodayKey(),
    archivedTasks: todayGoalTasks,
    ...stats,
  });
  history = history.slice(0, 30);

  tasks = tasks
    .filter((task) => !(task.view === "now" && task.done))
    .map((task) => {
      if (task.view !== "now") {
        return task;
      }

      return { ...task, view: "later", completedFrom: null };
    });

  currentView = "now";
  saveTasks();
  saveHistory();
  switchView("now");
}

function undoCloseDay(historyId) {
  const item = history.find((entry) => entry.id === historyId);

  if (!item || item.dateKey !== getTodayKey()) {
    return;
  }

  const confirmed = window.confirm("Отменить закрытие дня и вернуть задачи в “Сегодня”?");

  if (!confirmed) {
    return;
  }

  const archivedIds = new Set(item.archivedTasks.map((task) => task.id));
  const restoredTasks = item.archivedTasks.map((task) => ({
    ...task,
    view: "now",
    completedFrom: task.done ? "now" : null,
  }));

  tasks = [...restoredTasks, ...tasks.filter((task) => !archivedIds.has(task.id))];
  history = history.filter((entry) => entry.id !== historyId);

  currentView = "now";
  saveTasks();
  saveHistory();
  switchView("now");
}

function switchView(view) {
  currentView = view;
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
    tab.setAttribute("aria-current", tab.dataset.view === view ? "page" : "false");
  });
  const todayClosed = isTodayClosed();
  const inputLocked = view === "done" || (view === "now" && todayClosed);

  input.disabled = inputLocked;
  composerSubmit.disabled = inputLocked;
  composerClose.disabled = inputLocked;
  form.classList.toggle("is-locked", inputLocked);

  if (inputLocked) {
    setComposerExpanded(false);
  }

  input.placeholder =
    view === "done"
      ? "Выполненные задачи живут отдельно"
      : view === "now" && todayClosed
      ? "Сегодня закрыт. Отмени закрытие в истории"
      : `Добавить в “${views[view]}”`;
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

function moveTask(taskId, nextView, beforeId = null) {
  const movingTask = tasks.find((task) => task.id === taskId);

  if (!movingTask || nextView === "done" || (nextView === "now" && isTodayClosed())) {
    return;
  }

  const remainingTasks = tasks.filter((task) => task.id !== taskId);
  const updatedTask = { ...movingTask, view: nextView, done: false, completedFrom: null };
  const insertIndex = beforeId
    ? remainingTasks.findIndex((task) => task.id === beforeId)
    : findAppendIndex(remainingTasks, nextView);

  if (insertIndex >= 0) {
    remainingTasks.splice(insertIndex, 0, updatedTask);
  } else {
    remainingTasks.push(updatedTask);
  }

  tasks = remainingTasks;
  currentView = nextView;
  saveTasks();
  switchView(nextView);
}

function findAppendIndex(taskList, view) {
  const lastIndexInView = taskList.findLastIndex((task) => task.view === view);
  return lastIndexInView === -1 ? taskList.length : lastIndexInView + 1;
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

function getTabFromPoint(x, y) {
  const target = document.elementFromPoint(x, y);
  const tab = target?.closest(".tab");
  return tab && tab.dataset.view !== "done" && !(tab.dataset.view === "now" && isTodayClosed())
    ? tab
    : null;
}

function clearDropHints({ includeDragging = false } = {}) {
  listShell.classList.remove("is-drop-target");
  tabs.forEach((tab) => tab.classList.remove("is-drop-target"));
  list.querySelectorAll(".task").forEach((item) => {
    item.classList.remove("is-drop-before", "is-drop-after");
    if (includeDragging) {
      item.classList.remove("is-dragging");
    }
  });
}

listShell.addEventListener("dragover", (event) => {
  if (!draggedTaskId || currentView === "done") {
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
  if (!draggedTaskId || currentView === "done") {
    return;
  }

  event.preventDefault();
  const { beforeId } = getDropPosition(event);
  moveTask(draggedTaskId, currentView, beforeId === draggedTaskId ? null : beforeId);
});

listShell.addEventListener("dragleave", (event) => {
  if (!listShell.contains(event.relatedTarget)) {
    clearDropHints({ includeDragging: true });
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("dragover", (event) => {
    if (
      !draggedTaskId ||
      tab.dataset.view === "done" ||
      (tab.dataset.view === "now" && isTodayClosed())
    ) {
      return;
    }

    event.preventDefault();
    tabs.forEach((tabItem) => tabItem.classList.remove("is-drop-target"));
    tab.classList.add("is-drop-target");
  });

  tab.addEventListener("drop", (event) => {
    if (
      !draggedTaskId ||
      tab.dataset.view === "done" ||
      (tab.dataset.view === "now" && isTodayClosed())
    ) {
      return;
    }

    event.preventDefault();
    moveTask(draggedTaskId, tab.dataset.view);
  });
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

  const tab = getTabFromPoint(event.clientX, event.clientY);
  if (tab) {
    tab.classList.add("is-drop-target");
    return;
  }

  if (currentView === "done") {
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
  const tab = getTabFromPoint(event.clientX, event.clientY);

  if (tab) {
    moveTask(finishedDrag.id, tab.dataset.view);
    clearDropHints({ includeDragging: true });
    draggedTaskId = null;
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (target && listShell.contains(target) && currentView !== "done") {
    const { beforeId } = getDropPositionFromPoint(event.clientX, event.clientY);
    moveTask(finishedDrag.id, currentView, beforeId === finishedDrag.id ? null : beforeId);
  }

  clearDropHints({ includeDragging: true });
  draggedTaskId = null;
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
  input.focus();
});

composerClose.addEventListener("click", () => {
  setComposerExpanded(false);
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

closeDayButton.addEventListener("click", closeDay);

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  signIn();
});

authSignup.addEventListener("click", () => {
  signUp();
});

authLogout.addEventListener("click", () => {
  signOut();
});

setComposerExpanded(false);
switchView(currentView);
initializeAuth();
