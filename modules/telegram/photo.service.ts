import { prisma } from '@/database/prisma';
import { PhotoType } from '@prisma/client';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { getFileStorageProvider } from '@/modules/storage/storage.service';
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
   * Validates photo parameters.
   */
  public static validatePhoto(fileSizeBytes: number, mimeType: string): void {
    if (fileSizeBytes > MAX_PHOTO_SIZE_BYTES) {
      throw new ValidationError(
        `Размер файла (${Math.round(fileSizeBytes / 1024 / 1024)} МБ) превышает лимит 10 МБ`
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      throw new ValidationError(
        `Недопустимый формат файла «${mimeType}». Разрешены только JPG, PNG и WEBP.`
      );
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
    caption?: string;
    fileBuffer?: Buffer;
  }) {
    this.validatePhoto(params.fileSizeBytes, params.mimeType);

    if (!process.env.DATABASE_URL) {
      return {
        success: false,
        message: 'База данных не подключена для сохранения метаданных фото.',
      };
    }

    // Verify driver assignment
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

    // Check S3 storage provider
    const storage = getFileStorageProvider();
    const fileKey = `orders/${params.orderId}/${params.photoType.toLowerCase()}/${Date.now()}`;

    if (!storage.isConfigured()) {
      logger.warn(
        { orderId: params.orderId, driverProfileId: params.driverProfileId },
        'Photo received and validated, but S3 cloud storage is inactive.'
      );

      // Do NOT fake successful cloud upload
      return {
        success: false,
        isConfigured: false,
        orderId: params.orderId,
        photoType: params.photoType,
        message:
          'Фотография успешно проверена по размеру и типу, однако облачное хранилище S3 ещё не подключено. Фотоотчёт временно не сохранён в облаке.',
      };
    }

    // When S3 is configured, upload buffer and record in OrderPhoto
    const uploadResult = await storage.uploadFile({
      key: fileKey,
      buffer: params.fileBuffer || Buffer.from(''),
      mimeType: params.mimeType,
      sizeBytes: params.fileSizeBytes,
    });

    if (!uploadResult.success) {
      return {
        success: false,
        isConfigured: true,
        message: uploadResult.error || 'Ошибка при загрузке фото в хранилище',
      };
    }

    const driver = await prisma.driverProfile.findUnique({
      where: { id: params.driverProfileId },
    });

    const photo = await prisma.orderPhoto.create({
      data: {
        orderId: params.orderId,
        uploadedById: driver?.userId,
        photoUrl: uploadResult.url || fileKey,
        fileKey,
        type: params.photoType,
        caption: params.caption,
        fileSizeBytes: params.fileSizeBytes,
        mimeType: params.mimeType,
      },
    });

    return {
      success: true,
      isConfigured: true,
      photoId: photo.id,
      message: 'Фотоотчёт успешно сохранён.',
    };
  }
}
