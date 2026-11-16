import { describe, it, expect } from 'vitest';
import { registerClientSchema } from '@/modules/auth/auth.dto';
import { updateClientProfileSchema } from '@/modules/clients/clients.dto';

describe('Client Warehouse Address Validation', () => {
  describe('registerClientSchema', () => {
    const validBaseRegistration = {
      phone: '+79991234567',
      password: 'password123',
      companyName: 'ИП Иванов',
      contactPerson: 'Иван Иванов',
      contactPhone: '+79991234567',
      warehouseAddress: 'г. Москва, ул. Складская, д. 10',
    };

    it('should succeed when warehouseAddress is provided and at least 5 chars', () => {
      const parsed = registerClientSchema.safeParse(validBaseRegistration);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.warehouseAddress).toBe('г. Москва, ул. Складская, д. 10');
      }
    });

    it('should fail when warehouseAddress is missing', () => {
      const { warehouseAddress, ...rest } = validBaseRegistration;
      const parsed = registerClientSchema.safeParse(rest);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path.includes('warehouseAddress'))).toBe(true);
      }
    });

    it('should fail when warehouseAddress is shorter than 5 chars', () => {
      const parsed = registerClientSchema.safeParse({
        ...validBaseRegistration,
        warehouseAddress: 'Скл',
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path.includes('warehouseAddress'))).toBe(true);
      }
    });
  });

  describe('updateClientProfileSchema', () => {
    it('should accept updating warehouseAddress', () => {
      const parsed = updateClientProfileSchema.safeParse({
        warehouseAddress: 'Московская обл., г. Подольск, ул. Заводская, 15',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.warehouseAddress).toBe('Московская обл., г. Подольск, ул. Заводская, 15');
      }
    });

    it('should accept null or empty string to clear address if needed', () => {
      const parsedEmpty = updateClientProfileSchema.safeParse({
        warehouseAddress: '',
      });
      expect(parsedEmpty.success).toBe(true);

      const parsedNull = updateClientProfileSchema.safeParse({
        warehouseAddress: null,
      });
      expect(parsedNull.success).toBe(true);
    });
  });
});
