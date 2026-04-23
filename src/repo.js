import { query, withTransaction } from "./db.js";
import { currentWeekKey, progressBar, randomCode } from "./utils.js";

function fullName(tgUser) {
  const first = tgUser?.first_name?.trim() ?? "";
  const last = tgUser?.last_name?.trim() ?? "";
  const name = `${first} ${last}`.trim();
  return name || tgUser?.username || `User ${tgUser?.id ?? "unknown"}`;
}

async function findUserByTgId(tgId, runner = query) {
  const result = await runner(
    `
      SELECT u.*, t.name AS team_name, t.invite_code AS team_invite_code
      FROM users u
      JOIN teams t ON t.id = u.team_id
      WHERE u.tg_id = $1
    `,
    [String(tgId)]
  );
  return result.rows[0] || null;
}

async function findUserByInviteCode(inviteCode, runner = query) {
  const result = await runner(
    `
      SELECT u.*, t.name AS team_name, t.invite_code AS team_invite_code
      FROM users u
      JOIN teams t ON t.id = u.team_id
      WHERE u.invite_code = $1
    `,
    [String(inviteCode)]
  );
  return result.rows[0] || null;
}

async function findTeamByCode(inviteCode, runner = query) {
  const result = await runner(`SELECT id FROM teams WHERE invite_code = $1`, [String(inviteCode)]);
  return result.rows[0] || null;
}

async function generateUniqueCode(checkFn) {
  for (let i = 0; i < 25; i += 1) {
    const code = randomCode(8);
    const exists = await checkFn(code);
    if (!exists) {
      return code;
    }
  }
  throw new Error("Could not generate unique code.");
}

export async function ensureUser(tgUser) {
  if (!tgUser?.id) {
    throw new Error("Telegram user id is required.");
  }

  const tgId = String(tgUser.id);
  const existing = await findUserByTgId(tgId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const displayName = fullName(tgUser);
  const teamName = `${displayName}'s Team`;

  const teamInviteCode = await generateUniqueCode((code) => findTeamByCode(code));
  const userInviteCode = await generateUniqueCode((code) => findUserByInviteCode(code));

  await withTransaction(async (client) => {
    const teamInsert = await client.query(
      `
        INSERT INTO teams (name, invite_code, owner_tg_id, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [teamName, teamInviteCode, tgId, now]
    );

    await client.query(
      `
        INSERT INTO users (tg_id, username, display_name, team_id, invite_code, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [tgId, tgUser.username ?? null, displayName, teamInsert.rows[0].id, userInviteCode, now]
    );
  });

  return findUserByTgId(tgId);
}

async function getTasksForWeek(userTgId, weekKey, runner = query) {
  const result = await runner(
    `
      SELECT id, title, progress
      FROM tasks
      WHERE user_tg_id = $1 AND week_key = $2
      ORDER BY id ASC
    `,
    [String(userTgId), String(weekKey)]
  );
  return result.rows;
}

async function getTeamWeekRows(teamId, weekKey, runner = query) {
  const result = await runner(
    `
      SELECT
        u.display_name,
        COUNT(t.id)::int AS total_tasks,
        COALESCE(AVG(t.progress), 0) AS avg_progress
      FROM users u
      LEFT JOIN tasks t ON t.user_tg_id = u.tg_id AND t.week_key = $1
      WHERE u.team_id = $2
      GROUP BY u.tg_id
      ORDER BY avg_progress DESC, total_tasks DESC, u.display_name ASC
    `,
    [String(weekKey), Number(teamId)]
  );
  return result.rows;
}

async function getBodyMetric(userTgId, weekKey, runner = query) {
  const result = await runner(
    `
      SELECT progress
      FROM body_metrics
      WHERE user_tg_id = $1 AND week_key = $2
      LIMIT 1
    `,
    [String(userTgId), String(weekKey)]
  );
  return result.rows[0] || null;
}

export async function bootstrapUser(tgUser) {
  const user = await ensureUser(tgUser);
  const weekKey = currentWeekKey();

  const [tasks, bodyMetric, teamRows] = await Promise.all([
    getTasksForWeek(user.tg_id, weekKey),
    getBodyMetric(user.tg_id, weekKey),
    getTeamWeekRows(user.team_id, weekKey)
  ]);

  const bodyProgress = bodyMetric ? Number(bodyMetric.progress) || 0 : 0;
  const avg = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress), 0) / tasks.length)
    : 0;
  const done = tasks.filter((task) => Number(task.progress) >= 100).length;
  const teamProgress = teamRows.length
    ? Math.round(
        teamRows.reduce((sum, row) => sum + (Number(row.avg_progress) || 0), 0) / teamRows.length
      )
    : 0;

  return {
    user,
    weekKey,
    tasks,
    summary: {
      total: tasks.length,
      done,
      avg,
      bodyProgress,
      teamProgress,
      avgBar: progressBar(avg)
    }
  };
}

