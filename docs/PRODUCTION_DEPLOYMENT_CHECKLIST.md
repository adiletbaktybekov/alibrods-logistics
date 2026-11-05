# AliBros Logistics — Production Deployment Checklist

Финальный контрольный список операционных действий перед, во время и после развертывания проекта **AliBros Logistics** в промышленную эксплуатацию (Production).

---

## 1. Фаза 0: Предварительная верификация (Pre-Deployment Audit)

- [ ] **1.1. Git и репозиторий**:
  - [ ] Ветка `main` содержит проверенную версию кодовой базы.
  - [ ] Рабочее дерево чистое (`git status` без незакоммиченных изменений).
  - [ ] `.gitignore` исключает `.env`, `.env*.local`, `.env.production`, `*.pem`, `*.log`.
  - [ ] В истории коммитов отсутствуют реальные секретные ключи или токены.
- [ ] **1.2. Качество кода и тесты**:
  - [ ] `npm run typecheck` завершается с **0 ошибок**.
  - [ ] `npm run lint` завершается без warnings и errors.
  - [ ] `npm run test` проходит успешно (**111 тестов из 111**).
  - [ ] `npm run build` успешно компилирует все 23 маршрута Next.js.

---

## 2. Фаза 1: Подготовка целевой инфраструктуры

- [ ] **2.1. База данных PostgreSQL**:
  - [ ] Развёрнут экземпляр PostgreSQL 14+ с включённым SSL (`sslmode=require`).
  - [ ] Доступность пула соединений (PgBouncer или управляемый Connection Pooler).
  - [ ] Создана резервная копия перед первой миграцией.
- [ ] **2.2. Telegram Bot API**:
  - [ ] Создан Client Bot в @BotFather, настроена кнопка Web App (`https://logistics.alibros.ru/miniapp`).
  - [ ] Создан Driver Bot в @BotFather для получения рейсов и отправки фотоотчётов.
  - [ ] Сгенерирован 24-байтный hex-секрет `TELEGRAM_BOT_WEBHOOK_SECRET`.
- [ ] **2.3. Google Cloud Platform (Бухгалтерия)**:
  - [ ] Включен Google Sheets API v4 в GCP Console.
  - [ ] Создан сервисный аккаунт (`alibros-sheets-sync@...`).
  - [ ] Создана Google Таблица бухгалтерии, сервисному аккаунту предоставлены права **Редактор (Editor)**.
  - [ ] ID таблицы и приватный ключ добавлены в безопасное хранилище секретов.
- [ ] **2.4. S3 Object Storage**:
  - [ ] Создан приватный бакет (ACL `private`, публичный листинг закрыт).
  - [ ] Настроены CORS-правила для домена платформы.
  - [ ] Создан IAM сервисный аккаунт со статическими ключами доступа.
- [ ] **2.5. Планировщик фоновых задач (Cron)**:
  - [ ] Сгенерирован `CRON_SECRET` (`openssl rand -hex 32`).
  - [ ] В Vercel или внешнем cron настроен опрос `/api/cron/google-sheets-sync` каждые 15 минут.

---

## 3. Фаза 2: Выполнение развертывания (Deployment Execution)

- [ ] **3.1. Установка переменных окружения**:
  - [ ] Заданы все обязательные переменные из `docs/ENVIRONMENT_SETUP.md`.
  - [ ] Проверено, что `NODE_ENV=production`.
- [ ] **3.2. Миграция структуры БД**:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] **3.3. Сидирование справочников складов**:
  ```bash
  npm run prisma:seed
  ```
- [ ] **3.4. Инициализация первого SUPER_ADMIN**:
  ```bash
  ADMIN_EMAIL="admin@alibros.ru"   ADMIN_PASSWORD="<STRONG_PASSWORD_MIN_12_CHARS>"   npm run admin:init
  ```
- [ ] **3.5. Регистрация Webhook в Telegram**:
  ```bash
  curl -F "url=https://logistics.alibros.ru/api/telegram/webhook"        -F "secret_token=<TELEGRAM_BOT_WEBHOOK_SECRET>"        https://api.telegram.org/bot<TELEGRAM_DRIVER_BOT_TOKEN>/setWebhook
  ```

---

## 4. Фаза 3: Пост-релизный Smoke-тест (Sanity Check)

- [ ] **4.1. Health Check**:
  - [ ] `GET /api/health` возвращает `200 OK` и статус БД `connected`.
- [ ] **4.2. Авторизация администратора**:
  - [ ] Вход в `/login` под созданным `admin@alibros.ru`.
  - [ ] Доступен переход в `/admin` и просмотр разделов.
- [ ] **4.3. Регистрация селлера**:
  - [ ] Создание аккаунта на `/register`.
  - [ ] Успешное создание тестовой заявки на ближайший открытый склад.
- [ ] **4.4. Проверка Google Sheets**:
  - [ ] В `/admin/integrations/google-sheets` нажать «Синхронизировать сейчас».
  - [ ] Проверить появление строки с заявкой в таблице Google.
- [ ] **4.5. Проверка Telegram Mini App**:
  - [ ] Запуск бота клиентов в Telegram, открытие «Личного кабинета».
  - [ ] Проверка отображения созданной заявки.

---

## 5. План отката (Emergency Rollback)

В случае критического сбоя:
1. **Приложение**: Выполнить мгновенный откат (Instant Rollback) на предыдущий стабильный релиз в панели Vercel / Kubernetes.
2. **База данных**: Восстановить снимок данных из резервной копии (`pg_restore`).
3. **Telegram Webhook**: При ошибках обработчика вызвать `deleteWebhook`, чтобы Telegram не сбрасывал обновления от водителей, а аккумулировал их до устранения неполадки.
