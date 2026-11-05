# AliBros Logistics — Environment Setup & Configuration Guide

Данное руководство содержит исчерпывающее описание всех переменных окружения платформы **AliBros Logistics**, правила генерации криптографических ключей, параметры внешних интеграций и требования для развертывания в Production-окружении (Vercel / VPS / Docker / Kubernetes).

---

## 1. Сводная таблица переменных окружения

| Переменная | Обязательность | Назначение / Пример | Безопасность |
|---|---|---|---|
| `NODE_ENV` | Обязательно | `production`, `development`, `test` | Публичная |
| `PORT` | Опционально | Порт Node.js HTTP-сервера (по умолчанию `3000`) | Публичная |
| `NEXT_PUBLIC_APP_URL` | Обязательно | Базовый URL платформы (напр. `https://logistics.alibros.ru`) | Клиентская |
| `NEXT_PUBLIC_API_URL` | Обязательно | Базовый URL REST API (напр. `https://logistics.alibros.ru/api/v1`) | Клиентская |
| `LOG_LEVEL` | Опционально | Уровень логирования pino (`info`, `debug`, `warn`, `error`) | Публичная |
| `DATABASE_URL` | **Критично** | Connection string к PostgreSQL (`postgresql://...`) | **Строго секретно** |
| `JWT_SECRET` | **Критично** | 256-битный секретный ключ подписи JWT сессий | **Строго секретно** |
| `JWT_EXPIRES_IN` | Опционально | Срок действия JWT (по умолчанию `7d`) | Конфигурация |
| `CRON_SECRET` | **Критично** | Секретный токен для авторизации Vercel Cron / API задач | **Строго секретно** |
| `RATE_LIMIT_MAX_REQUESTS`| Опционально | Максимум запросов в окне (по умолчанию `100`) | Конфигурация |
| `RATE_LIMIT_WINDOW_MS` | Опционально | Окно лимитирования в мс (по умолчанию `60000`) | Конфигурация |
| `TELEGRAM_CLIENT_BOT_TOKEN` | Обязательно | Токен бота клиентов / Mini App от @BotFather | **Строго секретно** |
| `TELEGRAM_DRIVER_BOT_TOKEN` | Обязательно | Токен бота для водителей от @BotFather | **Строго секретно** |
| `TELEGRAM_MANAGER_BOT_TOKEN`| Опционально | Токен оперативного бота менеджеров | **Строго секретно** |
| `TELEGRAM_BOT_WEBHOOK_SECRET` | Обязательно | Секрет валидации заголовка `X-Telegram-Bot-Api-Secret-Token` | **Строго секретно** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`| Обязательно | Email сервисного аккаунта Google Cloud Platform | Идентификатор |
| `GOOGLE_PRIVATE_KEY` | **Критично** | Приватный ключ RSA (RS256) сервисного аккаунта | **Строго секретно** |
| `GOOGLE_SHEETS_SPREADSHEET_ID`| Обязательно | ID Google-таблицы бухгалтерии | Идентификатор |
| `GOOGLE_SHEETS_SHEET_NAME` | Опционально | Название рабочего листа (по умолчанию `Заявки`) | Конфигурация |
| `S3_ENDPOINT` | Обязательно | Endpoint S3-хранилища (напр. `https://storage.yandexcloud.net`) | Конфигурация |
| `S3_REGION` | Обязательно | Регион S3 (напр. `ru-central1` или `eu-central-1`) | Конфигурация |
| `S3_BUCKET` | Обязательно | Имя приватного бакета (напр. `alibros-delivery-photos`) | Конфигурация |
| `S3_ACCESS_KEY_ID` | **Критично** | Статический ключ доступа S3 IAM | **Строго секретно** |
| `S3_SECRET_ACCESS_KEY` | **Критично** | Секретный ключ S3 IAM | **Строго секретно** |
| `S3_FORCE_PATH_STYLE` | Опционально | `false` для Yandex/AWS, `true` для MinIO | Конфигурация |

---

