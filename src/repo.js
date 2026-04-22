import { db } from "./db.js";
import { currentWeekKey, progressBar, randomCode } from "./utils.js";

const findUserStmt = db.prepare(`
  SELECT u.*, t.name AS team_name, t.invite_code AS team_invite_code
  FROM users u
  JOIN teams t ON t.id = u.team_id
  WHERE u.tg_id = ?
`);
const findUserByInviteStmt = db.prepare(`
  SELECT u.*, t.name AS team_name, t.invite_code AS team_invite_code
  FROM users u
  JOIN teams t ON t.id = u.team_id
  WHERE u.invite_code = ?
`);
const findTeamByCodeStmt = db.prepare(`SELECT * FROM teams WHERE invite_code = ?`);
const insertTeamStmt = db.prepare(`
  INSERT INTO teams (name, invite_code, owner_tg_id, created_at)
  VALUES (?, ?, ?, ?)
`);
const insertUserStmt = db.prepare(`
  INSERT INTO users (tg_id, username, display_name, team_id, invite_code, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateUserTeamStmt = db.prepare(`UPDATE users SET team_id = ? WHERE tg_id = ?`);
const updateUserNameStmt = db.prepare(`UPDATE users SET display_name = ? WHERE tg_id = ?`);

const insertTaskStmt = db.prepare(`
  INSERT INTO tasks (user_tg_id, week_key, title, progress, created_at, updated_at)
  VALUES (?, ?, ?, 0, ?, ?)
`);
const deleteWeekTasksStmt = db.prepare(`
  DELETE FROM tasks
  WHERE user_tg_id = ? AND week_key = ?
`);
const listWeekTasksStmt = db.prepare(`
  SELECT id, title, progress
  FROM tasks
  WHERE user_tg_id = ? AND week_key = ?
  ORDER BY id ASC
`);
const updateTaskProgressStmt = db.prepare(`
  UPDATE tasks
  SET progress = ?, updated_at = ?
  WHERE id = ? AND user_tg_id = ?
`);
const deleteTaskStmt = db.prepare(`
  DELETE FROM tasks
  WHERE id = ? AND user_tg_id = ?
`);
const findTaskStmt = db.prepare(`
  SELECT id, title, progress
  FROM tasks
  WHERE id = ? AND user_tg_id = ?
`);
const teamWeekRowsStmt = db.prepare(`
  SELECT
    u.display_name,
    COUNT(t.id) AS total_tasks,
    COALESCE(AVG(t.progress), 0) AS avg_progress
  FROM users u
  LEFT JOIN tasks t ON t.user_tg_id = u.tg_id AND t.week_key = ?
  WHERE u.team_id = ?
  GROUP BY u.tg_id
  ORDER BY avg_progress DESC, total_tasks DESC, u.display_name ASC
`);

function fullName(tgUser) {
  const first = tgUser?.first_name?.trim() ?? "";
  const last = tgUser?.last_name?.trim() ?? "";
  const name = `${first} ${last}`.trim();
  return name || tgUser?.username || `User ${tgUser?.id ?? "unknown"}`;
}

function generateUniqueCode(checkFn) {
  for (let i = 0; i < 20; i += 1) {
    const code = randomCode(8);
    if (!checkFn(code)) {
      return code;
    }
  }
  throw new Error("Could not generate unique code.");
}

export function ensureUser(tgUser) {
  if (!tgUser?.id) {
    throw new Error("Telegram user id is required.");
  }

  const tgId = String(tgUser.id);
  let user = findUserStmt.get(tgId);
  if (user) {
    return user;
  }

  const now = new Date().toISOString();
  const displayName = fullName(tgUser);
  const teamInviteCode = generateUniqueCode((code) => findTeamByCodeStmt.get(code));
  const userInviteCode = generateUniqueCode((code) => findUserByInviteStmt.get(code));
  const teamName = `${displayName}'s Team`;

  db.exec("BEGIN");
  try {
    const teamInsert = insertTeamStmt.run(teamName, teamInviteCode, tgId, now);
    insertUserStmt.run(
      tgId,
      tgUser.username ?? null,
      displayName,
      Number(teamInsert.lastInsertRowid),
      userInviteCode,
      now
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  user = findUserStmt.get(tgId);
  return user;
}

export function bootstrapUser(tgUser) {
  const user = ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const tasks = listWeekTasksStmt.all(user.tg_id, weekKey);
  const avg = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress), 0) / tasks.length)
    : 0;
  const done = tasks.filter((task) => Number(task.progress) >= 100).length;

  return {
    user,
    weekKey,
    tasks,
    summary: {
      total: tasks.length,
      done,
      avg,
      avgBar: progressBar(avg)
    }
  };
}

export function setDisplayName(tgId, name) {
  updateUserNameStmt.run(String(name).slice(0, 80), String(tgId));
  return findUserStmt.get(String(tgId));
}

export function joinByCode(tgUser, inviteCodeRaw) {
  const user = ensureUser(tgUser);
  const inviteCode = String(inviteCodeRaw || "").trim().toUpperCase();
  const owner = findUserByInviteStmt.get(inviteCode);
  if (!owner) {
    return { ok: false, error: "Invite code not found." };
  }
  if (Number(owner.team_id) === Number(user.team_id)) {
    return { ok: true, message: `You are already in team ${owner.team_name}.` };
  }
  updateUserTeamStmt.run(owner.team_id, user.tg_id);
  return { ok: true, message: `Joined ${owner.team_name}.` };
}

export function replaceWeekPlan(tgUser, lines) {
  const user = ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const now = new Date().toISOString();
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean).slice(0, 30);

  db.exec("BEGIN");
  try {
    deleteWeekTasksStmt.run(user.tg_id, weekKey);
    for (const line of cleanLines) {
      insertTaskStmt.run(user.tg_id, weekKey, line.slice(0, 220), now, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return listWeekTasksStmt.all(user.tg_id, weekKey);
}

export function addTask(tgUser, titleRaw) {
  const user = ensureUser(tgUser);
  const title = String(titleRaw || "").trim().slice(0, 220);
  if (!title) {
    throw new Error("Task title is required.");
  }
  const now = new Date().toISOString();
  insertTaskStmt.run(user.tg_id, currentWeekKey(), title, now, now);
  return bootstrapUser(tgUser).tasks;
}

export function updateTaskProgress(tgUser, taskId, progressRaw) {
  const user = ensureUser(tgUser);
  const task = findTaskStmt.get(Number(taskId), user.tg_id);
  if (!task) {
    throw new Error("Task not found.");
  }
  const progress = Math.max(0, Math.min(100, Number(progressRaw) || 0));
  updateTaskProgressStmt.run(progress, new Date().toISOString(), Number(taskId), user.tg_id);
  return bootstrapUser(tgUser).tasks;
}

export function deleteTask(tgUser, taskId) {
  const user = ensureUser(tgUser);
  deleteTaskStmt.run(Number(taskId), user.tg_id);
  return bootstrapUser(tgUser).tasks;
}

export function getTeamRows(tgUser) {
  const user = ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const rows = teamWeekRowsStmt.all(weekKey, user.team_id);
  return { weekKey, teamName: user.team_name, rows };
}

