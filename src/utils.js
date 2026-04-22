import dayjs from "dayjs";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function currentWeekKey() {
  const now = dayjs();
  const year = now.year();
  const yearStart = dayjs(`${year}-01-01`);
  const daysSinceStart = now.startOf("day").diff(yearStart.startOf("day"), "day");
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

export function humanWeekLabel(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) {
    return `Week ${weekKey || "--"}`;
  }
  const year = match[1];
  const week = Number(match[2]);
  return `${year} Week ${week}`;
}

export function randomCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function progressBar(progress) {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  const filled = Math.round(p / 10);
  const empty = 10 - filled;
  return `${"#".repeat(filled)}${"-".repeat(empty)} ${p}%`;
}
