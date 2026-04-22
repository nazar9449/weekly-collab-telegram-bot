# Project Handoff

## Objective
Build a Telegram **Mini App** (not chat-command UX) for weekly collaborative task tracking:
- users set weekly tasks
- users update progress
- users join teams by invite code
- users view team leaderboard

## Current State
- Backend: Node.js + Express + Telegram Bot API polling
- Frontend: Telegram Web App UI at `/app` (cards, tabs, progress chips)
- Database: SQLite (`node:sqlite`) at `data/bot.db`
- Deployment target: Render

## What Works
- `/health` endpoint returns `{ "ok": true }`
- `/app` opens in browser with blue UI
- Bot can respond to `/start`, `/help`, `/mycode`, `/join CODE`
- Mini App backend APIs implemented:
  - `POST /api/bootstrap`
  - `POST /api/tasks/replace-week`
  - `POST /api/tasks`
  - `PATCH /api/tasks/:id/progress`
  - `DELETE /api/tasks/:id`
  - `POST /api/join`
  - `POST /api/team`
  - `POST /api/name`

## Recent Critical Fix
- Added root redirect so Telegram opening `/` still works:
  - `GET /` -> redirects to `/app`

File changed:
- `src/index.js`

## Known Issue To Re-Verify
- In Telegram clients (desktop/mobile), Mini App previously showed `Cannot GET` / black screen.
- Likely cause: Telegram opening root URL instead of `/app`.
- Fix is in code, but must be **deployed** and re-tested.

## Required Environment Variables
- `BOT_TOKEN=<telegram_bot_token>`
- `BOT_WEBAPP_URL=https://<render-service>.onrender.com/app`
- `PORT=10000` (or Render-provided port behavior)

## Important URLs
- Health check: `https://<render-service>.onrender.com/health`
- Mini App: `https://<render-service>.onrender.com/app`

## BotFather Configuration
Set Menu Button (Mini App URL) to:
- `https://<render-service>.onrender.com/app`

After updating URL:
1. redeploy service
2. send `/start` to bot again
3. tap `Open Weekly Planner`

## Next Steps (Priority)
1. Push latest commit (with `/` -> `/app` redirect) and deploy on Render.
2. Verify in Telegram desktop + phone:
   - Menu button opens Mini App
   - no `Cannot GET`/black screen
3. If still failing, capture exact opened URL and Render logs.
4. Add Telegram `initData` signature validation for production security.

## Local Run
```bash
npm install
npm start
```

## File Map
- `src/index.js` - server + polling + routes
- `src/repo.js` - business/data operations
- `src/db.js` - database setup
- `public/index.html` - Mini App markup
- `public/styles.css` - UI styling
- `public/app.js` - Mini App client logic
- `.env.example` - environment template

## Suggested New-Chat Prompt
Use this in a new context:

`Read HANDOFF.md and continue from current state. First, verify Telegram Mini App opens in Telegram clients after latest deploy, then implement Telegram initData signature validation.`

