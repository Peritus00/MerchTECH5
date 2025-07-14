const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

// S3 Configuration - Aggressive trimming to handle Railway environment variable issues
const s3Config = {
  region: (process.env.AWS_REGION || 'us-east-1').replace(/\s+/g, ''),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').replace(/\s+/g, ''),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').replace(/\s+/g, ''),
  },
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
      console.log(`📊 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📁 Content type: ${contentType}`);
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

  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await s3Client.send(command);
      console.log(`🗑️  File deleted from S3: ${key}`);
    } catch (error) {
      console.error('❌ Failed to delete file from S3:', error);
      throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await s3Client.send(command);
      return true;
    } catch (error) {
      if (error?.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getFileMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const metadata = await s3Client.send(command);
      return metadata;
    } catch (error) {
      console.error('❌ Failed to get file metadata from S3:', error);
      throw new Error(`Failed to get file metadata from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const { ContentLength, ContentType, ETag, LastModified } = await s3Client.send(command);
      return { ContentLength, ContentType, ETag, LastModified };
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${key}:`, error);
      throw error;
    }
  }

  getStream(key, range = null) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };
    if (range) {
      params.Range = `bytes=${range.start}-${range.end}`;
    }
    const command = new GetObjectCommand(params);
    
    // This is a workaround to convert the AWS SDK v3 stream to a Node.js readable stream
    // that can be piped correctly.
    const { Readable } = require('stream');
    
    const stream = new Readable({
      read() {}
    });

    s3Client.send(command).then(response => {
      response.Body.on('data', (chunk) => stream.push(chunk));
      response.Body.on('end', () => stream.push(null));
      response.Body.on('error', (err) => stream.emit('error', err));
    }).catch(err => {
      stream.emit('error', err);
    });

    return stream;
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