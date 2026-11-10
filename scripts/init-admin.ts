import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { PrismaClient, UserRole, AuditAction } from '@prisma/client';
import argon2 from 'argon2';

const require = createRequire(import.meta.url);
const {
  verifyTargetDatabase: checkTargetSafety,
  ALLOWED_ENDPOINT_ID,
  ALLOWED_DATABASE_NAME,
} = require('./check-db-target.js');

let prisma: PrismaClient;

/**
 * Валидация сложности пароля администратора:
 * - Минимум 12 символов
 * - Хотя бы одна заглавная буква (A-Z)
 * - Хотя бы одна строчная буква (a-z)
 * - Хотя бы одна цифра (0-9)
 * - Хотя бы один специальный символ
 */
export function validatePasswordComplexity(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { isValid: false, error: 'Пароль должен содержать как минимум 12 символов' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну заглавную латинскую букву (A-Z)' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну строчную латинскую букву (a-z)' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну цифру (0-9)' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы один специальный символ (!@#$%^&*()_+-=[]{};\':"\\|,.<>/?)' };
  }
  return { isValid: true };
}

/**
 * Скрытый интерактивный ввод через terminal readline + muted Writable stream.
 * Символы пароля не отображаются в stdout терминала, исключая утечку через экран или логи.
 */
