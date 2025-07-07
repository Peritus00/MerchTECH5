const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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

class S3Service {
  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'merchtech-media-files';
    this.region = process.env.AWS_REGION || 'us-east-1';
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('⚠️  AWS credentials not configured. S3 upload will not work.');
    }
  }

  async getPresignedUploadUrl(fileName, contentType, userId, fileSize) {
    try {
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
          userId: userId,
          uploadedAt: new Date().toISOString(),
          originalName: fileName,
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

  async uploadFile(fileBuffer, fileName, contentType, userId) {
    try {
      const key = `users/${userId}/media/${Date.now()}-${fileName}`;
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
            userId: userId,
            uploadedAt: new Date().toISOString(),
            originalName: fileName,
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
      return fileUrl;
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

  extractKeyFromUrl(url) {
    try {
      const match = url.match(/https:\/\/.+?\.amazonaws\.com\/(.+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  isConfigured() {
    return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET_NAME);
  }
}

module.exports.S3Service = S3Service; 