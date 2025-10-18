# Telegram Bot Service Testing Guide

This document describes how to verify the refactored `TelegramBotService` that powers the AgentFlow Telegram bot.

## Prerequisites
- Node.js 20 or newer.
- A cloned AgentFlow repository with dependencies installed:
  ```bash
  cd app
  npm install
  ```
- A valid Telegram bot token created via [BotFather](https://t.me/botfather).
- (Optional) A secondary terminal window to watch structured logs located at `app/data/logs/telegram-bot.jsonl`.

## Running automated checks
The desktop project provides automated tests for the Electron application shell. Run them from the `app` directory:
```bash
cd app
npm test
```
> These tests do not cover Telegram bot flows directly, but they help ensure that shared utilities continue to work after refactors.

## Starting the service in isolation
You can exercise the bot service without launching the full Electron shell by using a short Node.js script.

1. Create a local data directory (for example, `app/tmp-data`) and pass it to the service so that database files and logs do not interfere with production data.
2. Run the script below, substituting your token:
   ```bash
   TELEGRAM_BOT_TOKEN="123456:ABC" \ 
   node --input-type=module <<'NODE'
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { createTelegramBotService } from './app/services/tg-bot/index.js';

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);

   const dataDir = path.join(__dirname, 'app/tmp-data');
   const service = createTelegramBotService({
     dataDirectory: dataDir,
     dbPath: path.join(dataDir, 'app.db'),
     logPath: path.join(dataDir, 'logs', 'telegram-bot.jsonl'),
     sessionInactivityMs: 5 * 60 * 1000,
     sessionCleanupIntervalMs: 60 * 1000
   });

   await service.init();
   await service.setToken(process.env.TELEGRAM_BOT_TOKEN);
   await service.start();

   console.log('Bot status:', service.getStatus());
   process.on('SIGINT', async () => {
     await service.stop('manual-test-stop');
     console.log('Stopped.');
     process.exit(0);
   });
   NODE
   ```
3. Connect to the bot from your Telegram client and use `/start` followed by `/setup` to begin the survey.

The console output displays lifecycle transitions while JSON log entries accumulate under the temporary `logs/telegram-bot.jsonl` file.

## Functional regression checklist
Perform the following manual checks to validate the refactor:

### 1. Token validation
- Provide an incorrect token to `service.setToken()` and confirm that the call throws an error and no restart is attempted.
- Provide the correct token and verify that the bot reaches the `RUNNING` state and `getStatus()` returns `tokenStored: true`.

### 2. Lifecycle management
- With the bot running, send `CTRL+C` (SIGINT) to trigger the `stop()` path and confirm the service transitions to `STOPPED`.
- Intentionally throw an error inside a handler (for example, send `/start` without parameters to trigger validation). Observe the state transition to `RESTARTING`, the exponential backoff delay in the logs, and that the bot stops auto-restarting after five attempts.

### 3. Session handling
- Start a survey with `/setup`, answer the questions, and ensure a brief is persisted under `tmp-data/briefs` and emitted through the `brief:updated` event.
- Abort a survey with `/finish` and confirm the session is removed from `service.sessions` (check via a temporary log statement or by inspecting the Map in a Node.js REPL).
- Leave a survey idle for longer than `sessionInactivityMs` and ensure the cleanup interval removes it and sends the inactivity notification.

### 4. Input validation
- When the bot asks for numeric input, reply with a string. The bot should respond with an explanatory error and re-ask the same question.
- Continue with valid answers and verify that the survey proceeds normally once valid data is provided.

### 5. Status reporting
- Call `service.getStatus()` at different points (before start, while running, after failure) and ensure it returns accurate metadata (state, restart counters, `nextRestartAt`, and username).

## Full desktop flow
To validate the integration with the Electron application:
1. Launch the desktop shell:
   ```bash
   cd app
   npm run dev
   ```
2. Open the Telegram settings page in the renderer, paste your token, and start the bot.
3. Repeat the manual checks above while watching IPC logs in the Electron console.
4. When finished, stop the development server with `CTRL+C` and run `npm run dev` again to confirm the bot does not auto-start after a failure unless the token is valid.

Following this checklist ensures the lifecycle, validation, and session-management changes work as intended and remain observable through logs.
