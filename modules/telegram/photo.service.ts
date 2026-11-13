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

export class DriverPhotoService {
  /**
   * Sets the active photo upload context for a driver in PostgreSQL with a 15 min TTL.
   * Ensures sessions persist across Vercel serverless containers.
   */
  public static async setPendingUploadSession(
    driverProfileId: string,
    orderId: string,
    photoType: PhotoType
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL

    if (!process.env.DATABASE_URL) return;

    await prisma.driverPhotoSession.upsert({
      where: { driverProfileId },
      create: {
        driverProfileId,
        orderId,
        photoType,
        expiresAt,
      },
      update: {
        orderId,
        photoType,
        expiresAt,
      },
    });

    logger.info(
      { driverProfileId, orderId, photoType, expiresAt },
      'Persisted driver photo upload session in PostgreSQL'
    );
  }

  /**
   * Gets and validates active upload context for a driver from PostgreSQL.
   */
  public static async getPendingUploadSession(
    driverProfileId: string
  ): Promise<DriverPhotoSession | null> {
    if (!process.env.DATABASE_URL) return null;

    const session = await prisma.driverPhotoSession.findUnique({
      where: { driverProfileId },
    });

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await prisma.driverPhotoSession.deleteMany({
        where: { driverProfileId },
      });
      return null;
    }

    return {
      driverProfileId: session.driverProfileId,
      orderId: session.orderId,
      photoType: session.photoType,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Clears pending upload session from PostgreSQL.
   */
  public static async clearPendingUploadSession(driverProfileId: string): Promise<void> {
    if (!process.env.DATABASE_URL) return;

    await prisma.driverPhotoSession.deleteMany({
      where: { driverProfileId },
    }).catch(() => {});
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
        warehouse: true,
        client: {
          include: {
            user: {
              include: {
                telegramAccount: true,
              },
            },
          },
        },
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

    // 9. Dispatch notifications to manager group and client
    const photoLabel =
      params.photoType === PhotoType.CARGO_PICKUP
        ? 'Фотография забора груза'
        : 'Фотография сдачи на склад маркетплейса';

    try {
      const { TelegramNotificationService } = await import('./notification.service');
      await TelegramNotificationService.notifyGroupEvent('PHOTO_UPLOADED', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse?.name || '',
        totalBoxesCount: order.totalBoxesCount,
        totalPalletsCount: order.totalPalletsCount,
        driverName: driver?.fullName,
        comment: photoLabel,
      }).catch((e) => logger.warn({ err: e }, 'Failed to dispatch group photo notification'));

      // If client has Telegram linked, notify client via Client Bot
      const clientTg = order.client?.user?.telegramAccount;
      if (clientTg?.telegramId) {
        const { getClientTelegramBotClient } = await import('@/integrations/telegram/client');
        const clientBot = getClientTelegramBotClient();

        let signedUrl: string | null = null;
        try {
          signedUrl = await storage.getSignedDownloadUrl(fileKey, 86400);
        } catch {
          // non-blocking presigned url error
        }

        const photoCaption = [
          `📸 <b>Новый фотоотчёт по вашей доставке</b>`,
          ``,
          `Заявка: <code>${order.orderNumber}</code>`,
          `Этап: <b>${photoLabel}</b>`,
          `Склад: <b>${order.warehouse?.name || ''}</b> (${order.marketplace})`,
          driver?.fullName ? `Водитель: <b>${driver.fullName}</b>` : '',
        ].filter(Boolean).join('\n');

        let sentPhoto = false;
        if (signedUrl) {
          sentPhoto = await clientBot.sendPhotoWithRetry({
            chatId: clientTg.telegramId.toString(),
            photo: signedUrl,
            caption: photoCaption,
            parseMode: 'HTML',
          }).catch(() => false);
        }

        if (!sentPhoto) {
          await clientBot.sendMessageWithRetry({
            chatId: clientTg.telegramId.toString(),
            text: photoCaption,
            parseMode: 'HTML',
          }).catch((e) => logger.warn({ err: e }, 'Failed to notify client about photo'));
        }
      }
    } catch (notifErr) {
      logger.warn({ notifErr }, 'Non-blocking notification error on photo upload');
    }

    return {
      success: true,
      isConfigured: true,
      photoId: photo.id,
      fileKey,
      message: 'Фотоотчёт успешно сохранён в защищённое облачное хранилище S3.',
    };
  }
}

