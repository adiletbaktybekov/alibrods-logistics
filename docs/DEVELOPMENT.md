# AliBros Logistics — Руководство по разработке (DEVELOPMENT.md)

## 1. Системные требования

- **Операционная система**: macOS / Linux / Windows (WSL2).
- **Node.js**: v20.x LTS или v24.x (текущая среда: Node.js v24.21.0).
- **Пакетный менеджер**: npm v10+ (текущая среда: npm 11.19.0).
- **База данных**: PostgreSQL 15+ (локально или в Docker).
- **Git**: v2.30+.

---

## 2. Локальная настройка проекта

### Шаг 1. Клонирование репозитория
```bash
git clone https://github.com/adiletbaktybekov/alibrods-logistics.git
cd alibrods-logistics
```

### Шаг 2. Установка зависимостей
```bash
npm install
```

### Шаг 3. Конфигурация окружения
Создайте файл `.env.local` на основе шаблона:
```bash
cp .env.example .env.local
```
Заполните параметры:
- `DATABASE_URL`: строка подключения к PostgreSQL.
- `JWT_SECRET`: ключ шифрования сессий (минимум 32 символа).
- `TELEGRAM_*`: токены ботов, полученные у `@BotFather`.

### Шаг 4. Настройка PostgreSQL через Docker (рекомендуется)
Если локальный PostgreSQL ещё не установлен, запустите контейнер:
```bash
docker run --name alibros-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=alibros_logistics \
  -p 5432:5432 -d postgres:16-alpine
```

### Шаг 5. Применение схемы Prisma
```bash
# Генерация TypeScript типов Prisma Client
npm run prisma:generate

# Создание и применение первой миграции (когда PostgreSQL запущен)
npx prisma migrate dev --name init_foundation
```

---

## 3. Доступные npm-скрипты

| Скрипт | Описание |
| :--- | :--- |
| `npm run dev` | Запуск сервера разработки Next.js на порту 3000. |
| `npm run build` | Компиляция production-сборки (`next build`). |
| `npm run start` | Запуск скомпилированного production-сервера. |
| `npm run test` | Однократный прогон unit и integration тестов через Vitest. |
| `npm run test:watch` | Интерактивный режим запуска тестов при изменении файлов. |
| `npm run typecheck` | Проверка типов всего проекта через компилятор TypeScript (`tsc --noEmit`). |
| `npm run lint` | Статический анализ кода через ESLint 9 (Next.js core web vitals). |
| `npm run prisma:generate` | Компиляция Prisma Client на основе `prisma/schema.prisma`. |
| `npm run prisma:validate` | Синтаксическая валидация схемы Prisma. |

---

## 4. Регламент работы с Git

1. **Ветки**:
   - `main` — стабильная production-ветка.
   - `develop` — интеграционная ветка разработки.
   - `feature/<название>` — ветка для новых фичей.
   - `fix/<название>` — ветка для исправления дефектов.
2. **Формат коммитов (Conventional Commits)**:
   - `feat(orders): add volumetric calculation`
   - `fix(security): sanitize telegram initData payload`
   - `docs(db): update er-diagram and status history`
3. **Безопасность Git**:
   - Запрещён force push в ветки `main` и `develop`.
   - Запрещено коммитить файлы с секретами (`.env`, `.pem`, токены).
   - Перед коммитом обязательно убедиться в прохождении `npm run lint`, `npm run typecheck` и `npm run test`.
