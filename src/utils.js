import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear.js";
import isoWeek from "dayjs/plugin/isoWeek.js";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

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
  return `${now.isoWeekYear()}-W${String(now.isoWeek()).padStart(2, "0")}`;
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
