import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3 Configuration
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
};

// Create S3 client
const s3Client = new S3Client(s3Config);

// S3 Service Class
export class S3Service {
  private bucketName: string;
  private region: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'merchtech-media-files';
    this.region = process.env.AWS_REGION || 'us-east-1';
    
    // Validate required environment variables
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('⚠️  AWS credentials not configured. S3 upload will not work.');
    }
  }

  /**
   * Upload file to S3 with multipart upload support for large files
   */
  async uploadFile(fileBuffer: Buffer, fileName: string, contentType: string, userId: string): Promise<string> {
    try {
      // Generate unique key with user folder structure
      const key = `users/${userId}/media/${Date.now()}-${fileName}`;
      
      console.log(`📤 Uploading file to S3: ${key}`);
      console.log(`📊 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📁 Content type: ${contentType}`);

      // Use Upload class for multipart upload (handles large files automatically)
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          // Set cache control for media files
          CacheControl: 'max-age=31536000', // 1 year
          // Set metadata
          Metadata: {
            userId: userId,
            uploadedAt: new Date().toISOString(),
            originalName: fileName,
          },
        },
      });

      // Monitor upload progress
      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          console.log(`📊 Upload progress: ${percentage}%`);
        }
      });

      const result = await upload.done();
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      
      console.log(`✅ File uploaded successfully: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      console.error('❌ S3 upload failed:', error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Get a signed URL for secure file access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      console.log(`🔗 Generated signed URL for: ${key}`);
      return signedUrl;
    } catch (error) {
      console.error('❌ Failed to generate signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`🗑️  File deleted from S3: ${key}`);
    } catch (error) {
      console.error('❌ Failed to delete file from S3:', error);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const result = await s3Client.send(command);
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata,
      };
    } catch (error) {
      console.error('❌ Failed to get file metadata:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Extract S3 key from full URL
   */
  extractKeyFromUrl(url: string): string | null {
    try {
      // Handle both formats:
      // https://bucket.s3.region.amazonaws.com/key
      // https://s3.region.amazonaws.com/bucket/key
      const urlObj = new URL(url);
      
      if (urlObj.hostname.includes('.s3.')) {
        // Format: https://bucket.s3.region.amazonaws.com/key
        return urlObj.pathname.substring(1); // Remove leading slash
      } else if (urlObj.hostname.includes('s3.')) {
        // Format: https://s3.region.amazonaws.com/bucket/key
        const pathParts = urlObj.pathname.split('/');
        return pathParts.slice(2).join('/'); // Remove empty first part and bucket name
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to extract S3 key from URL:', error);
      return null;
    }
  }

  /**
   * Check if S3 is properly configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET_NAME
    );
  }
}

// Export singleton instance
export const s3Service = new S3Service(); 