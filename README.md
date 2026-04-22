# Weekly Collaborative Telegram Mini App

This is a Telegram **Mini App** planner (not a chat-command bot UX).

Users open a real in-telegram interface with tabs, cards, progress chips, and team leaderboard.

## Features

- Beautiful Telegram Mini App UI (`/app`)
- Weekly plan replace (multi-line)
- Fast single-task add
- Task cards with one-tap progress chips (`0/25/50/75/100`)
- Invite-code collaboration and team join
- Team leaderboard
- Profile rename
- Fallback text commands in chat: `/start`, `/mycode`, `/join CODE`, `/help`

## Stack

- Node.js
- Express
- SQLite (`node:sqlite`)
- Telegram Bot API polling (no Telegraf)

## Environment

Create `.env`:

```env
BOT_TOKEN=123456:abc-your-token
BOT_WEBAPP_URL=https://your-public-domain.com/app
PORT=3000
```

`BOT_WEBAPP_URL` must be an HTTPS public URL.

## Run

```bash
npm install
npm start
```

Server serves the mini app at:

- `http://localhost:3000/app` (local)

## Connect Mini App In BotFather

1. Open [@BotFather](https://t.me/BotFather)
2. `/mybots` -> choose your bot
3. `Bot Settings` -> `Menu Button` (or `Configure Mini App`)
4. Set URL to your `BOT_WEBAPP_URL`
5. Restart your bot process and send `/start` to your bot

## Local Testing Tips

Telegram Mini Apps generally need HTTPS public URL.
For local development, use tunnel tools like `ngrok` or `cloudflared` and set:

- `BOT_WEBAPP_URL=https://<your-tunnel-domain>/app`

You can also open in browser with manual user id:

- `http://localhost:3000/app?tgId=123456789`

## Project Structure

- `src/index.js` - Express API + Telegram polling loop
- `src/repo.js` - data operations
- `src/db.js` - sqlite setup
- `public/index.html` - mini app UI
- `public/styles.css` - visual system
- `public/app.js` - frontend logic

