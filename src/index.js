import "dotenv/config";
import express from "express";
import { initDb } from "./db.js";
import {
  addTask,
  bootstrapUser,
  completeOnboarding,
  deleteTask,
  ensureUser,
  getTeamRows,
  joinByCode,
  replaceWeekPlan,
  setBodyProgress,
  setDisplayName,
  updateTaskProgress
} from "./repo.js";
import { humanWeekLabel } from "./utils.js";
import { verifyTelegramInitData } from "./telegramAuth.js";

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.BOT_WEBAPP_URL;
const port = Number(process.env.PORT || 3000);
const allowUnverifiedUser =
  String(process.env.ALLOW_UNVERIFIED_TELEGRAM_USER || "").toLowerCase() === "true";

if (!token) {
  throw new Error("Missing BOT_TOKEN in environment.");
}
if (!webAppUrl) {
  throw new Error("Missing BOT_WEBAPP_URL in environment.");
}

const tgBase = `https://api.telegram.org/bot${token}`;
const app = express();
app.use(express.json());
app.use("/app", express.static("public", { extensions: ["html"] }));
app.get("/app", (_req, res) => {
  res.sendFile("index.html", { root: "public" });
});
app.get("/", (_req, res) => {
  res.redirect("/app");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function readTelegramUser(req) {
  const bodyUser = req.body?.telegramUser;
  if (allowUnverifiedUser && bodyUser?.id) {
    return {
      id: String(bodyUser.id),
      username: bodyUser.username || null,
      first_name: bodyUser.first_name || "",
      last_name: bodyUser.last_name || ""
    };
  }

  const initData = String(req.body?.initData || req.header("x-telegram-init-data") || "");
  const verified = verifyTelegramInitData(initData, token);
  if (verified.ok) {
    return {
      id: String(verified.user.id),
      username: verified.user.username || null,
      first_name: verified.user.first_name || "",
      last_name: verified.user.last_name || ""
    };
  }

  if (process.env.NODE_ENV === "development") {
    if (bodyUser?.id) {
      return {
        id: String(bodyUser.id),
        username: bodyUser.username || null,
        first_name: bodyUser.first_name || "",
        last_name: bodyUser.last_name || ""
      };
    }
  }

  if (verified.error) {
    return { __error: verified.error };
  }
  return null;
}

async function withUser(req, res, next) {
  try {
    const tgUser = readTelegramUser(req);
    if (tgUser?.__error) {
      res.status(401).json({ error: tgUser.__error });
      return;
    }
    if (!tgUser?.id) {
      res.status(401).json({ error: "Telegram user context missing." });
      return;
    }
    req.tgUser = tgUser;
    req.appUser = await ensureUser(tgUser);
    next();
  } catch (error) {
    next(error);
  }
}

function requireOnboarding(req, res, next) {
  if (Number(req.appUser?.onboarding_completed || 0) === 1) {
    next();
    return;
  }
  res.status(428).json({ error: "Complete onboarding first." });
}

app.post("/api/bootstrap", withUser, async (req, res) => {
  const data = await bootstrapUser(req.tgUser);
  const suggestedUsername = String(data.user.display_name || "User").trim().slice(0, 80);
  res.json({
    ...data,
    needsOnboarding: Number(data.user.onboarding_completed || 0) !== 1,
    suggestedUsername
  });
});

app.post("/api/onboarding/username", withUser, async (req, res) => {
  const data = await completeOnboarding(req.tgUser, req.body?.username);
  res.json({
    ok: true,
    data,
    needsOnboarding: false
  });
});

app.post("/api/tasks/replace-week", withUser, requireOnboarding, async (req, res) => {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const tasks = await replaceWeekPlan(req.tgUser, lines);
  res.json({ ok: true, tasks });
});

app.post("/api/tasks", withUser, requireOnboarding, async (req, res) => {
  const tasks = await addTask(req.tgUser, req.body?.title || "");
  res.json({ ok: true, tasks });
});

app.patch("/api/tasks/:id/progress", withUser, requireOnboarding, async (req, res) => {
  const tasks = await updateTaskProgress(req.tgUser, req.params.id, req.body?.progress);
  res.json({ ok: true, tasks });
});

app.delete("/api/tasks/:id", withUser, requireOnboarding, async (req, res) => {
  const tasks = await deleteTask(req.tgUser, req.params.id);
  res.json({ ok: true, tasks });
});

app.post("/api/join", withUser, requireOnboarding, async (req, res) => {
  const result = await joinByCode(req.tgUser, req.body?.code);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/team", withUser, requireOnboarding, async (req, res) => {
  res.json(await getTeamRows(req.tgUser));
});

app.post("/api/name", withUser, requireOnboarding, async (req, res) => {
  const raw = String(req.body?.name || "").trim();
  if (!raw) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  const user = await setDisplayName(req.tgUser.id, raw);
  res.json({ ok: true, user });
});

app.post("/api/body", withUser, requireOnboarding, async (req, res) => {
  const data = await setBodyProgress(req.tgUser, req.body?.progress);
  res.json({ ok: true, data });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Internal server error." });
});

async function tgCall(method, payload) {
  const response = await fetch(`${tgBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error in ${method}`);
  }
  return data.result;
}

async function sendMainMenu(chatId, tgUser) {
  const boot = await bootstrapUser(tgUser);
  const webApp = new URL(webAppUrl);
  webApp.searchParams.set("tgId", String(tgUser.id));
  if (tgUser.first_name) {
    webApp.searchParams.set("first_name", tgUser.first_name);
  }
  if (tgUser.last_name) {
    webApp.searchParams.set("last_name", tgUser.last_name);
  }
  if (tgUser.username) {
    webApp.searchParams.set("username", tgUser.username);
  }

  const text =
    `Weekly Collaborative Planner\n\n` +
    `Hello, ${boot.user.display_name}.\n` +
    `Your invite code: ${boot.user.invite_code}\n` +
    `Team: ${boot.user.team_name}\n` +
    `Week: ${humanWeekLabel(boot.weekKey)}\n\n` +
    `Open the mini app to manage tasks with rich UI.`;

  await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [[{ text: "Open Weekly Planner", web_app: { url: webApp.toString() } }]],
      resize_keyboard: true,
      is_persistent: true
    }
  });
}

