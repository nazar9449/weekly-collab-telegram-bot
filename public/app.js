const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  telegramUser: null,
  tasks: [],
  user: null,
  weekKey: "",
  summary: null
};

const els = {
  weekChip: document.getElementById("weekChip"),
  heroMeta: document.getElementById("heroMeta"),
  statTotal: document.getElementById("statTotal"),
  statDone: document.getElementById("statDone"),
  statAvg: document.getElementById("statAvg"),
  planInput: document.getElementById("planInput"),
  replacePlanBtn: document.getElementById("replacePlanBtn"),
  quickTaskInput: document.getElementById("quickTaskInput"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  tasksList: document.getElementById("tasksList"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  joinBtn: document.getElementById("joinBtn"),
  teamList: document.getElementById("teamList"),
  profileInfo: document.getElementById("profileInfo"),
  nameInput: document.getElementById("nameInput"),
  saveNameBtn: document.getElementById("saveNameBtn"),
  inviteCode: document.getElementById("inviteCode"),
  toast: document.getElementById("toast")
};

function parseUserFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const tgId = params.get("tgId");
  if (!tgId) {
    return null;
  }
  return {
    id: String(tgId),
    first_name: params.get("first_name") || "Local",
    last_name: params.get("last_name") || "Tester",
    username: params.get("username") || null
  };
}

function getTelegramUser() {
  const liveUser = tg?.initDataUnsafe?.user;
  if (liveUser?.id) {
    return liveUser;
  }
  return parseUserFromQuery();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 1700);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.headers || {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function renderStats() {
  const summary = state.summary || { total: 0, done: 0, avg: 0 };
  els.statTotal.textContent = summary.total;
  els.statDone.textContent = summary.done;
  els.statAvg.textContent = `${summary.avg}%`;
}

function renderHeader() {
  const user = state.user;
  els.weekChip.textContent = `Week ${state.weekKey || "--"}`;
  if (!user) {
    els.heroMeta.textContent = "Loading your planner...";
    return;
  }
  els.heroMeta.textContent = `${user.display_name} - ${user.team_name}`;
  els.profileInfo.textContent = `Team: ${user.team_name}`;
  els.inviteCode.textContent = user.invite_code;
  els.nameInput.value = user.display_name;
}

function renderTasks() {
  if (!state.tasks.length) {
    els.tasksList.innerHTML =
      '<div class="card"><p class="muted">No tasks for this week yet. Add one above.</p></div>';
    return;
  }
  els.tasksList.innerHTML = state.tasks
    .map((task) => {
      const points = [0, 25, 50, 75, 100];
      const chips = points
        .map(
          (value) =>
            `<button class="chip ${value === Number(task.progress) ? "is-active" : ""}" data-action="progress" data-id="${task.id}" data-progress="${value}">${value}%</button>`
        )
        .join("");
      return `
        <article class="task-card">
          <div class="task-head">
            <div class="task-title">${task.title}</div>
            <div class="task-progress">${task.progress}%</div>
          </div>
          <div class="progress-grid">${chips}</div>
          <button class="danger-link" data-action="delete" data-id="${task.id}">Delete task</button>
        </article>
      `;
    })
    .join("");
}

async function refreshTeam() {
  const data = await api("/api/team", {
    method: "POST",
    body: { telegramUser: state.telegramUser }
  });
  const rows = data.rows || [];
  if (!rows.length) {
    els.teamList.innerHTML = '<p class="muted">No team progress yet.</p>';
    return;
  }
  els.teamList.innerHTML = rows
    .map((row, idx) => {
      const avg = Math.round(Number(row.avg_progress) || 0);
      return `<div class="team-row"><span>${idx + 1}. ${row.display_name}</span><span>${avg}% - ${row.total_tasks} tasks</span></div>`;
    })
    .join("");
}

function recomputeSummary() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => Number(task.progress) >= 100).length;
  const avg = total
    ? Math.round(state.tasks.reduce((sum, task) => sum + Number(task.progress), 0) / total)
    : 0;
  state.summary = { total, done, avg };
}

function rerenderAll() {
  recomputeSummary();
  renderHeader();
  renderStats();
  renderTasks();
}

async function bootstrap() {
  state.telegramUser = getTelegramUser();
  if (!state.telegramUser?.id) {
    showToast("Open this app from Telegram bot chat.");
    return;
  }
  const data = await api("/api/bootstrap", {
    method: "POST",
    body: { telegramUser: state.telegramUser }
  });
  state.user = data.user;
  state.tasks = data.tasks || [];
  state.weekKey = data.weekKey;
  state.summary = data.summary;
  rerenderAll();
  await refreshTeam();
}

els.replacePlanBtn.addEventListener("click", async () => {
  const lines = els.planInput.value.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!lines.length) {
    showToast("Add at least one line.");
    return;
  }
  const res = await api("/api/tasks/replace-week", {
    method: "POST",
    body: { telegramUser: state.telegramUser, lines }
  });
  state.tasks = res.tasks || [];
  rerenderAll();
  await refreshTeam();
  showToast("Week plan saved.");
  els.planInput.value = "";
});

els.addTaskBtn.addEventListener("click", async () => {
  const title = els.quickTaskInput.value.trim();
  if (!title) {
    return;
  }
  const res = await api("/api/tasks", {
    method: "POST",
    body: { telegramUser: state.telegramUser, title }
  });
  state.tasks = res.tasks || [];
  rerenderAll();
  await refreshTeam();
  els.quickTaskInput.value = "";
  showToast("Task added.");
});

els.tasksList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (!id || !action) {
    return;
  }

  if (action === "delete") {
    const res = await api(`/api/tasks/${id}`, {
      method: "DELETE",
      body: { telegramUser: state.telegramUser }
    });
    state.tasks = res.tasks || [];
    rerenderAll();
    await refreshTeam();
    showToast("Task deleted.");
    return;
  }

  if (action === "progress") {
    const progress = Number(button.dataset.progress || 0);
    const res = await api(`/api/tasks/${id}/progress`, {
      method: "PATCH",
      body: { telegramUser: state.telegramUser, progress }
    });
    state.tasks = res.tasks || [];
    rerenderAll();
    await refreshTeam();
  }
});

els.joinBtn.addEventListener("click", async () => {
  const code = els.joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    return;
  }
  const res = await api("/api/join", {
    method: "POST",
    body: { telegramUser: state.telegramUser, code }
  });
  await bootstrap();
  showToast(res.message || "Joined team.");
  els.joinCodeInput.value = "";
});

els.saveNameBtn.addEventListener("click", async () => {
  const name = els.nameInput.value.trim();
  if (!name) {
    return;
  }
  await api("/api/name", {
    method: "POST",
    body: { telegramUser: state.telegramUser, name }
  });
  await bootstrap();
  showToast("Name updated.");
});

document.querySelectorAll(".tab").forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("is-active"));
    tabButton.classList.add("is-active");
    const tab = tabButton.dataset.tab;
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("is-visible"));
    document.getElementById(`panel-${tab}`).classList.add("is-visible");
  });
});

bootstrap().catch((error) => {
  console.error(error);
  showToast(error.message || "Failed to load app.");
});
