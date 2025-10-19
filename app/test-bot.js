import { createTelegramBotService } from './services/tg-bot/index.js';

/**
 * Simple integration harness for manual Telegram bot testing.
 *
 * Usage:
 *   - Ensure dependencies are installed (`npm install --prefix app`).
 *   - Optionally export TELEGRAM_BOT_TOKEN (or TG_TOKEN) before running.
 *   - Execute with `node test-bot.js` from the `app/` directory.
 */
const service = createTelegramBotService({
  sessionInactivityMs: 5 * 60 * 1000,
  sessionCleanupIntervalMs: 60 * 1000
});

await service.init();
console.log('[test-bot] Service initialised:', service.getStatus());

// Scenario 1 — invalid token is rejected.
try {
  await service.setToken('invalid_token');
  console.log('[test-bot] Unexpected success: invalid token was accepted.');
} catch (error) {
  console.log('[test-bot] Expected rejection for invalid token:', error.message);
}

// Scenario 2 — optional real token from environment variables.
const liveToken = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TG_TOKEN ?? '';
if (!liveToken) {
  console.log(
    '[test-bot] Skipping live token test. Provide TELEGRAM_BOT_TOKEN (or TG_TOKEN) to exercise real traffic.'
  );
} else {
  try {
    const status = await service.setToken(liveToken);
    console.log('[test-bot] Stored Telegram token:', status);
  } catch (error) {
    console.log('[test-bot] Failed to store provided token:', error.message);
  }
}

// Scenario 3 — start/stop lifecycle smoke test.
try {
  const startStatus = await service.start();
  console.log('[test-bot] Bot started:', startStatus);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const runningStatus = service.getStatus();
  console.log('[test-bot] Bot status after start:', runningStatus);

  const stopStatus = await service.stop('test-stop');
  console.log('[test-bot] Bot stopped:', stopStatus);
} catch (error) {
  console.log('[test-bot] Bot lifecycle error:', error.message);
}

console.log('[test-bot] Demo complete. Inspect data/logs/telegram-bot.jsonl for runtime details.');

// Optional graceful shutdown helper for long-running experiments:
// process.on('SIGINT', async () => {
//   await service.stop('manual-test-stop');
//   console.log('[test-bot] Stopped by SIGINT.');
//   process.exit(0);
// });
