import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  S3StorageProvider,
  resetFileStorageProvider,
  getFileStorageProvider,
} from '@/modules/storage/storage.service';
import { DriverPhotoService, MAX_PHOTO_SIZE_BYTES } from '@/modules/telegram/photo.service';
import { PhotoType, OrderStatus, UserRole } from '@prisma/client';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { prisma } from '@/database/prisma';

describe('Phase 6 — S3 Storage Provider & Delivery Photos', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    resetFileStorageProvider();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. S3StorageProvider Configuration & Compatibility', () => {
    it('detects when S3 is NOT configured without throwing uncaught errors', () => {
      delete process.env.S3_BUCKET;
      delete process.env.AWS_S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.AWS_ACCESS_KEY_ID;

      const provider = new S3StorageProvider();
      expect(provider.isConfigured()).toBe(false);
    });

    it('successfully configures for generic S3 (Yandex Object Storage, MinIO)', () => {
      process.env.S3_ENDPOINT = 'https://storage.yandexcloud.net';
      process.env.S3_BUCKET = 'alibros-yandex-bucket';
      process.env.S3_REGION = 'ru-central1';
      process.env.S3_ACCESS_KEY_ID = 'TEST_YANDEX_KEY_ID';
      process.env.S3_SECRET_ACCESS_KEY = 'TEST_YANDEX_SECRET';

      const provider = new S3StorageProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it('supports backward compatibility with AWS_S3_* environment variables', () => {
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;

      process.env.AWS_S3_BUCKET = 'alibros-aws-bucket';
      process.env.AWS_REGION = 'eu-central-1';
      process.env.AWS_ACCESS_KEY_ID = 'TEST_AWS_KEY';
      process.env.AWS_SECRET_ACCESS_KEY = 'TEST_AWS_SECRET';

      const provider = new S3StorageProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it('returns graceful unconfigured result when uploading without active credentials', async () => {
      delete process.env.S3_BUCKET;
      delete process.env.AWS_S3_BUCKET;

      const provider = new S3StorageProvider();
      const res = await provider.uploadFile({
        key: 'orders/123/pickup/test.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        mimeType: 'image/jpeg',
      });

      expect(res.success).toBe(false);
      expect(res.isConfigured).toBe(false);
      expect(res.message).toContain('хранилище S3 не подключено');
    });
  });

  describe('2. Binary Format (Magic Bytes) & File Validation', () => {
    it('accurately detects JPEG, PNG, and WEBP magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // RIFF....WEBP
      const webpBuffer = Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP', 'ascii'),
      ]);

      expect(DriverPhotoService.detectMimeType(jpegBuffer)).toBe('image/jpeg');
      expect(DriverPhotoService.detectMimeType(pngBuffer)).toBe('image/png');
      expect(DriverPhotoService.detectMimeType(webpBuffer)).toBe('image/webp');
    });

    it('rejects invalid or disguised binary formats (e.g. PDF pretending to be JPEG)', () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 file content disguised as jpeg');

      expect(DriverPhotoService.detectMimeType(pdfBuffer)).toBeNull();

      expect(() => {
        DriverPhotoService.validatePhoto(pdfBuffer.length, 'image/jpeg', pdfBuffer);
      }).toThrow(ValidationError);
    });

    it('rejects files larger than 10 MB limit', () => {
      const oversizedBytes = MAX_PHOTO_SIZE_BYTES + 1024;
      expect(() => {
        DriverPhotoService.validatePhoto(oversizedBytes, 'image/jpeg');
      }).toThrow('превышает лимит 10 МБ');
    });
  });

  describe('3. Order Stage & Photo Category Validation', () => {
    it('permits CARGO_PICKUP only during pickup, transit, and delivery phases', () => {
      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.CARGO_PICKUP,
          OrderStatus.ACCEPTED_BY_DRIVER
        );
      }).not.toThrow();

      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.CARGO_PICKUP,
          OrderStatus.PICKED_UP
        );
      }).not.toThrow();

      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.CARGO_PICKUP,
          OrderStatus.CREATED
        );
      }).toThrow(ValidationError);
    });

    it('permits WAREHOUSE_ACCEPTANCE only when in transit or at warehouse', () => {
      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.WAREHOUSE_ACCEPTANCE,
          OrderStatus.DELIVERED_TO_WAREHOUSE
        );
      }).not.toThrow();

      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.WAREHOUSE_ACCEPTANCE,
          OrderStatus.ACCEPTED_BY_MARKETPLACE
        );
      }).not.toThrow();

      expect(() => {
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.WAREHOUSE_ACCEPTANCE,
          OrderStatus.ACCEPTED_BY_DRIVER
        );
      }).toThrow(ValidationError);
    });
  });

  describe('4. Deduplication & S3-PostgreSQL Atomic Consistency', () => {
    it('deduplicates Telegram updates if fileUniqueId was already recorded', async () => {
      process.env.DATABASE_URL = 'postgresql://mock';

      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-123',
        status: OrderStatus.PICKED_UP,
        assignments: [{ driverId: 'drv-456' }],
      } as any);

      vi.spyOn(prisma.orderPhoto, 'findFirst').mockResolvedValue({
        id: 'existing-photo-id',
        orderId: 'ord-123',
        fileKey: 'orders/ord-123/cargo_pickup/12345_unique_tg_file_id.jpg',
      } as any);

      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const result = await DriverPhotoService.processIncomingPhoto({
        driverProfileId: 'drv-456',
        orderId: 'ord-123',
        photoType: PhotoType.CARGO_PICKUP,
        fileSizeBytes: jpegBuffer.length,
        mimeType: 'image/jpeg',
        fileUniqueId: 'unique_tg_file_id',
        fileBuffer: jpegBuffer,
      });

      expect(result.success).toBe(true);
      expect(result.photoId).toBe('existing-photo-id');
      expect(result.message).toContain('уже был успешно загружен');
    });

    it('rolls back (deletes) S3 object if database insertion fails after S3 upload', async () => {
      process.env.DATABASE_URL = 'postgresql://mock';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.S3_ACCESS_KEY_ID = 'test-key';
      process.env.S3_SECRET_ACCESS_KEY = 'test-secret';

      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'ord-rollback',
        status: OrderStatus.PICKED_UP,
        assignments: [{ driverId: 'drv-456' }],
      } as any);

      vi.spyOn(prisma.orderPhoto, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.driverProfile, 'findUnique').mockResolvedValue({
        id: 'drv-456',
        userId: 'usr-driver',
      } as any);

      const storage = getFileStorageProvider();
      vi.spyOn(storage, 'isConfigured').mockReturnValue(true);
      vi.spyOn(storage, 'uploadFile').mockResolvedValue({
        success: true,
        isConfigured: true,
        fileKey: 'orders/ord-rollback/cargo_pickup/temp.jpg',
      });

      const deleteFileSpy = vi.spyOn(storage, 'deleteFile').mockResolvedValue({ success: true });

      // Simulate DB crash during OrderPhoto creation
      vi.spyOn(prisma.orderPhoto, 'create').mockRejectedValue(new Error('DB Connection Dropped'));

      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

      await expect(
        DriverPhotoService.processIncomingPhoto({
          driverProfileId: 'drv-456',
          orderId: 'ord-rollback',
          photoType: PhotoType.CARGO_PICKUP,
          fileSizeBytes: jpegBuffer.length,
          mimeType: 'image/jpeg',
          fileBuffer: jpegBuffer,
        })
      ).rejects.toThrow('DB Connection Dropped');

      // Assert rollback S3 deletion was invoked
      expect(deleteFileSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. RBAC & IDOR Access Logic for Photo Viewing', () => {
    it('blocks access if user is not the order client or assigned driver', () => {
      const order = {
        id: 'ord-idor',
        client: { userId: 'usr-client-owner' },
        assignments: [{ driver: { userId: 'usr-assigned-driver' } }],
      };

      const anotherClient = { id: 'usr-another-client', role: UserRole.CLIENT };
      const unassignedDriver = { id: 'usr-unassigned-driver', role: UserRole.DRIVER };
      const managerUser = { id: 'usr-manager', role: UserRole.MANAGER };

      // Helper simulating the RBAC logic in route handler
      function canViewPhoto(user: { id: string; role: UserRole }) {
        if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role)) {
          return true;
        }
        if (user.role === UserRole.CLIENT) {
          return order.client.userId === user.id;
        }
        if (user.role === UserRole.DRIVER) {
          return order.assignments.some((a) => a.driver.userId === user.id);
        }
        return false;
      }

      expect(canViewPhoto(anotherClient)).toBe(false);
      expect(canViewPhoto(unassignedDriver)).toBe(false);
      expect(canViewPhoto({ id: 'usr-client-owner', role: UserRole.CLIENT })).toBe(true);
      expect(canViewPhoto({ id: 'usr-assigned-driver', role: UserRole.DRIVER })).toBe(true);
      expect(canViewPhoto(managerUser)).toBe(true);
    });
  });
});
