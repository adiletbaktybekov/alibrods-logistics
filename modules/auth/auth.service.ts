import { prisma } from '@/database/prisma';
import { hashPassword, verifyPassword, validateClientPassword } from '@/lib/security/password';
import { signAuthToken } from '@/lib/security/jwt';
import { UnauthorizedError, ConflictError, ValidationError } from '@/lib/errors';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import { LoginDto, RegisterClientDto } from './auth.dto';

export class AuthService {
  public static async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: dto.login.toLowerCase() }, { phone: dto.login }],
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated. Please contact support.');
    }

    const isValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
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

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
          { phone: dto.phone },
        ],
      },
    });

    if (existing) {
      throw new ConflictError('User with this email or phone number already exists');
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await prisma.user.create({
      data: {
        email: dto.email ? dto.email.toLowerCase() : null,
        phone: dto.phone,
        passwordHash,
        role: UserRole.CLIENT,
        isActive: true,
        clientProfile: {
          create: {
            companyName: dto.companyName,
            contactPerson: dto.contactPerson,
            contactPhone: dto.phone,
            contactEmail: dto.email,
            inn: dto.inn,
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
