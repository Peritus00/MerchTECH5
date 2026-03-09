const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const crypto = require('crypto');

const S3_CONNECT_TIMEOUT_MS = Math.max(parseInt(process.env.S3_CONNECT_TIMEOUT_MS || '60000', 10), 30000);
const S3_SOCKET_TIMEOUT_MS = Math.max(parseInt(process.env.S3_SOCKET_TIMEOUT_MS || '300000', 10), 120000);
const S3_MAX_ATTEMPTS = Math.max(parseInt(process.env.S3_MAX_ATTEMPTS || '5', 10), 3);

// S3 Configuration - hardened timeout/retry settings for large media operations
const s3Config = {
  region: (process.env.AWS_REGION || 'us-east-1').replace(/\s+/g, ''),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').replace(/\s+/g, ''),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').replace(/\s+/g, ''),
  },
  // Use an explicit Smithy HTTP handler so timeouts are actually applied.
  requestHandler: new NodeHttpHandler({
    connectionTimeout: S3_CONNECT_TIMEOUT_MS,
    socketTimeout: S3_SOCKET_TIMEOUT_MS,
  }),
  maxAttempts: S3_MAX_ATTEMPTS,
  retryMode: 'standard',
};

// Create S3 client
const s3Client = new S3Client(s3Config);

class S3Service {
  constructor() {
    this.bucketName = (process.env.AWS_S3_BUCKET_NAME || 'merchtech-media-files').replace(/\s+/g, '');
    this.region = (process.env.AWS_REGION || 'us-east-1').replace(/\s+/g, '');
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('⚠️  AWS credentials not configured. S3 upload will not work.');
    }
  }

  async send(command, { abortSignal, timeoutMs } = {}) {
    let timeoutId = null;
    let controller = null;

    if (!abortSignal && timeoutMs) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      return await s3Client.send(command, {
        abortSignal: abortSignal || controller?.signal,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async getPresignedUploadUrl(fileName, contentType, userId, fileSize) {
    try {
      // Always use structured key for all uploads
      const key = `users/${userId}/media/${Date.now()}-${fileName}`;
      console.log(`🔗 Generating presigned upload URL for: ${key}`);
      console.log(`📁 Content type: ${contentType}`);
      if (fileSize) {
        console.log(`📊 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      }
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        CacheControl: 'max-age=31536000',
        Metadata: {
          userId: String(userId),
          uploadedAt: new Date().toISOString(),
          originalName: String(fileName),
        },
      });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      console.log(`✅ Presigned upload URL generated successfully`);
      return { uploadUrl, fileUrl, key };
    } catch (error) {
      console.error('❌ Failed to generate presigned upload URL:', error);
      throw new Error(`Failed to generate presigned upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadFile(fileBuffer, key, contentType) {
    try {
      console.log(`📤 Uploading file to S3: ${key}`);
      console.log(`📁 Content type: ${contentType}`);
      console.log(`📊 File buffer info:`, {
        hasBuffer: !!fileBuffer,
        bufferType: typeof fileBuffer,
        bufferLength: fileBuffer ? fileBuffer.length : 'undefined'
      });
      
      if (!fileBuffer) {
        throw new Error('File buffer is undefined or null');
      }
      
      console.log(`📊 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          CacheControl: 'max-age=31536000',
          Metadata: {
            uploadedAt: new Date().toISOString(),
          },
        },
        // 🔧 OPTIMIZED FOR LARGE FILES
        partSize: 1024 * 1024 * 10, // 10MB parts
        queueSize: 4, // 4 concurrent uploads
        leavePartsOnError: false, // Clean up failed parts
      });
      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          console.log(`📊 Upload progress: ${percentage}%`);
        }
      });
      const result = await upload.done();
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      console.log(`✅ File uploaded successfully: ${fileUrl}`);
      return { Location: fileUrl, Key: key };
    } catch (error) {
      console.error('❌ S3 upload failed:', error);
      throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
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
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFile(key, options = {}) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.send(command, options);
      console.log(`🗑️  File deleted from S3: ${key}`);
    } catch (error) {
      console.error('❌ Failed to delete file from S3:', error);
      throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async fileExists(key, options = {}) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.send(command, options);
      return true;
    } catch (error) {
      if (error?.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getFileMetadata(key, options = {}) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const metadata = await this.send(command, options);
      return metadata;
    } catch (error) {
      console.error('❌ Failed to get file metadata from S3:', error);
      throw new Error(`Failed to get file metadata from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMetadata(key, options = {}) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const { ContentLength, ContentType, ETag, LastModified } = await this.send(command, options);
      return { ContentLength, ContentType, ETag, LastModified };
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${key}:`, error);
      throw error;
    }
  }

  async getStream(key, range = null, options = {}) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };
    if (range) {
      params.Range = `bytes=${range.start}-${range.end}`;
    }
    const command = new GetObjectCommand(params);
    
    try {
      const response = await this.send(command, options);
      return {
        stream: response.Body,
        metadata: {
          ContentType: response.ContentType,
          ContentLength: response.ContentLength,
          LastModified: response.LastModified,
          ETag: response.ETag
        }
      };
    } catch (error) {
      console.error('❌ Failed to get S3 stream:', error);
      throw new Error(`Failed to get S3 stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getObjectBuffer(key, options = {}) {
    const { stream } = await this.getStream(key, null, options);
    const chunks = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  extractKeyFromUrl(url) {
    try {
      const decodedUrl = decodeURIComponent(url);
      const match = decodedUrl.match(/https:\/\/.+?\.amazonaws\.com\/(.+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  isConfigured() {
    return !!(process.env.AWS_ACCESS_KEY_ID?.replace(/\s+/g, '') && process.env.AWS_SECRET_ACCESS_KEY?.replace(/\s+/g, '') && process.env.AWS_S3_BUCKET_NAME?.replace(/\s+/g, ''));
  }
}

// Export both the class and a default instance
module.exports = new S3Service();
module.exports.S3Service = S3Service;