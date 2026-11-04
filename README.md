# AliBros Logistics — Commercial Platform

> Единая цифровая платформа для логистической компании **AliBros Logistics**, обеспечивающей доставку и экспедирование товаров продавцов (селлеров) на склады маркетплейсов **Wildberries** и **Ozon**.

---

## 📌 О проекте

Платформа AliBros Logistics объединяет все ключевые бизнес-процессы компании в едином цифровом контуре:
- **Корпоративный сайт и Личный кабинет клиента**: оформление заявок, отслеживание статусов, просмотр фотоотчётов и актов приёмки.
- **Telegram Mini App для клиентов**: быстрый доступ к заказам и уведомлениям прямо из мессенджера.
- **Telegram-бот для водителей**: получение назначенных рейсов, изменение статусов («Забрал груз», «В пути», «Сдал на склад») и загрузка фотоотчётов без необходимости установки сторонних приложений.
- **Telegram-бот для менеджеров**: оперативные алерты, согласование заявок, назначение водителей.
- **Административная панель**: управление пользователями, складами, интеграциями и сквозной аудит.
- **Единая база данных PostgreSQL**: централизованное хранение и согласованная бизнес-логика без рассинхронизации.

---

## 🚀 Технологический стек

- **Web Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **Язык**: [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
- **UI & Стилизация**: [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **База данных и ORM**: [PostgreSQL](https://www.postgresql.org/), [Prisma ORM 6](https://www.prisma.io/)
- **Валидация данных**: [Zod](https://zod.dev/)
- **Безопасность**: [Argon2id](https://github.com/ranisalt/node-argon2), [Jose](https://github.com/panva/jose) (JWT HS256), HMAC-SHA256 (Telegram initData)
- **Структурированное логирование**: [Pino](https://getpino.io/)
- **Тестирование**: [Vitest](https://vitest.dev/)
- **API Документация**: OpenAPI 3.0 (`/api/v1/openapi`)

---

## 🏛 Архитектура: Модульный монолит

Архитектура системы построена по принципу **модульного монолита** с пятью изолированными слоями ответственности:
1. **Presentation Layer**: Next.js App Router (`app/`), UI-компоненты (`components/ui/`).
2. **API Layer**: Route Handlers (`app/api/`) с серверной валидацией Zod.
3. **Business Logic Layer**: Доменные сервисы (`modules/*/service.ts`) без привязки к фреймворку.
4. **Data Access Layer**: Репозитории и типизированный Prisma Client (`database/prisma.ts`).
5. **Infrastructure Layer**: Логирование (`lib/logger.ts`), безопасность (`lib/security/`), интеграции (`integrations/`).

Подробное описание архитектуры доступно в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🔒 Безопасность и RBAC

- **6 ролей пользователей**: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `DRIVER`, `CLIENT`.
- **Защита от IDOR (Insecure Direct Object References)**: каждый запрос к заказу проверяется на сервере. Клиент имеет доступ исключительно к своим заказам, водитель — только к назначенным ему рейсам.
- **Telegram WebApp Auth**: обязательная криптографическая проверка подписи `initData` алгоритмом HMAC-SHA256 по токену бота. Не доверенные Telegram ID и роли из браузера игнорируются.
- **Хеширование паролей**: Argon2id с параметрами OWASP (64MB памяти, 3 итерации, 4 потока).
- **Неизменяемый журнал аудита**: фиксация каждого критического действия в таблице `audit_logs`.

Подробное руководство по безопасности: [docs/SECURITY.md](docs/SECURITY.md).

---

## ⚡ Быстрый старт

### Требования
- **Node.js**: v20.x или v24.x (проверено на Node v24.21.0)
- **npm**: v10+ (проверено на npm 11.19.0)
- **PostgreSQL**: v15+ (опционально для первого запуска)

### Установка и запуск

1. **Клонирование репозитория**:
   ```bash
   git clone https://github.com/adiletbaktybekov/alibrods-logistics.git
   cd alibrods-logistics
   ```

2. **Установка зависимостей**:
   ```bash
   npm install
   ```

3. **Настройка переменных окружения**:
   ```bash
   cp .env.example .env.local
   # Отредактируйте .env.local при наличии реальных реквизитов БД и токенов
   ```

4. **Генерация Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

5. **Запуск тестов и линтера**:
   ```bash
   npm run test        # Запуск Vitest (22 теста)
   npm run typecheck   # Проверка TypeScript (tsc --noEmit)
   npm run lint        # Проверка ESLint
   ```

6. **Запуск в режиме разработки**:
   ```bash
   npm run dev
   # Откройте http://localhost:3000 в браузере
   ```

7. **Production сборка**:
   ```bash
   npm run build
   npm run start
   ```

---

## 📚 Документация проекта

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Домены, слои, поток данных и архитектурные инварианты.
- [DATABASE.md](docs/DATABASE.md) — Описание всех 14 сущностей, ER-диаграмма, индексы и статусы.
- [SECURITY.md](docs/SECURITY.md) — Матрица прав доступа (RBAC), криптография, защита API и аудит.
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) — Гайд для разработчиков, регламент Git, настройка PostgreSQL.
- [PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — Отчёт о выполненной Фазе 1 и рекомендации для Фазы 2.

---

## 📄 Лицензия

Коммерческий проект компании AliBros Logistics. Все права защищены.
