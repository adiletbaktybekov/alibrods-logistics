import { prisma } from '@/database/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { Prisma, UserRole, AuditAction } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { CreateDriverProfileDto, RegisterDriverDto } from './drivers.dto';

export type DriverListItem = Prisma.DriverProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        phone: true;
        email: true;
        isActive: true;
        telegramAccount: {
          select: {
            telegramId: true;
            username: true;
          };
        };
      };
    };
    _count: {
      select: {
        assignments: true;
      };
    };
  };
}>;

export class DriversService {
  public static async listAll(): Promise<DriverListItem[]> {
    if (!process.env.DATABASE_URL) return [] as DriverListItem[];
    try {
      return await prisma.driverProfile.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              email: true,
              isActive: true,
              telegramAccount: {
                select: {
                  telegramId: true,
                  username: true,
                },
              },
            },
          },
          _count: {
            select: {
              assignments: true,
            },
          },
        },
      });
    } catch {
      return [] as DriverListItem[];
    }
  }

  public static async getByUserId(userId: string) {
    if (!process.env.DATABASE_URL) throw new NotFoundError('DriverProfile for user', userId);
    const driver = await prisma.driverProfile.findUnique({
      where: { userId },
      include: { user: { select: { phone: true, email: true, isActive: true } } },
    });
    if (!driver) throw new NotFoundError('DriverProfile for user', userId);
    return driver;
  }

  public static async listAvailable() {
    if (!process.env.DATABASE_URL) return [];
    try {
      return await prisma.driverProfile.findMany({
        where: { isAvailable: true, user: { isActive: true } },
        include: { user: { select: { phone: true, email: true } } },
      });
    } catch {
      return [];
    }
  }

  public static async registerDriver(
    dto: RegisterDriverDto,
    performedByUserId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.user.findFirst({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictError('Пользователь с таким номером телефона уже существует');
    }

    const user = await prisma.user.create({
      data: {
        phone: dto.phone,
        role: UserRole.DRIVER,
        isActive: true,
        driverProfile: {
          create: {
            fullName: dto.fullName,
            vehicleModel: dto.vehicleModel,
            vehiclePlateNumber: dto.vehiclePlateNumber,
            notes: dto.notes,
            isAvailable: true,
          },
        },
      },
      include: {
        driverProfile: true,
      },
    });

    await AuditService.log({
      userId: performedByUserId,
      action: AuditAction.CREATE,
      resource: 'DriverProfile',
      resourceId: user.driverProfile?.id,
      ipAddress,
      metadata: { phone: dto.phone, fullName: dto.fullName },
    });

    return user.driverProfile;
  }

  public static async create(dto: CreateDriverProfileDto) {
    return prisma.driverProfile.create({ data: dto });
  }

  public static async setAvailability(driverId: string, isAvailable: boolean) {
    return prisma.driverProfile.update({
      where: { id: driverId },
      data: { isAvailable },
    });
  }
}
