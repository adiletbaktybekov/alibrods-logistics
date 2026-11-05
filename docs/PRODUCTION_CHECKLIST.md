# AliBros Logistics — Production Deployment Checklist

Настоящий регламент определяет строгую последовательность безопасного развертывания платформы **AliBros Logistics** в промышленную эксплуатацию (Production), шаги верификации, проверку внешних аккаунтов и план отката (Rollback plan).

---

## 1. Сводный статус готовности компонентов

| Компонент | Статус в коде | Требуемое внешнее подключение | Готовность к бою |
|---|---|---|---|
| **Ядро & Модели (Prisma ORM)** | Готово | PostgreSQL 15+ с SSL | Готов к миграции |
| **Auth & RBAC (JWT, argon2id)** | Готово | Настройка `JWT_SECRET` | Готов |
| **Клиентский веб-кабинет** | Готово | Развёрнутый фронтенд | Готов |
| **Административная панель** | Готово | Развёрнутый фронтенд | Готов |
| **Telegram Mini App** | Готово | Webhook & Mini App URL у @BotFather | Требуется привязка бота |
| **Telegram-бот водителей** | Готово | Webhook водительского бота | Требуется регистрация вебхука |
| **S3 Storage (Фотоотчёты)** | Готово | Приватный бакет S3 и IAM-ключи | Требуются боевые ключи |
| **Google Sheets (Бухгалтерия)**| Готово | Service Account и доступ к таблице | Требуются боевые ключи |
| **Cron API (`/api/cron/...`)** | Готово | Настройка `CRON_SECRET` в планировщике | Готов |
| **AuditLog & Notifications** | Готово | Запись в PostgreSQL + Telegram bot | Готов |

---

## 2. Предварительные требования: внешние аккаунты и доступы

Перед началом Production-запуска ответственный администратор должен иметь в наличии:

1. **Сервер базы данных PostgreSQL**:
   - Версия: PostgreSQL 14 или выше.
   - Выделенная база данных (например, `alibros_production`).
   - Пользователь с правами на создание таблиц, индексов и расширения `uuid-ossp` / `pgcrypto`.
2. **Аккаунты Telegram Bots (через @BotFather)**:
   - Бот для клиентов: получить токен, создать Menu Button типа `web_app`, указать URL `https://logistics.alibros.ru/miniapp`.
   - Бот для водителей: получить токен для вебхука и рассылки уведомлений.
3. **Google Cloud Platform Project**:
   - Включенный API: Google Sheets API v4.
   - Сервисный аккаунт (`*.iam.gserviceaccount.com`) с выгруженным приватным ключом.
   - Созданная Google Таблица с правами Editor для email сервисного аккаунта.
4. **Облачное хранилище S3 (Yandex Cloud / AWS / Selectel)**:
   - Созданный приватный бакет.
   - Статические ключи доступа (Key ID + Secret Key).
5. **Хостинг / Сервер приложений**:
   - Vercel, Docker Swarm или Kubernetes.
   - Зарегистрированный домен с валидным SSL/TLS сертификатом (Let's Encrypt / Cloudflare).

---

## 3. Пошаговый регламент развертывания (Launch Sequence)

### Этап 1. Подготовка окружения (Pre-Flight)
- [ ] 1.1. В панели хостинга (Vercel / Kubernetes Secrets / Docker `.env.production`) задать все переменные из `docs/ENVIRONMENT_SETUP.md`.
- [ ] 1.2. Проверить, что значение `NODE_ENV` установлено в `production`.
- [ ] 1.3. Сгенерировать криптографические ключи `JWT_SECRET` (мин. 32 символа) и `CRON_SECRET` через `openssl rand -base64 32`.
- [ ] 1.4. Убедиться, что приватный ключ Google Service Account вставлен корректно (с сохранением переносов `
`).

### Этап 2. Миграция базы данных (Database Migration)
- [ ] 2.1. Создать резервную копию целевой базы данных перед применением миграций:
  ```bash
  pg_dump -h <host> -U <user> -d alibros_production > backup_pre_launch.sql
  ```
- [ ] 2.2. Запустить миграцию структуры БД:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] 2.3. Запустить сидирование системных справочников (12 подтверждённых складов):
  ```bash
  npx ts-node prisma/seed.ts
  ```
- [ ] 2.4. Проверить создание административного аккаунта (`SUPER_ADMIN`) и сменить его временный пароль.

### Этап 3. Регистрация Webhook в Telegram Bot API
- [ ] 3.1. Зарегистрировать вебхук для водительского бота:
  ```bash
  curl -F "url=https://logistics.alibros.ru/api/telegram/webhook"        -F "secret_token=<TELEGRAM_BOT_WEBHOOK_SECRET>"        https://api.telegram.org/bot<TELEGRAM_DRIVER_BOT_TOKEN>/setWebhook
  ```
- [ ] 3.2. Проверить статус вебхука:
  ```bash
  curl https://api.telegram.org/bot<TELEGRAM_DRIVER_BOT_TOKEN>/getWebhookInfo
  ```
  *(Значение `has_custom_certificate` должно быть `false`, `pending_update_count` близко к 0, `last_error_message` отсутствует).*

### Этап 4. Сборка и развертывание сервиса (Deploy)
- [ ] 4.1. Запустить production сборку:
  ```bash
  npm run build
  ```
- [ ] 4.2. Убедиться в успешной компиляции всех маршрутов (включая `/miniapp`, `/admin`, `/api/telegram/webhook`, `/api/cron/google-sheets-sync`).
- [ ] 4.3. Запустить сервис (`npm run start` или автоматический деплой Vercel).

### Этап 5. Пост-релизный Smoke-тест (Sanity Verification)
- [ ] 5.1. **Health Check**:
  Выполнить запрос к `GET /api/health` — должен вернуть статус `200 OK` и статус подключения БД.
- [ ] 5.2. **Web Portal**:
  Открыть страницу `/login`, проверить авторизацию менеджера, переход в `/admin`.
- [ ] 5.3. **Google Sheets Sync**:
  В админ-панели перейти в `/admin/integrations/google-sheets`, нажать кнопку **«Синхронизировать сейчас»**, убедиться в появлении строки заголовков в Google Таблице.
- [ ] 5.4. **S3 Upload & View**:
  Проверить загрузку тестовой фотографии через бота водителя и её отображение в галерее админ-панели через signed URL.
- [ ] 5.5. **Telegram Mini App**:
  Открыть бота клиента в мобильном приложении Telegram, нажать кнопку меню «Личный кабинет», убедиться в загрузке Mini App без ошибок авторизации.

---

## 4. План отката (Rollback Plan)

Если в ходе развертывания обнаружены критические сбои:

1. **Приложение**:
   - В Vercel: выполнить Instant Rollback на предыдущий Deployment.
   - В Docker/K8s: переключить ingress-роутинг на предыдущую версию контейнера.
2. **База данных**:
   - При ошибках миграций: восстановить дамп из `backup_pre_launch.sql`.
3. **Telegram Bot**:
   - В случае ошибок вебхука: временно отключить вебхук (`deleteWebhook`), чтобы Telegram аккумулировал апдейты в очереди, предотвращая потерю сообщений от водителей.
