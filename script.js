const STORAGE_KEY = "quiet-todo.tasks";
const HISTORY_KEY = "quiet-todo.history";
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

const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
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
const tabs = Array.from(document.querySelectorAll(".tab"));

let currentView = "now";
let tasks = loadTasks();
let history = loadHistory();
let draggedTaskId = null;
let pointerDrag = null;

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
  return {
    id: item.id || crypto.randomUUID(),
    date: item.date || new Date().toISOString(),
    total: Number(item.total) || 0,
    completed: Number(item.completed) || 0,
    moved: Number(item.moved) || 0,
    percent: Number(item.percent) || 0,
  };
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function render() {
  const visibleTasks = getVisibleTasks();
  const todayActiveTasks = tasks.filter((task) => task.view === "now" && !task.done).length;

  openCount.textContent = todayActiveTasks;
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
  const progress =
    todayGoalTasks.length === 0
      ? 0
      : Math.round((doneTodayTasks.length / todayGoalTasks.length) * 100);

  progressFill.style.setProperty("--progress", `${progress}%`);
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressLabel.textContent = `${progress}%`;
  progressDetail.textContent =
    todayGoalTasks.length === 0
      ? "Добавь задачу в “Сегодня”, и шкала оживёт"
      : `${doneTodayTasks.length} из ${todayGoalTasks.length} на сегодня завершено`;
  closeDayButton.disabled = todayGoalTasks.length === 0;
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
  historyCount.textContent = `${history.length} ${getDayWord(history.length)}`;
  historyList.innerHTML = "";

  for (const item of history.slice(0, 5)) {
    const historyItem = document.createElement("li");
    historyItem.className = "history-item";

    const title = document.createElement("span");
    title.textContent = formatHistoryDate(item.date);

    const result = document.createElement("strong");
    result.textContent = `${item.completed}/${item.total} · ${item.percent}%`;

    historyItem.append(title, result);
    historyList.append(historyItem);
  }
}

function getDayWord(count) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "дней";
  }

  if (last === 1) {
    return "день";
  }

  if (last >= 2 && last <= 4) {
    return "дня";
  }

  return "дней";
}

function formatHistoryDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

function getVisibleTasks() {
  if (currentView === "done") {
    return tasks.filter((task) => task.done);
  }

  return tasks.filter((task) => task.view === currentView);
}

function addTask(title) {
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

  if (stats.total === 0) {
    return;
  }

  const confirmed = window.confirm(
    `Закрыть день? Итог: ${stats.completed} из ${stats.total}, ${stats.percent}%. Невыполненные задачи уйдут в “Позже”.`
  );

  if (!confirmed) {
    return;
  }

  history.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
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

function switchView(view) {
  currentView = view;
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
    tab.setAttribute("aria-current", tab.dataset.view === view ? "page" : "false");
  });
  input.disabled = view === "done";
  form.querySelector("button").disabled = view === "done";
  input.placeholder = view === "done" ? "Выполненные задачи живут отдельно" : `Добавить в “${views[view]}”`;
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

  if (!movingTask || nextView === "done") {
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
  return tab && tab.dataset.view !== "done" ? tab : null;
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
    if (!draggedTaskId || tab.dataset.view === "done") {
      return;
    }

    event.preventDefault();
    tabs.forEach((tabItem) => tabItem.classList.remove("is-drop-target"));
    tab.classList.add("is-drop-target");
  });

  tab.addEventListener("drop", (event) => {
    if (!draggedTaskId || tab.dataset.view === "done") {
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
  const title = input.value.trim();

  if (!title) {
    input.focus();
    return;
  }

  addTask(title);
  input.value = "";
  input.focus();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

closeDayButton.addEventListener("click", closeDay);

switchView(currentView);