function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(query);
    muted = true;

    rl.question('', (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Обычный интерактивный ввод строки
 */
function promptVisible(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Строгая проверка целевой базы данных:
 * Использует централизованный валидатор scripts/check-db-target.js.
 * Разрешён запуск исключительно на dedicated Staging endpoint ep-restless-wave-b9k0ye9q / neondb.
 */
export function verifyTargetDatabase(databaseUrl = process.env.DATABASE_URL, directUrl = process.env.DIRECT_URL) {
  console.log('----------------------------------------------------------------');
  console.log(`🔒 Проверка безопасности целевой базы данных (${ALLOWED_ENDPOINT_ID}/${ALLOWED_DATABASE_NAME})...`);

  try {
    const res = checkTargetSafety(databaseUrl, directUrl);
    console.log(`✅ Целевая база подтверждена: Neon Staging (${res.endpointId}/${res.database})`);
    console.log(`🌐 Direct Host: ${res.directHost}`);
    console.log(`📡 Pooled Host: ${res.pooledHost}`);
    console.log('----------------------------------------------------------------');
    return res;
  } catch (err: unknown) {
    console.error('----------------------------------------------------------------');
    console.error('🛑 АВАРИЙНАЯ ОСТАНОВКА БЕЗОПАСНОСТИ:');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('Запуск заблокирован для предотвращения изменения Production или неразрешённой базы данных.');
    console.error('----------------------------------------------------------------');
    process.exit(1);
  }
}

/**
 * Безопасное получение и подтверждение пароля.
 * Пароль НЕ принимается из аргументов командной строки process.argv,
 * чтобы предотвратить его попадание в историю команд (history) и вывод списка процессов (ps).
 */
async function getAdminPassword(): Promise<string> {
  let password = process.env.ADMIN_PASSWORD || '';

  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('❌ Ошибка: Неинтерактивный режим терминала (no TTY).');
      console.error('Для выполнения в CI/скриптах передайте ADMIN_PASSWORD через переменные окружения.');
      process.exit(1);
    }

    const pass1 = await promptHidden('🔑 Введите пароль для SUPER_ADMIN (ввод скрыт): ');
    const pass2 = await promptHidden('🔑 Повторите пароль для подтверждения (ввод скрыт): ');

    if (!pass1) {
      console.error('❌ Ошибка: Пароль не может быть пустым.');
      process.exit(1);
    }

    if (pass1 !== pass2) {
      console.error('❌ Ошибка безопасности: Введённые пароли не совпадают.');
      process.exit(1);
    }

    password = pass1;
  }

  const complexity = validatePasswordComplexity(password);
  if (!complexity.isValid) {
    console.error(`❌ Ошибка безопасности: Пароль не соответствует требованиям сложности:`);
    console.error(`   👉 ${complexity.error}`);
    console.error('   Требования к паролю:');
    console.error('   - минимум 12 символов');
    console.error('   - хотя бы одна заглавная буква (A-Z)');
    console.error('   - хотя бы одна строчная буква (a-z)');
    console.error('   - хотя бы одна цифра (0-9)');
    console.error('   - хотя бы один специальный символ (!@#$%^&*()_+-=[]{};\':"\\|,.<>/?)');
    process.exit(1);
  }

  return password;
}

/**
 * Получение email администратора
 */
async function getAdminEmail(): Promise<string> {
  let email = (process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
  if (!email && process.stdin.isTTY) {
    email = (await promptVisible('📧 Введите email администратора (например: admin@alibros.ru): ')).trim().toLowerCase();
  }

  if (!email || !email.includes('@') || !email.includes('.')) {
    console.error('❌ Ошибка: Укажите корректный ADMIN_EMAIL (например: admin@alibros.ru)');
    console.error('Использование: ADMIN_EMAIL=admin@alibros.ru npm run admin:init');
    process.exit(1);
  }

  return email;
}

/**
 * Получение ФИО администратора (по умолчанию: Главный Администратор)
 */
function getAdminFullName(): string {
  return (process.env.ADMIN_NAME || process.argv[3] || 'Главный Администратор').trim();
}


/**
 * Безопасная инициализация первого SUPER_ADMIN в Staging.
 */
async function initAdmin() {
  console.log('🚀 Инициализация первого SUPER_ADMIN для AliBros Logistics');

  // 1. Строгая проверка целевой базы данных до подключения к ней
  verifyTargetDatabase();

  if (!prisma) {
    prisma = new PrismaClient();
  }

  // 2. Проверяем, существует ли уже SUPER_ADMIN в базе данных
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
  });

  if (existingSuperAdmin) {
    console.warn('⚠️ Внимание: аккаунт SUPER_ADMIN уже существует в базе данных.');
    console.warn(`ID администратора: ${existingSuperAdmin.id}, Email: ${existingSuperAdmin.email}`);
    console.warn('Создание второго SUPER_ADMIN через init-admin заблокировано в целях безопасности.');
    process.exit(0);
  }

  // 3. Получение данных администратора
  const email = await getAdminEmail();
  const fullName = getAdminFullName();


  // 4. Проверяем, не занят ли указанный email другим пользователем
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    console.error(`❌ Ошибка: пользователь с email "${email}" уже существует (роль: ${existingUserByEmail.role}).`);
    process.exit(1);
  }

  // 5. Безопасный ввод и валидация пароля
  const password = await getAdminPassword();

  // 6. Хэшируем пароль по стандарту Argon2id (память 64МБ, 3 итерации, 4 параллельных потока)
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 7. Создаём аккаунт SUPER_ADMIN и профиль менеджера в единой ACID-транзакции
  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        isVerified: true,
        managerProfile: {
          create: {
            fullName,
            department: 'Руководство',
            notes: 'Первоначальный администратор системы (создан через init-admin)',
          },
        },
      },
      include: {
        managerProfile: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.CREATE,
        resource: 'User',
        resourceId: user.id,
        metadata: {
          role: UserRole.SUPER_ADMIN,
          initiatedVia: 'cli-init-admin',
          email,
        },
      },
    });

    return user;
  });

  console.log('================================================================');
  console.log('✅ SUPER_ADMIN успешно создан!');
  console.log(`Email:      ${admin.email}`);
  console.log(`ФИО:        ${admin.managerProfile?.fullName}`);
  console.log(`Роль:       ${admin.role}`);
  console.log(`ID:         ${admin.id}`);
  console.log('================================================================');
}

// Запуск выполняется только если файл запущен напрямую через Node CLI
if (process.argv[1]?.includes('init-admin')) {
  initAdmin()
    .catch((err) => {
      console.error('Критическая ошибка при инициализации администратора:', err);
      process.exit(1);
    })
    .finally(async () => {
      if (prisma) {
        await prisma.$disconnect();
      }
    });
}
