import { prisma } from '@/database/prisma';
import { PhotoType, OrderStatus, AuditAction } from '@prisma/client';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { getFileStorageProvider } from '@/modules/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { logger } from '@/lib/logger';

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface DriverPhotoSession {
  driverProfileId: string;
  orderId: string;
  photoType: PhotoType;
  expiresAt: Date;
}

// In-memory sessions for pending driver photo uploads
// Key: driverProfileId
const activePhotoSessions = new Map<string, DriverPhotoSession>();

export class DriverPhotoService {
  /**
   * Sets the active photo upload context for a driver (e.g., driver clicked "Send pickup photo").
   */
  public static setPendingUploadSession(
    driverProfileId: string,
    orderId: string,
    photoType: PhotoType
  ): void {
    activePhotoSessions.set(driverProfileId, {
      driverProfileId,
      orderId,
      photoType,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min TTL
    });
  }

  /**
   * Gets and validates active upload context for a driver.
   */
  public static getPendingUploadSession(driverProfileId: string): DriverPhotoSession | null {
    const session = activePhotoSessions.get(driverProfileId);
    if (!session) return null;

    if (session.expiresAt < new Date()) {
      activePhotoSessions.delete(driverProfileId);
      return null;
    }

    return session;
  }

  /**
   * Clears pending upload session.
   */
  public static clearPendingUploadSession(driverProfileId: string): void {
    activePhotoSessions.delete(driverProfileId);
  }

  /**
   * Inspects binary magic bytes to determine real image MIME type.
   */
  public static detectMimeType(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 4) {
      return null;
    }

    // JPEG: 0xFF, 0xD8, 0xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 0x89, 0x50, 0x4E, 0x47
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    // WEBP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  /**
   * Validates photo parameters, size, and real binary format.
   */
  public static validatePhoto(fileSizeBytes: number, mimeType: string, buffer?: Buffer): string {
    if (fileSizeBytes > MAX_PHOTO_SIZE_BYTES) {
      throw new ValidationError(
        `Размер файла (${Math.round(fileSizeBytes / 1024 / 1024)} МБ) превышает лимит 10 МБ`
      );
    }

    let detectedMime = mimeType.toLowerCase();

    if (buffer && buffer.length > 0) {
      const magicMime = this.detectMimeType(buffer);
      if (!magicMime) {
        throw new ValidationError(
          'Недопустимый бинарный формат файла. Разрешены только реальные изображения JPG, PNG и WEBP.'
        );
      }
      detectedMime = magicMime;
    }

    if (!ALLOWED_MIME_TYPES.includes(detectedMime)) {
      throw new ValidationError(
        `Недопустимый формат файла «${detectedMime}». Разрешены только JPG, PNG и WEBP.`
      );
    }

    return detectedMime;
  }

  /**
   * Validates that the photo category is appropriate for the current order status.
   */
  public static assertCategoryAllowedForStatus(photoType: PhotoType, status: OrderStatus): void {
    if (photoType === PhotoType.CARGO_PICKUP) {
      const allowedPickupStatuses: OrderStatus[] = [
        OrderStatus.ACCEPTED_BY_DRIVER,
        OrderStatus.PICKED_UP,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED_TO_WAREHOUSE,
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
      ];
      if (!allowedPickupStatuses.includes(status)) {
        throw new ValidationError(
          `Загрузка фото приёмки недоступна для заявки в статусе «${status}». Заявка должна быть принята водителем.`
        );
      }
    } else if (photoType === PhotoType.WAREHOUSE_ACCEPTANCE) {
      const allowedWhStatuses: OrderStatus[] = [
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED_TO_WAREHOUSE,
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
        OrderStatus.COMPLETED,
      ];
      if (!allowedWhStatuses.includes(status)) {
        throw new ValidationError(
          `Загрузка фото сдачи на склад маркетплейса недоступна для статуса «${status}». Груз должен быть в пути или доставлен.`
        );
      }
    }
  }