export async function setDisplayName(tgId, name) {
  await query(`UPDATE users SET display_name = $1 WHERE tg_id = $2`, [
    String(name).slice(0, 80),
    String(tgId)
  ]);
  return findUserByTgId(String(tgId));
}

export async function completeOnboarding(tgUser, displayNameRaw) {
  const user = await ensureUser(tgUser);
  const displayName = String(displayNameRaw || "").trim().slice(0, 80);
  if (!displayName) {
    throw new Error("Username is required.");
  }

  await query(
    `
      UPDATE users
      SET display_name = $1, onboarding_completed = 1
      WHERE tg_id = $2
    `,
    [displayName, user.tg_id]
  );

  return bootstrapUser(tgUser);
}

export async function joinByCode(tgUser, inviteCodeRaw) {
  const user = await ensureUser(tgUser);
  const inviteCode = String(inviteCodeRaw || "").trim().toUpperCase();
  const owner = await findUserByInviteCode(inviteCode);
  if (!owner) {
    return { ok: false, error: "Invite code not found." };
  }
  if (Number(owner.team_id) === Number(user.team_id)) {
    return { ok: true, message: `You are already in team ${owner.team_name}.` };
  }

  await query(`UPDATE users SET team_id = $1 WHERE tg_id = $2`, [owner.team_id, user.tg_id]);
  return { ok: true, message: `Joined ${owner.team_name}.` };
}

export async function replaceWeekPlan(tgUser, lines) {
  const user = await ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const now = new Date().toISOString();
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean).slice(0, 30);

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM tasks WHERE user_tg_id = $1 AND week_key = $2`, [
      user.tg_id,
      weekKey
    ]);
    for (const line of cleanLines) {
      await client.query(
        `
          INSERT INTO tasks (user_tg_id, week_key, title, progress, created_at, updated_at)
          VALUES ($1, $2, $3, 0, $4, $4)
        `,
        [user.tg_id, weekKey, line.slice(0, 220), now]
      );
    }
  });

  return getTasksForWeek(user.tg_id, weekKey);
}

export async function addTask(tgUser, titleRaw) {
  const user = await ensureUser(tgUser);
  const title = String(titleRaw || "").trim().slice(0, 220);
  if (!title) {
    throw new Error("Task title is required.");
  }

  const now = new Date().toISOString();
  await query(
    `
      INSERT INTO tasks (user_tg_id, week_key, title, progress, created_at, updated_at)
      VALUES ($1, $2, $3, 0, $4, $4)
    `,
    [user.tg_id, currentWeekKey(), title, now]
  );

  const boot = await bootstrapUser(tgUser);
  return boot.tasks;
}

export async function updateTaskProgress(tgUser, taskId, progressRaw) {
  const user = await ensureUser(tgUser);
  const taskCheck = await query(
    `
      SELECT id
      FROM tasks
      WHERE id = $1 AND user_tg_id = $2
      LIMIT 1
    `,
    [Number(taskId), user.tg_id]
  );
  if (!taskCheck.rows[0]) {
    throw new Error("Task not found.");
  }

  const progress = Math.max(0, Math.min(100, Number(progressRaw) || 0));
  await query(
    `
      UPDATE tasks
      SET progress = $1, updated_at = $2
      WHERE id = $3 AND user_tg_id = $4
    `,
    [progress, new Date().toISOString(), Number(taskId), user.tg_id]
  );

  const boot = await bootstrapUser(tgUser);
  return boot.tasks;
}

export async function deleteTask(tgUser, taskId) {
  const user = await ensureUser(tgUser);
  await query(`DELETE FROM tasks WHERE id = $1 AND user_tg_id = $2`, [Number(taskId), user.tg_id]);
  const boot = await bootstrapUser(tgUser);
  return boot.tasks;
}

export async function getTeamRows(tgUser) {
  const user = await ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const rows = await getTeamWeekRows(user.team_id, weekKey);
  return { weekKey, teamName: user.team_name, rows };
}

export async function setBodyProgress(tgUser, progressRaw) {
  const user = await ensureUser(tgUser);
  const weekKey = currentWeekKey();
  const progress = Math.max(0, Math.min(100, Number(progressRaw) || 0));

  await query(
    `
      INSERT INTO body_metrics (user_tg_id, week_key, progress, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(user_tg_id, week_key)
      DO UPDATE SET progress = EXCLUDED.progress, updated_at = EXCLUDED.updated_at
    `,
    [user.tg_id, weekKey, progress, new Date().toISOString()]
  );

  return bootstrapUser(tgUser);
}

