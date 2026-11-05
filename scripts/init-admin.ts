import { PrismaClient, UserRole, AuditAction } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Безопасная инициализация первого SUPER_ADMIN в Production / Staging.
 *
 * Требования безопасности:
 * 1. Никаких захардкоженных паролей.
 * 2. Пароль принимается через переменную окружения `ADMIN_PASSWORD` (мин. 12 символов).
 * 3. Email принимается через `ADMIN_EMAIL`.
 * 4. Защита от перезаписи: если SUPER_ADMIN уже существует в БД, скрипт завершается без изменений.
 * 5. Хэширование строго через Argon2id (память 64МБ, 3 итерации).
 * 6. Фиксация в AuditLog.
 */
async function initAdmin() {
  const email = (process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.argv[3] || '';
  const fullName = process.env.ADMIN_NAME || process.argv[4] || 'Главный Администратор';

  if (!email || !email.includes('@')) {
    console.error('❌ Ошибка: укажите корректный ADMIN_EMAIL (например: admin@alibros.ru)');
    console.error('Использование: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:init');
    process.exit(1);
  }

  if (!password || password.length < 12) {
    console.error('❌ Ошибка безопасности: ADMIN_PASSWORD должен содержать минимум 12 символов');
    process.exit(1);
  }

  // 1. Проверяем, существует ли уже SUPER_ADMIN в базе данных
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
  });

  if (existingSuperAdmin) {
    console.warn('⚠️ Внимание: аккаунт SUPER_ADMIN уже существует в базе данных.');
    console.warn(`ID администратора: ${existingSuperAdmin.id}, Email: ${existingSuperAdmin.email}`);
    console.warn('Перезапись существующего администратора заблокирована в целях безопасности.');
    process.exit(0);
  }

  // 2. Проверяем, не занят ли указанный email другим пользователем
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    console.error(`❌ Ошибка: пользователь с email "${email}" уже существует (роль: ${existingUserByEmail.role}).`);
    process.exit(1);
  }

  // 3. Хэшируем пароль по промышленному стандарту Argon2id
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 4. Создаём аккаунт SUPER_ADMIN и профиль менеджера в единой транзакции
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

initAdmin()
  .catch((err) => {
    console.error('Критическая ошибка при инициализации администратора:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
