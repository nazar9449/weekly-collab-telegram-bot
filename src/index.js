import "dotenv/config";
import express from "express";
import {
  addTask,
  bootstrapUser,
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

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.BOT_WEBAPP_URL;
const port = Number(process.env.PORT || 3000);

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
  if (bodyUser?.id) {
    return {
      id: String(bodyUser.id),
      username: bodyUser.username || null,
      first_name: bodyUser.first_name || "",
      last_name: bodyUser.last_name || ""
    };
  }

  const headerId = req.header("x-telegram-id");
  if (headerId) {
    return {
      id: String(headerId),
      username: req.header("x-telegram-username") || null,
      first_name: req.header("x-telegram-first-name") || "",
      last_name: req.header("x-telegram-last-name") || ""
    };
  }

  return null;
}

function withUser(req, res, next) {
  try {
    const tgUser = readTelegramUser(req);
    if (!tgUser?.id) {
      res.status(401).json({ error: "Telegram user context missing." });
      return;
    }
    req.tgUser = tgUser;
    next();
  } catch (error) {
    next(error);
  }
}

app.post("/api/bootstrap", withUser, (req, res) => {
  const data = bootstrapUser(req.tgUser);
  res.json(data);
});

app.post("/api/tasks/replace-week", withUser, (req, res) => {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const tasks = replaceWeekPlan(req.tgUser, lines);
  res.json({ ok: true, tasks });
});

app.post("/api/tasks", withUser, (req, res) => {
  const tasks = addTask(req.tgUser, req.body?.title || "");
  res.json({ ok: true, tasks });
});

app.patch("/api/tasks/:id/progress", withUser, (req, res) => {
  const tasks = updateTaskProgress(req.tgUser, req.params.id, req.body?.progress);
  res.json({ ok: true, tasks });
});

app.delete("/api/tasks/:id", withUser, (req, res) => {
  const tasks = deleteTask(req.tgUser, req.params.id);
  res.json({ ok: true, tasks });
});

app.post("/api/join", withUser, (req, res) => {
  const result = joinByCode(req.tgUser, req.body?.code);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/team", withUser, (req, res) => {
  res.json(getTeamRows(req.tgUser));
});

app.post("/api/name", withUser, (req, res) => {
  const raw = String(req.body?.name || "").trim();
  if (!raw) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  const user = setDisplayName(req.tgUser.id, raw);
  res.json({ ok: true, user });
});

app.post("/api/body", withUser, (req, res) => {
  const data = setBodyProgress(req.tgUser, req.body?.progress);
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
  const boot = bootstrapUser(tgUser);
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
      keyboard: [[{ text: "Open Weekly Planner", web_app: { url: webAppUrl } }]],
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
  ensureUser(tgUser);
  const text = String(message.text || "").trim();

  if (text.startsWith("/start") || text === "Open Weekly Planner") {
    await sendMainMenu(chatId, tgUser);
    return;
  }

  if (text.startsWith("/mycode")) {
    const boot = bootstrapUser(tgUser);
    await tgCall("sendMessage", {
      chat_id: chatId,
      text: `Your invite code: ${boot.user.invite_code}`
    });
    return;
  }

  if (text.startsWith("/join")) {
    const code = text.replace(/^\/join(@\w+)?/i, "").trim();
    const result = joinByCode(tgUser, code);
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

app.listen(port, () => {
  console.log(`Mini app server running at http://localhost:${port}/app`);
  console.log(`Configured BOT_WEBAPP_URL: ${webAppUrl}`);
});

runPolling().catch((error) => {
  console.error("Fatal bot polling error:", error);
  process.exit(1);
});