  /**
   * Processes an incoming photo from Telegram for an assigned order.
   */
  public static async processIncomingPhoto(params: {
    driverProfileId: string;
    orderId: string;
    photoType: PhotoType;
    fileSizeBytes: number;
    mimeType: string;
    fileUniqueId?: string;
    caption?: string;
    fileBuffer?: Buffer;
  }) {
    // 1. Validate size and binary format
    const validatedMimeType = this.validatePhoto(
      params.fileSizeBytes,
      params.mimeType,
      params.fileBuffer
    );

    if (!process.env.DATABASE_URL) {
      return {
        success: false,
        message: 'База данных не подключена для сохранения метаданных фото.',
      };
    }

    // 2. Verify driver assignment and order status
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: {
        assignments: {
          where: { driverId: params.driverProfileId },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order', params.orderId);
    }

    const isAssigned = order.assignments.some((a) => a.driverId === params.driverProfileId);
    if (!isAssigned) {
      throw new ForbiddenError('Заявка не назначена данному водителю. Фотоотчёт отклонён.');
    }

    // 3. Verify category compatibility with current order status
    this.assertCategoryAllowedForStatus(params.photoType, order.status);

    // 4. Idempotency check: deduplicate duplicate Telegram deliveries
    if (params.fileUniqueId) {
      const existingPhoto = await prisma.orderPhoto.findFirst({
        where: {
          orderId: params.orderId,
          fileKey: {
            contains: params.fileUniqueId,
          },
        },
      });

      if (existingPhoto) {
        logger.info(
          { orderId: params.orderId, fileUniqueId: params.fileUniqueId },
          'Duplicate photo upload detected; skipping duplicate insertion'
        );
        return {
          success: true,
          isConfigured: true,
          photoId: existingPhoto.id,
          message: 'Этот фотоотчёт уже был успешно загружен ранее.',
        };
      }
    }

    // 5. Check S3 storage provider configuration
    const storage = getFileStorageProvider();
    const ext = validatedMimeType === 'image/png' ? 'png' : validatedMimeType === 'image/webp' ? 'webp' : 'jpg';
    const uniqueSuffix = params.fileUniqueId ? `_${params.fileUniqueId}` : `_${Date.now()}`;
    const fileKey = `orders/${params.orderId}/${params.photoType.toLowerCase()}/${Date.now()}${uniqueSuffix}.${ext}`;

    if (!storage.isConfigured()) {
      logger.warn(
        { orderId: params.orderId, driverProfileId: params.driverProfileId },
        'Photo received and validated, but S3 cloud storage is inactive.'
      );

      // Honest fallback without faking cloud storage
      return {
        success: false,
        isConfigured: false,
        orderId: params.orderId,
        photoType: params.photoType,
        message:
          'Фотография проверена по размеру и формату, однако облачное хранилище S3 не настроено. Загрузите переменные S3_BUCKET и S3_ACCESS_KEY_ID.',
      };
    }

    // 6. Upload file buffer to S3
    const uploadResult = await storage.uploadFile({
      key: fileKey,
      buffer: params.fileBuffer || Buffer.from(''),
      mimeType: validatedMimeType,
      sizeBytes: params.fileSizeBytes,
    });

    if (!uploadResult.success) {
      return {
        success: false,
        isConfigured: true,
        message: uploadResult.error || 'Ошибка при загрузке фото в облачное хранилище S3',
      };
    }

    // 7. Save metadata in PostgreSQL with atomic rollback on DB failure
    const driver = await prisma.driverProfile.findUnique({
      where: { id: params.driverProfileId },
    });

    let photo;
    try {
      photo = await prisma.orderPhoto.create({
        data: {
          orderId: params.orderId,
          uploadedById: driver?.userId,
          photoUrl: uploadResult.url || fileKey,
          fileKey,
          type: params.photoType,
          caption: params.caption,
          fileSizeBytes: params.fileSizeBytes,
          mimeType: validatedMimeType,
        },
      });
    } catch (dbError) {
      // Rollback: delete orphaned file from S3 so storage remains consistent with DB
      logger.error(
        { dbError, fileKey },
        'Database insertion failed after S3 upload. Rolling back S3 object.'
      );
      await storage.deleteFile(fileKey);
      throw dbError;
    }

    // 8. Record in AuditLog
    await AuditService.log({
      userId: driver?.userId || 'system',
      action: AuditAction.CREATE,
      resource: 'OrderPhoto',
      resourceId: photo.id,
      metadata: {
        orderId: params.orderId,
        driverProfileId: params.driverProfileId,
        photoType: params.photoType,
        fileKey,
        fileSizeBytes: params.fileSizeBytes,
        mimeType: validatedMimeType,
      },
    });

    return {
      success: true,
      isConfigured: true,
      photoId: photo.id,
      fileKey,
      message: 'Фотоотчёт успешно сохранён в защищённое облачное хранилище S3.',
    };
  }
}

