# AliBros Logistics — Environment Setup & Configuration Guide

Данное руководство содержит исчерпывающее описание всех переменных окружения платформы **AliBros Logistics**, правила генерации криптографических ключей, параметры внешних интеграций и требования для развертывания в Production-окружении (Vercel / VPS / Docker / Kubernetes).

---

## 1. Категории и обязательность переменных окружения

### 1.1. Базовые переменные запуска (Обязательны для работы приложения)

| Переменная | Назначение | Пример / Шаблон | Безопасность |
|---|---|---|---|
| `NODE_ENV` | Режим работы (`production`) | `production` | Публичная |
| `NEXT_PUBLIC_APP_URL` | Публичный HTTPS URL платформы | `https://logistics.your-domain.com` | Публичная (в сборке) |
| `NEXT_PUBLIC_API_URL` | Публичный HTTPS URL API | `https://logistics.your-domain.com/api/v1` | Публичная (в сборке) |
| `DATABASE_URL` | Connection string PostgreSQL (SSL) | `postgresql://<USER>:<PASS>@<HOST>:5432/<DB>?sslmode=require` | **Строго секретно** |
| `JWT_SECRET` | 256-битный ключ подписи сессионных JWT | `<32+_BYTE_BASE64_STRING>` | **Строго секретно** |
| `CRON_SECRET` | Токен авторизации фоновых Cron-задач | `<32+_HEX_STRING>` | **Строго секретно** |

### 1.2. Переменные внешних интеграций (Обязательны для работы соответствующих сервисов)

| Переменная | Назначение | Формат / Источник | Безопасность |
|---|---|---|---|
| `TELEGRAM_CLIENT_BOT_TOKEN` | Токен бота селлеров (Mini App) | Получить у @BotFather | **Строго секретно** |
| `TELEGRAM_DRIVER_BOT_TOKEN` | Токен бота водителей (рейсы, фото) | Получить у @BotFather | **Строго секретно** |
| `TELEGRAM_BOT_WEBHOOK_SECRET` | Секретный токен заголовка вебхука | Сгенерировать hex (24 байта) | **Строго секретно** |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`| Email сервисного аккаунта GCP | `account@project.iam.gserviceaccount.com` | Идентификатор |
| `GOOGLE_PRIVATE_KEY` | Приватный ключ RSA (RS256) | `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
` | **Строго секретно** |
| `GOOGLE_SHEETS_SPREADSHEET_ID`| ID Google Таблицы бухгалтерии | Строка из URL таблицы | Идентификатор |
| `S3_ENDPOINT` | URL S3-хранилища | `https://storage.yandexcloud.net` | Конфигурация |
| `S3_REGION` | Регион S3 | `ru-central1` | Конфигурация |
| `S3_BUCKET` | Имя приватного бакета фотоотчётов | `alibros-delivery-photos` | Конфигурация |
| `S3_ACCESS_KEY_ID` | Статический ключ доступа S3 IAM | `YCAJ...` | **Строго секретно** |
| `S3_SECRET_ACCESS_KEY` | Секретный ключ S3 IAM | `YCP...` | **Строго секретно** |

### 1.3. Опциональные и сервисные параметры

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `PORT` | Порт Node.js процесса | `3000` |
| `LOG_LEVEL` | Уровень логирования pino | `info` в production (`debug` в dev) |
| `JWT_EXPIRES_IN` | Срок жизни пользовательских сессий | `7d` |
| `TELEGRAM_MANAGER_BOT_TOKEN` | Опциональный оперативный бот менеджеров | Отсутствует |
| `GOOGLE_SHEETS_SHEET_NAME` | Название рабочего листа в Google Таблице | `Заявки` |
| `S3_FORCE_PATH_STYLE` | Принудительный Path-Style (для MinIO) | `false` (для Yandex/AWS) |
| `RATE_LIMIT_MAX_REQUESTS` | Лимит запросов на IP в окне | `100` |
| `RATE_LIMIT_WINDOW_MS` | Окно лимитирования в миллисекундах | `60000` (1 минута) |

---

## 2. Инструкции по получению и генерации секретов

### 2.1. JWT_SECRET и CRON_SECRET
Секреты генерируются через встроенную утилиту `openssl`:

```bash
# Генерация JWT_SECRET (256 бит, base64)
openssl rand -base64 32

# Генерация CRON_SECRET (256 бит, hex)
openssl rand -hex 32
```

### 2.2. PostgreSQL Connection (`DATABASE_URL`)
Строка подключения должна содержать параметры SSL для безопасной передачи данных:
```
DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>?schema=public&sslmode=require"
```
> [!TIP]
> При развертывании в Serverless-среде (Vercel) рекомендуется использовать Connection Pooling (PgBouncer или встроенный пул Supabase/Neon).

### 2.3. Telegram Bot API и Webhook Secret
1. Создайте двух отдельных ботов через официального [@BotFather](https://t.me/BotFather):
   - **Client Mini App Bot**: для селлеров (кнопка меню «Личный кабинет» с URL `https://your-domain.com/miniapp`).
   - **Driver Bot**: для водителей (получение рейсов, смена статусов, отправка фотоотчётов).
2. Сгенерируйте секретный токен для вебхука водительского бота:
   ```bash
   openssl rand -hex 24
   ```
3. Установите вебхук для бота водителей:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_DRIVER_BOT_TOKEN>/setWebhook"      -H "Content-Type: application/json"      -d '{
       "url": "https://your-domain.com/api/telegram/webhook",
       "secret_token": "<YOUR_TELEGRAM_BOT_WEBHOOK_SECRET>",
       "allowed_updates": ["message", "callback_query"]
     }'
   ```

### 2.4. Google Sheets API (Service Account)
1. В Google Cloud Console создайте проект и включите **Google Sheets API v4**.
2. В разделе **IAM & Admin -> Service Accounts** создайте сервисный аккаунт.
3. Во вкладке **Keys** сгенерируйте ключ типа **JSON** и выгрузите его.
4. Значения:
   - `client_email` $	o$ в `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - `private_key` $	o$ в `GOOGLE_PRIVATE_KEY` (с сохранением реальных переносов строк или экранированных `
`).
5. **Обязательно**: в Google Таблице нажмите кнопку **«Поделиться» (Share)** и добавьте email сервисного аккаунта с ролью **Редактор (Editor)**.

### 2.5. S3 Object Storage (Yandex Object Storage / AWS S3)
1. Создайте бакет (напр. `alibros-delivery-photos`).
2. Установите ACL бакета в **Private** (публичный доступ строго закрыт).
3. Создайте сервисный аккаунт с правами чтения/записи в бакет и сгенерируйте статический ключ (`Access Key ID` и `Secret Access Key`).