async function handleMessage(message) {
  if (!message?.chat?.id || !message?.from?.id) {
    return;
  }
  const chatId = message.chat.id;
  const tgUser = message.from;
  await ensureUser(tgUser);
  const text = String(message.text || "").trim();

  if (text.startsWith("/start") || text === "Open Weekly Planner") {
    await sendMainMenu(chatId, tgUser);
    return;
  }

  if (text.startsWith("/mycode")) {
    const boot = await bootstrapUser(tgUser);
    await tgCall("sendMessage", {
      chat_id: chatId,
      text: `Your invite code: ${boot.user.invite_code}`
    });
    return;
  }

  if (text.startsWith("/join")) {
    const code = text.replace(/^\/join(@\w+)?/i, "").trim();
    const result = await joinByCode(tgUser, code);
    await tgCall("sendMessage", {
      chat_id: chatId,
      text: result.ok ? result.message : result.error
    });
    return;
  }

  if (text.startsWith("/help")) {
    await tgCall("sendMessage", {
      chat_id: chatId,
      text:
        "Use /start to open the mini app.\n" +
        "Use /mycode to copy your invite code.\n" +
        "Use /join CODE to join a team."
    });
  }
}

async function runPolling() {
  let offset = 0;
  await tgCall("deleteWebhook", { drop_pending_updates: false });
  await tgCall("setMyCommands", {
    commands: [
      { command: "start", description: "Open the planner mini app" },
      { command: "mycode", description: "Show your invite code" },
      { command: "join", description: "Join a teammate by code" },
      { command: "help", description: "Show quick help" }
    ]
  });

  while (true) {
    try {
      const updates = await tgCall("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"]
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error("Polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function startApp() {
  await initDb();
  app.listen(port, () => {
    console.log(`Mini app server running at http://localhost:${port}/app`);
    console.log(`Configured BOT_WEBAPP_URL: ${webAppUrl}`);
  });
  runPolling().catch((error) => {
    console.error("Fatal bot polling error:", error);
    process.exit(1);
  });
}

startApp().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
