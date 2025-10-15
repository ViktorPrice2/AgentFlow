# AgentFlow Desktop

Русскоязычное руководство по разработке и сборке Windows‑приложения AgentFlow Desktop.

## Предварительные требования

- Node.js 20+ (желательно последняя LTS)
- npm 10+
- Windows 10 или 11 с установленными инструментами сборки C++ (MSVC Build Tools / Visual Studio)
- Git для управления репозиторием

## Установка зависимостей

```bash
cd app
npm install
```

Скрипт `postinstall` автоматически вытянет зависимости для папки `renderer/` и выполнит `electron-builder install-app-deps`,
чтобы пересобрать нативные модули (например, `better-sqlite3`) под текущую версию Electron.
Перед запуском разработки выполняется `npm run ensure:native` — он кэширует последнюю версию Electron и повторно вызывает
`electron-builder install-app-deps`, если бинарники устарели. При сбоях скрипт дополнительно пробует `prebuild-install` и `node-gyp-build`
непосредственно в каталоге `better-sqlite3`, поэтому на Windows достаточно стабильного интернет‑соединения и установленного MSVC.

## Переменные окружения

В проекте есть пример `.env`. Скопируйте его и заполните ключи, если требуется онлайн‑режим:

```
OPENAI_API_KEY=
GOOGLE_API_KEY=
STABILITY_API_KEY=
HIGGSFIELD_API_KEY=
```

Если ключи не заданы, приложение переходит в mock‑режим: провайдеры возвращают заглушки, что позволяет работать полностью офлайн.

## Режим разработки

```bash
npm run dev
```

- Запускает Vite (порт `5173`) и Electron с автообновлением UI.
- Логи и артефакты появляются в `data/logs` и `data/artifacts`.

## Быстрый прогон пайплайна из терминала

```bash
node --input-type=module -e "
  import { createPluginRegistry } from './core/pluginLoader.js';
  import { createProviderManager } from './core/providers/manager.js';
  import { runPipeline } from './core/orchestrator.js';
  import { getAgentConfigSnapshot } from './core/api.js';
  const registry = await createPluginRegistry();
  const providerManager = await createProviderManager();
  const configs = new Map(getAgentConfigSnapshot().map((cfg) => [cfg.id, cfg]));
  const pipeline = {
    id: 'phase6-check',
    name: 'Demo Pipeline',
    nodes: [
      { id: 'writer', agentName: 'WriterAgent', kind: 'task' },
      { id: 'guard', agentName: 'StyleGuard', kind: 'guard' },
      { id: 'human', agentName: 'HumanGate', kind: 'humanGate' },
      { id: 'uploader', agentName: 'UploaderAgent', kind: 'task' }
    ],
    edges: [
      { from: 'writer', to: 'guard' },
      { from: 'guard', to: 'human' },
      { from: 'human', to: 'uploader' }
    ]
  };
  const input = {
    project: { id: 'demo', name: 'Demo Project' },
    topic: 'Летний запуск',
    tone: 'Дружелюбный',
    message: 'Поделись новостями',
    outline: 'Список тезисов'
  };
  const result = await runPipeline(pipeline, input, { pluginRegistry: registry, agentConfigs: configs, providerManager });
  console.log(JSON.stringify({ status: result.status, artifacts: result.payload._artifacts }, null, 2));
"
```

## Сборка production‑версии

1. Собрать интерфейс:
   ```bash
   npm run build:ui
   ```
2. Сформировать nsis‑установщик:
   ```bash
   npm run build
   # или алиас
   npm run dist
   ```

### Результат

- `renderer/dist/` — статические файлы UI.
- `dist/AgentFlow Setup.exe` — установщик Electron (oneClick выключен, доступна смена каталога, создаются ярлыки).

> В конфиге electron-builder добавлены `npmRebuild:false` и `buildDependenciesFromSource:false`, чтобы использовать уже собранные бинарники `better-sqlite3`. При необходимости ручной пересборки удалите эти флаги и установите предварительно необходимые инструменты C++.

## Режимы работы

- **Онлайн**: заполните ключи в `.env`, после чего провайдер‑менеджер будет делать реальные запросы.
- **Оффлайн**: ключи пустые — агенты получают mock‑ответы, но пайплайны, логи и артефакты продолжают создаваться.

## Структура проекта

- `main/` — процессы Electron (main + preload), icon.
- `renderer/` — React + Vite интерфейс с семью вкладками (Проекты, Бриф, Агенты, Пайплайны, Запуски, Отчёты, Настройки).
- `core/` — оркестратор, загрузчик плагинов, менеджер провайдеров.
- `data/` — база, артефакты, логи (создаётся на лету).
- `config/` — `providers.json` и прочие настройки.
- `services/` — задел под Telegram‑бот и локальные сервисы.

## Полезные команды

| Команда            | Назначение                                 |
|--------------------|--------------------------------------------|
| `npm run dev`      | режим разработки (Electron + Vite)         |
| `npm run build:ui` | прод‑сборка React UI                       |
| `npm run build`    | сборка UI, пересборка нативных модулей и генерация установщика |
| `npm run dist`     | алиас для полного билда                    |
| `npm run ensure:native` | принудительно пересобрать `better-sqlite3` под текущий Electron |
| `./scripts/push-work-as-main.sh` | отправить локальную ветку `work` в удалённую `main` и настроить upstream |
| `powershell -ExecutionPolicy Bypass -File scripts/push-work-as-main.ps1` | то же самое, но для PowerShell/Windows |

### Быстрая синхронизация ветки `work` → `main`

Если в репозитории есть локальная ветка `work`, а на GitHub используется `main`, воспользуйтесь скриптом:

```bash
./scripts/push-work-as-main.sh origin work main
# или под Windows
powershell -ExecutionPolicy Bypass -File scripts/push-work-as-main.ps1 -Remote origin -WorkBranch work -MainBranch main
```

- Аргументы по умолчанию: `origin work main`. Можно опустить, если имена стандартные.
- Скрипты проверяют наличие удалённого репозитория и переключатся на `work`, если вы сейчас на другой ветке.
- После выполнения локальная `work` будет связана с `origin/main`, поэтому последующие обновления выполняются обычной командой `git push`.

## Чек‑лист перед релизом

- [ ] `npm run dev` запускает Electron с русским UI и работает навигация.
- [ ] Создан проект → заполнен бриф → сохранён и запущен пайплайн → в `data/artifacts/<runId>/` появились файлы.
- [ ] В `data/logs/` лежит JSONL‑лог последнего запуска.
- [ ] `npm run build` создаёт `dist/AgentFlow Setup.exe` без ошибок.
- [ ] Файл `.env` (и ключи) не закоммичены.
