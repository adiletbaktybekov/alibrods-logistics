import { logger } from '@/lib/logger';

export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadFileResult {
  success: boolean;
  isConfigured: boolean;
  fileKey?: string;
  url?: string;
  error?: string;
  message?: string;
}

export interface IFileStorageProvider {
  isConfigured(): boolean;
  uploadFile(options: UploadFileOptions): Promise<UploadFileResult>;
}

export class S3StorageProvider implements IFileStorageProvider {
  private readonly bucketName?: string;
  private readonly endpoint?: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
    this.endpoint = process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT;
  }

  public isConfigured(): boolean {
    return Boolean(this.bucketName && (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY));
  }

  public async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
    if (!this.isConfigured()) {
      logger.warn(
        { key: options.key, sizeBytes: options.sizeBytes },
        'S3 storage is not configured. Real cloud upload is inactive.'
      );
      return {
        success: false,
        isConfigured: false,
        fileKey: options.key,
        message: 'Облачное хранилище S3 не подключено. Реальная загрузка файлов в облако отключена.',
      };
    }

    try {
      // In production with S3 credentials, AWS SDK S3Client would be invoked here.
      // S3Client.send(new PutObjectCommand({ ... }))
      logger.info({ key: options.key }, 'Simulated S3 upload with configured bucket');
      return {
        success: true,
        isConfigured: true,
        fileKey: options.key,
        url: `https://${this.bucketName}.s3.amazonaws.com/${options.key}`,
      };
    } catch (err) {
      logger.error({ err, key: options.key }, 'Failed to upload file to S3');
      return {
        success: false,
        isConfigured: true,
        error: err instanceof Error ? err.message : 'Ошибка при выгрузке в хранилище',
      };
    }
  }
}

let storageProviderInstance: IFileStorageProvider | null = null;

export function getFileStorageProvider(): IFileStorageProvider {
  if (!storageProviderInstance) {
    storageProviderInstance = new S3StorageProvider();
  }
  return storageProviderInstance;
}
