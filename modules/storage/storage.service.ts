import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '@/lib/logger';
import { Readable } from 'stream';

export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes?: number;
}

export interface UploadFileResult {
  success: boolean;
  isConfigured: boolean;
  fileKey?: string;
  url?: string;
  error?: string;
  message?: string;
}

export interface FileMetadataResult {
  exists: boolean;
  sizeBytes?: number;
  mimeType?: string;
  lastModified?: Date;
  error?: string;
}

export interface DeleteFileResult {
  success: boolean;
  error?: string;
}

export interface IFileStorageProvider {
  isConfigured(): boolean;
  uploadFile(options: UploadFileOptions): Promise<UploadFileResult>;
  getFileMetadata(key: string): Promise<FileMetadataResult>;
  checkObjectExists(key: string): Promise<boolean>;
  deleteFile(key: string): Promise<DeleteFileResult>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
  getFileBuffer(key: string): Promise<{ buffer: Buffer; mimeType: string } | null>;
}

export class S3StorageProvider implements IFileStorageProvider {
  private readonly bucketName?: string;
  private readonly endpoint?: string;
  private readonly region: string;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;
  private readonly forcePathStyle: boolean;

  private clientInstance: S3Client | null = null;

  constructor() {
    this.bucketName = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    this.endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;
    this.region =
      process.env.S3_REGION || process.env.AWS_REGION || 'ru-central1';
    this.accessKeyId =
      process.env.S3_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY;
    this.secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_KEY;

    // Path-style is typically required for MinIO and custom S3 endpoints
    this.forcePathStyle =
      process.env.S3_FORCE_PATH_STYLE === 'true' ||
      Boolean(this.endpoint && !this.endpoint.includes('amazonaws.com'));
  }

  public isConfigured(): boolean {
    return Boolean(
      this.bucketName &&
        this.accessKeyId &&
        this.secretAccessKey
    );
  }

  private getS3Client(): S3Client {
    if (!this.clientInstance) {
      if (!this.isConfigured()) {
        throw new Error('S3 Storage is not configured with credentials and bucket');
      }

      this.clientInstance = new S3Client({
        region: this.region,
        endpoint: this.endpoint || undefined,
        forcePathStyle: this.forcePathStyle,
        credentials: {
          accessKeyId: this.accessKeyId!,
          secretAccessKey: this.secretAccessKey!,
        },
      });
    }

    return this.clientInstance;
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
        message:
          'Облачное хранилище S3 не подключено. Реальная загрузка файлов в облако отключена.',
      };
    }

    try {
      const client = this.getS3Client();
      const command = new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: options.key,
        Body: options.buffer,
        ContentType: options.mimeType,
        ContentLength: options.sizeBytes ?? options.buffer.length,
      });

      await client.send(command);

      logger.info({ key: options.key }, 'File successfully uploaded to private S3 bucket');

      return {
        success: true,
        isConfigured: true,
        fileKey: options.key,
        // The bucket is private, so fileKey is stored rather than a public URL
        url: options.key,
      };
    } catch (err: unknown) {
      logger.error(
        { key: options.key, err: err instanceof Error ? err.message : String(err) },
        'Failed to upload file to S3'
      );
      return {
        success: false,
        isConfigured: true,
        error: err instanceof Error ? err.message : 'Ошибка при выгрузке в хранилище',
      };
    }
  }

  public async getFileMetadata(key: string): Promise<FileMetadataResult> {
    if (!this.isConfigured()) {
      return { exists: false, error: 'S3 not configured' };
    }

    try {
      const client = this.getS3Client();
      const command = new HeadObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      });

      const response = await client.send(command);
      return {
        exists: true,
        sizeBytes: response.ContentLength,
        mimeType: response.ContentType,
        lastModified: response.LastModified,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('NotFound') || errorMsg.includes('404')) {
        return { exists: false };
      }
      return { exists: false, error: errorMsg };
    }
  }

  public async checkObjectExists(key: string): Promise<boolean> {
    const meta = await this.getFileMetadata(key);
    return meta.exists;
  }

  public async deleteFile(key: string): Promise<DeleteFileResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'S3 not configured' };
    }

    try {
      const client = this.getS3Client();
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      });

      await client.send(command);
      logger.info({ key }, 'File successfully deleted from S3');
      return { success: true };
    } catch (err: unknown) {
      logger.error(
        { key, err: err instanceof Error ? err.message : String(err) },
        'Failed to delete file from S3'
      );
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Ошибка при удалении файла из S3',
      };
    }
  }

  public async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 900 // 15 minutes default
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const client = this.getS3Client();
      const command = new GetObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      });

      const signedUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });

      return signedUrl;
    } catch (err: unknown) {
      logger.error(
        { key, err: err instanceof Error ? err.message : String(err) },
        'Failed to generate signed download URL'
      );
      return null;
    }
  }

  public async getFileBuffer(
    key: string
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const client = this.getS3Client();
      const command = new GetObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      });

      const response = await client.send(command);
      if (!response.Body) {
        return null;
      }

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      return {
        buffer: Buffer.concat(chunks),
        mimeType: response.ContentType || 'image/jpeg',
      };
    } catch (err: unknown) {
      logger.error(
        { key, err: err instanceof Error ? err.message : String(err) },
        'Failed to read object buffer from S3'
      );
      return null;
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

/**
 * Resets the singleton instance (useful for unit tests with changed environment variables)
 */
export function resetFileStorageProvider(): void {
  storageProviderInstance = null;
}
