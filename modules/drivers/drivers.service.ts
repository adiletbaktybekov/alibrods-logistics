import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { CreateDriverProfileDto } from './drivers.dto';

export class DriversService {
  public static async getByUserId(userId: string) {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId },
      include: { user: { select: { phone: true, email: true, isActive: true } } },
    });
    if (!driver) throw new NotFoundError('DriverProfile for user', userId);
    return driver;
  }

  public static async listAvailable() {
    return prisma.driverProfile.findMany({
      where: { isAvailable: true, user: { isActive: true } },
      include: { user: { select: { phone: true, email: true } } },
    });
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
