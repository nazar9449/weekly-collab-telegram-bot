const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  initDataRaw: "",
  telegramUser: null,
  tasks: [],
  user: null,
  buddy: null,
  weekKey: "",
  summary: null,
  browserPreview: false,
  needsOnboarding: false,
  suggestedUsername: ""
};

const els = {
  weekChip: document.getElementById("weekChip"),
  heroMeta: document.getElementById("heroMeta"),
  tabs: document.querySelector(".tabs"),
  mainContent: document.getElementById("mainContent"),
  onboardingCard: document.getElementById("onboardingCard"),
  onboardingUsernameInput: document.getElementById("onboardingUsernameInput"),
  onboardingSaveBtn: document.getElementById("onboardingSaveBtn"),
  statTotal: document.getElementById("statTotal"),
  statDone: document.getElementById("statDone"),
  statAvg: document.getElementById("statAvg"),
  statBuddy: document.getElementById("statBuddy"),
  statTeam: document.getElementById("statTeam"),
  planInput: document.getElementById("planInput"),
  replacePlanBtn: document.getElementById("replacePlanBtn"),
  quickTaskInput: document.getElementById("quickTaskInput"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  tasksList: document.getElementById("tasksList"),
  buddyCode: document.getElementById("buddyCode"),
  buddyCodeInput: document.getElementById("buddyCodeInput"),
  buddyJoinBtn: document.getElementById("buddyJoinBtn"),
  buddyStatus: document.getElementById("buddyStatus"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  joinBtn: document.getElementById("joinBtn"),
  teamList: document.getElementById("teamList"),
  profileInfo: document.getElementById("profileInfo"),
  nameInput: document.getElementById("nameInput"),
  saveNameBtn: document.getElementById("saveNameBtn"),
  teamCode: document.getElementById("teamCode"),
  profileBuddyCode: document.getElementById("profileBuddyCode"),
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
  state.initDataRaw = tg?.initData || "";
  const liveUser = tg?.initDataUnsafe?.user;
  if (liveUser?.id) {
    state.browserPreview = false;
    return liveUser;
  }

  const queryUser = parseUserFromQuery();
  if (queryUser?.id) {
    state.browserPreview = true;
    return queryUser;
  }

  state.browserPreview = true;
  return {
    id: "local-preview-user",
    first_name: "Local",
    last_name: "Preview",
    username: null
  };
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 1700);
}

async function api(path, options = {}) {
  const payload = options.body ? { ...options.body } : {};
  if (state.initDataRaw) {
    payload.initData = state.initDataRaw;
  }
  if (state.telegramUser?.id) {
    payload.telegramUser = state.telegramUser;
  }

  const response = await fetch(path, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function humanWeekLabel(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) {
    return `Week ${weekKey || "--"}`;
  }
  return `${match[1]} Week ${Number(match[2])}`;
}

function renderOnboarding() {
  const show = Boolean(state.needsOnboarding);
  els.onboardingCard.classList.toggle("is-hidden", !show);
  els.tabs.classList.toggle("is-hidden", show);
  els.mainContent.classList.toggle("is-hidden", show);
  if (show) {
    els.onboardingUsernameInput.value = state.suggestedUsername || state.user?.display_name || "";
  }
}

function renderStats() {
  const summary = state.summary || { total: 0, done: 0, avg: 0, buddyConnected: 0, teamProgress: 0 };
  els.statTotal.textContent = summary.total;
  els.statDone.textContent = summary.done;
  els.statAvg.textContent = `${summary.avg}%`;
  els.statBuddy.textContent = Number(summary.buddyConnected || 0) === 1 ? "Yes" : "No";
  els.statTeam.textContent = `${summary.teamProgress || 0}%`;
}

function renderHeader() {
  const user = state.user;
  els.weekChip.textContent = humanWeekLabel(state.weekKey);
  if (!user) {
    els.heroMeta.textContent = "Loading your planner...";
    return;
  }
  els.heroMeta.textContent = state.browserPreview
    ? `${user.display_name} - ${user.team_name} (browser preview mode)`
    : `${user.display_name} - ${user.team_name}`;
  const buddyName = state.buddy?.display_name || "No buddy";
  els.profileInfo.textContent = `Team: ${user.team_name} - Buddy: ${buddyName}`;
  els.teamCode.textContent = user.invite_code;
  els.buddyCode.textContent = user.buddy_code || "--------";
  els.profileBuddyCode.textContent = user.buddy_code || "--------";
  els.buddyStatus.textContent = state.buddy
    ? `Buddy linked: ${state.buddy.display_name}`
    : "No buddy linked yet.";
  els.nameInput.value = user.display_name;
}

function renderTasks() {
  if (!state.tasks.length) {
    els.tasksList.innerHTML =
      '<div class="card"><p class="muted">Nothing yet. Please add a new task.</p></div>';
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
  const data = await api("/api/team");
  const rows = data.rows || [];
  const teamProgress = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + (Number(row.avg_progress) || 0), 0) / rows.length)
    : 0;
  state.summary = { ...(state.summary || {}), teamProgress };
  renderStats();

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
  state.summary = {
    ...(state.summary || {}),
    total,
    done,
    avg,
    buddyConnected: Number(state.summary?.buddyConnected || 0),
    teamProgress: Number(state.summary?.teamProgress || 0)
  };
}

function rerenderAll() {
  recomputeSummary();
  renderOnboarding();
  renderHeader();
  renderStats();
  renderTasks();
}

async function bootstrap() {
  state.telegramUser = getTelegramUser();
  const data = await api("/api/bootstrap");
  state.user = data.user;
  state.tasks = data.tasks || [];
  state.weekKey = data.weekKey;
  state.summary = data.summary;
  state.buddy = data.buddy || null;
  state.needsOnboarding = Boolean(data.needsOnboarding);
  state.suggestedUsername = data.suggestedUsername || "";
  rerenderAll();
  if (!state.needsOnboarding) {
    await refreshTeam();
  }
}

els.onboardingSaveBtn.addEventListener("click", async () => {
  const username = els.onboardingUsernameInput.value.trim();
  if (!username) {
    showToast("Please enter a username.");
    return;
  }
  const res = await api("/api/onboarding/username", {
    body: { username }
  });
  state.user = res.data.user;
  state.tasks = res.data.tasks || [];
  state.weekKey = res.data.weekKey;
  state.summary = res.data.summary;
  state.buddy = res.data.buddy || null;
  state.needsOnboarding = false;
  rerenderAll();
  await refreshTeam();
  showToast("Welcome! Username saved.");
});

els.replacePlanBtn.addEventListener("click", async () => {
  const lines = els.planInput.value.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!lines.length) {
    showToast("Add at least one line.");
    return;
  }
  const res = await api("/api/tasks/replace-week", {
    body: { lines }
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
    body: { title }
  });
  state.tasks = res.tasks || [];
  rerenderAll();
  await refreshTeam();
  els.quickTaskInput.value = "";
  showToast("Task added.");
});

els.buddyJoinBtn.addEventListener("click", async () => {
  const code = els.buddyCodeInput.value.trim().toUpperCase();
  if (!code) {
    return;
  }
  const res = await api("/api/buddy/join", {
    body: { code }
  });
  await bootstrap();
  els.buddyCodeInput.value = "";
  rerenderAll();
  await refreshTeam();
  showToast(res.message || "Buddy linked.");
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
      method: "DELETE"
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
      body: { progress }
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
    body: { code }
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
    body: { name }
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
