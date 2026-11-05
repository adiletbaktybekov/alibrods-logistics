import { describe, it, expect } from 'vitest';
import { OrdersService } from '@/modules/orders/orders.service';
import { registerDriverSchema } from '@/modules/drivers/drivers.dto';
import { AuthenticatedUser } from '@/types/rbac';

describe('Admin Operations & Validations', () => {
  const clientUser: AuthenticatedUser = {
    id: 'user-client-1',
    role: 'CLIENT',
  };

  const driverUser: AuthenticatedUser = {
    id: 'user-driver-1',
    role: 'DRIVER',
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-manager-1',
    role: 'MANAGER',
  };

  describe('Order Rejection Rules', () => {
    it('should throw ValidationError if rejection reason is empty or whitespace', async () => {
      await expect(
        OrdersService.rejectOrder(managerUser, 'fake-order-id', '')
      ).rejects.toThrow('Причина отклонения обязательна');

      await expect(
        OrdersService.rejectOrder(managerUser, 'fake-order-id', '   ')
      ).rejects.toThrow('Причина отклонения обязательна');
    });

    it('should forbid CLIENT role from rejecting orders', async () => {
      await expect(
        OrdersService.rejectOrder(clientUser, 'fake-order-id', 'No capacity')
      ).rejects.toThrow('Только менеджеры могут отклонять заявки');
    });

    it('should forbid DRIVER role from rejecting orders', async () => {
      await expect(
        OrdersService.rejectOrder(driverUser, 'fake-order-id', 'No capacity')
      ).rejects.toThrow('Только менеджеры могут отклонять заявки');
    });
  });

  describe('Order Confirmation Rules', () => {
    it('should forbid CLIENT and DRIVER roles from confirming orders', async () => {
      await expect(
        OrdersService.confirmOrder(clientUser, 'fake-order-id')
      ).rejects.toThrow('Только менеджеры могут подтверждать заявки');

      await expect(
        OrdersService.confirmOrder(driverUser, 'fake-order-id')
      ).rejects.toThrow('Только менеджеры могут подтверждать заявки');
    });
  });

  describe('Driver Assignment Rules', () => {
    it('should forbid non-staff roles from assigning drivers', async () => {
      await expect(
        OrdersService.assignDriver(clientUser, 'fake-order-id', {
          driverProfileId: 'fake-driver-id',
        })
      ).rejects.toThrow('Only managers and administrators can assign drivers');

      await expect(
        OrdersService.assignDriver(driverUser, 'fake-order-id', {
          driverProfileId: 'fake-driver-id',
        })
      ).rejects.toThrow('Only managers and administrators can assign drivers');
    });
  });

  describe('Manager Internal Notes Rules', () => {
    it('should forbid CLIENT and DRIVER from editing manager notes', async () => {
      await expect(
        OrdersService.saveManagerNotes(clientUser, 'fake-order-id', 'Note')
      ).rejects.toThrow('Недостаточно прав');

      await expect(
        OrdersService.saveManagerNotes(driverUser, 'fake-order-id', 'Note')
      ).rejects.toThrow('Недостаточно прав');
    });
  });

  describe('Driver Registration DTO Validation', () => {
    it('should pass on valid driver registration data', () => {
      const validData = {
        fullName: 'Алексеев Пётр Николаевич',
        phone: '+79991234567',
        vehicleModel: 'ГАЗель Next',
        vehiclePlateNumber: 'В123ВВ777',
        notes: 'Пропуск в центр Москвы',
      };

      const result = registerDriverSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail if driver fullName is too short', () => {
      const invalidData = {
        fullName: 'Ив',
        phone: '+79991234567',
      };

      const result = registerDriverSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('минимум 3');
      }
    });

    it('should fail if phone number is invalid', () => {
      const invalidData = {
        fullName: 'Иван Сергеев',
        phone: 'invalid-phone-format',
      };

      const result = registerDriverSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('Некорректный номер');
      }
    });
  });
});
