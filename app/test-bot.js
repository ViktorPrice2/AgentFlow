import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTelegramBotService } from './services/tg-bot/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Используем стандартную директорию data для тестирования
const service = createTelegramBotService({
  sessionInactivityMs: 5 * 60 * 1000,
  sessionCleanupIntervalMs: 60 * 1000
});

await service.init();
console.log('Сервис инициализирован. Статус:', service.getStatus());

// Тестирование 1: Валидация токена - неправильный токен
try {
  await service.setToken('invalid_token');
  console.log('❌ Ошибка: неправильный токен не вызвал исключение');
} catch (error) {
  console.log('✅ Правильный токен: неправильный токен вызвал исключение:', error.message);
}

// Тестирование 2: Валидация токена - правильный токен
const realToken = '7504569021:AAGtwU99xph9pt4K29D_XliW3r0g9UYSO0s';
try {
  const status = await service.setToken(realToken);
  console.log('✅ Правильный токен: статус после установки:', status);
} catch (error) {
  console.log('❌ Ошибка при установке правильного токена:', error.message);
}

// Тестирование 3: Запуск бота
try {
  const startStatus = await service.start();
  console.log('✅ Бот запущен: статус:', startStatus);

  // Ждём немного для инициализации
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Проверяем статус снова
  const runningStatus = service.getStatus();
  console.log('✅ Статус после запуска:', runningStatus);

  // Останавливаем бота для теста
  const stopStatus = await service.stop('test-stop');
  console.log('✅ Бот остановлен: статус:', stopStatus);

} catch (error) {
  console.log('❌ Ошибка при запуске бота:', error.message);
}

console.log('Тесты валидации токена и запуска завершены.');

// Для остановки:
// process.on('SIGINT', async () => {
//   await service.stop('manual-test-stop');
//   console.log('Остановлено.');
//   process.exit(0);
// });
