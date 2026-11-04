import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { UpdateAssignmentStatusDto } from './delivery.dto';

export class DeliveryService {
  public static async listDriverAssignments(driverProfileId: string) {
    return prisma.orderAssignment.findMany({
      where: { driverId: driverProfileId },
      include: {
        order: {
          include: {
            warehouse: true,
            client: { select: { companyName: true, contactPhone: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  public static async updateStatus(assignmentId: string, dto: UpdateAssignmentStatusDto) {
    const assignment = await prisma.orderAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundError('OrderAssignment', assignmentId);

    return prisma.orderAssignment.update({
      where: { id: assignmentId },
      data: {
        status: dto.status,
        notes: dto.notes,
        ...(dto.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(dto.status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
      },
    });
  }
}
