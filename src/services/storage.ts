import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { FileUpload } from '../types/index.js';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.S3_BUCKET_NAME;

// Allowed file types for uploads
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class StorageService {
  /**
   * Upload a file to S3
   */
  async upload(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<FileUpload> {
    // Validate file type
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error(`File type ${contentType} is not allowed`);
    }

    // Validate file size
    const size = Buffer.byteLength(body);
    if (size > MAX_FILE_SIZE) {
      throw new Error(`File size ${size} exceeds maximum of ${MAX_FILE_SIZE}`);
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await s3Client.send(command);

    logger.info({ key, contentType, size }, 'File uploaded to S3');

    return {
      key,
      url: `https://${BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`,
      contentType,
      size,
    };
  }

  /**
   * Generate a presigned URL for uploading
   */
  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
  ): Promise<string> {
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error(`File type ${contentType} is not allowed`);
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    
    logger.debug({ key, expiresIn }, 'Generated upload presigned URL');
    
    return signedUrl;
  }

  /**
   * Generate a presigned URL for downloading
   */
  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    
    logger.debug({ key, expiresIn }, 'Generated download presigned URL');
    
    return signedUrl;
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    
    logger.info({ key }, 'File deleted from S3');
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      });
      await s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files with a prefix
   */
  async list(prefix: string, maxKeys = 100): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await s3Client.send(command);
    
    return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
  }

  /**
   * Health check for S3
   */
  async healthCheck(): Promise<boolean> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET,
        MaxKeys: 1,
      });
      await s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique key for file upload
   */
  generateKey(folder: string, filename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = filename.split('.').pop() || '';
    return `${folder}/${timestamp}-${random}.${ext}`;
  }
}

// Export singleton instance
export const storage = new StorageService();