## 2. Инструкции по получению и генерации секретов

### 2.1. JWT_SECRET и CRON_SECRET
Для генерации криптографически стойких 256-битных секретов используйте встроенную утилиту `openssl`:

```bash
# Генерация JWT_SECRET
openssl rand -base64 32

# Генерация CRON_SECRET
openssl rand -hex 32
```

### 2.2. PostgreSQL Connection (`DATABASE_URL`)
Строка подключения должна содержать параметры SSL для безопасной передачи данных через интернет:
```
DATABASE_URL="postgresql://alibros_user:SECURE_PASSWORD@postgres-host.internal:5432/alibros_production?schema=public&sslmode=require"
```
- Рекомендуется использовать Connection Pooling (PgBouncer или Supabase/Neon connection pooler) для предотвращения исчерпания соединений в serverless-среде Next.js.

### 2.3. Telegram Bot API и Webhook Secret
1. Создайте двух ботов через официального [@BotFather](https://t.me/BotFather):
   - **Client Mini App Bot**: имя `AliBros Client Bot` (привязывается меню-кнопка Web App).
   - **Driver Bot**: имя `AliBros Driver Bot` (для приёма рейсов и загрузки фото).
2. Сгенерируйте секретный токен для вебхука:
   ```bash
   openssl rand -hex 24
   ```
3. Установите вебхук для бота водителей:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_DRIVER_BOT_TOKEN>/setWebhook"      -H "Content-Type: application/json"      -d '{
       "url": "https://logistics.alibros.ru/api/telegram/webhook",
       "secret_token": "<TELEGRAM_BOT_WEBHOOK_SECRET>",
       "allowed_updates": ["message", "callback_query"]
     }'
   ```

### 2.4. Google Sheets API (Service Account)
1. В [Google Cloud Console](https://console.cloud.google.com/) создайте проект или выберите существующий.
2. Включите **Google Sheets API**.
3. В разделе **IAM & Admin -> Service Accounts** создайте сервисный аккаунт (например, `alibros-sheets-sync@...`).
4. Во вкладке **Keys** создайте новый ключ типа **JSON** и скачайте его.
5. Из скачанного JSON извлеките:
   - `client_email` $	o$ передаётся в `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - `private_key` $	o$ передаётся в `GOOGLE_PRIVATE_KEY` (с сохранением `
` или реальными переносами строк).
6. **Критически важный шаг**: откройте Google-таблицу бухгалтерии, нажмите кнопку **Поделиться (Share)** и добавьте email сервисного аккаунта с ролью **Редактор (Editor)**. Без этого Google API вернет `403 Forbidden / 404 Not Found`.

### 2.5. S3 Object Storage (Yandex Object Storage / AWS / MinIO)
1. Создайте бакет (напр. `alibros-delivery-photos`).
2. **Безопасность бакета**:
   - ACL: **Private** (публичный доступ к чтению/листингу строго запрещён).
   - Включите шифрование на стороне сервера (SSE-S3).
3. Создайте сервисный аккаунт с ролью `storage.editor` (или эквивалент) и сгенерируйте статический ключ доступа (`Access Key ID` и `Secret Access Key`).
4. Настройте CORS правила для бакета:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedOrigins": ["https://logistics.alibros.ru"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

---

## 3. Настройка автоматической синхронизации (Cron)

### 3.1. Vercel Cron (`vercel.json`)
Для автоматического запуска синхронизации Google Sheets добавьте файл `vercel.json` в корень репозитория:
```json
{
  "crons": [
    {
      "path": "/api/cron/google-sheets-sync",
      "schedule": "*/15 * * * *"
    }
  ]
}
```
*Vercel автоматически передаёт `Authorization: Bearer ${CRON_SECRET}` в запросах.*

### 3.2. Внешний планировщик (Linux Crontab / GitHub Actions)
Если проект развернут на VPS:
```bash
# Каждые 15 минут в crontab
*/15 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://logistics.alibros.ru/api/cron/google-sheets-sync > /dev/null
```
