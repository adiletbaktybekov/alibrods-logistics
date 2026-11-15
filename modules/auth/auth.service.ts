import { prisma } from '@/database/prisma';
import { hashPassword, verifyPassword, validateClientPassword } from '@/lib/security/password';
import { signAuthToken } from '@/lib/security/jwt';
import { UnauthorizedError, ConflictError, ValidationError } from '@/lib/errors';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import { LoginDto, RegisterClientDto } from './auth.dto';

import { normalizePhoneNumber } from '@/lib/phone';

export class AuthService {
  public static async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const rawLogin = dto.login.trim();
    const normalizedPhone = normalizePhoneNumber(rawLogin);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
          { phone: rawLogin },
          { email: rawLogin.toLowerCase() },
        ],
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Неверный номер Telegram или пароль');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Учётная запись деактивирована. Обратитесь к администратору.');
    }

    const isValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Неверный номер Telegram или пароль');
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signAuthToken({
      userId: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      tokenVersion: user.tokenVersion ?? 1,
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      resource: 'User',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      token,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        phone: user.phone,
      },
    };
  }

  public static async registerClient(dto: RegisterClientDto, ipAddress?: string, userAgent?: string) {
    const passwordCheck = validateClientPassword(dto.password);
    if (!passwordCheck.isValid) {
      throw new ValidationError(passwordCheck.error || 'Пароль должен содержать как минимум 8 символов');
    }

    const normalizedPhone = normalizePhoneNumber(dto.phone);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: dto.phone },
          ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictError('Пользователь с таким номером Telegram уже зарегистрирован');
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await prisma.user.create({
      data: {
        email: dto.email ? dto.email.toLowerCase() : null,
        phone: normalizedPhone,
        passwordHash,
        role: UserRole.CLIENT,
        isActive: true,
        clientProfile: {
          create: {
            companyName: dto.companyName,
            contactPerson: dto.contactPerson,
            contactPhone: normalizedPhone,
            contactEmail: dto.email || null,
            inn: dto.inn || null,
          },
        },
      },
      include: {
        clientProfile: true,
      },
    });

    const token = await signAuthToken({
      userId: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      tokenVersion: user.tokenVersion ?? 1,
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.CREATE,
      resource: 'User',
      resourceId: user.id,
      ipAddress,
      userAgent,
      metadata: { role: UserRole.CLIENT, companyName: dto.companyName },
    });

    return { token, user };
  }
}
