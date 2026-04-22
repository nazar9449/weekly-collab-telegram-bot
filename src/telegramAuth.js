import crypto from "node:crypto";

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24;

function safeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a || ""), "hex");
  const bBuf = Buffer.from(String(b || ""), "hex");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyTelegramInitData(initData, botToken) {
  const raw = String(initData || "").trim();
  if (!raw) {
    return { ok: false, error: "Missing initData." };
  }
  if (!botToken) {
    return { ok: false, error: "Missing bot token for verification." };
  }

  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "Missing hash in initData." };
  }

  const dataCheckPairs = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") {
      continue;
    }
    dataCheckPairs.push(`${key}=${value}`);
  }
  dataCheckPairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = dataCheckPairs.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const signature = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(signature, hash)) {
    return { ok: false, error: "Invalid Telegram signature." };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, error: "Telegram session expired." };
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    return { ok: false, error: "Missing Telegram user in initData." };
  }

  let user;
  try {
    user = JSON.parse(rawUser);
  } catch (_error) {
    return { ok: false, error: "Invalid Telegram user payload." };
  }

  if (!user?.id) {
    return { ok: false, error: "Telegram user id is missing." };
  }

  return { ok: true, user };
}

