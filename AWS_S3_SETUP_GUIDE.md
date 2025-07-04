# AWS S3 Setup Guide for MerchTech

## Quick Setup Steps

### 1. Create S3 Bucket
- Bucket name: `merchtech-media-files`
- Region: `us-east-1` (or your preferred region)
- Keep default security settings

### 2. Create IAM User
- User name: `merchtech-s3-user`
- Access type: Programmatic access
- Attach the policy from `AWS_IAM_POLICY.json`

### 3. Configure Environment Variables
Add to your `.env` file:
```bash
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=merchtech-media-files
```

### 4. Run Database Migration
```bash
node scripts/migrate.js
```

### 5. Test Integration
- Start server: `npm run start`
- Look for: `✅ S3 service loaded successfully`
- Upload a test file

## Required IAM Permissions
The application needs these S3 permissions:
- `s3:PutObject` - Upload files
- `s3:GetObject` - Download files  
- `s3:DeleteObject` - Delete files
- `s3:HeadObject` - Check file existence
- `s3:ListBucket` - List bucket contents

## Benefits
- ✅ Efficient storage for large video files
- ✅ Better performance than base64 storage
- ✅ Automatic fallback to base64 if S3 unavailable
- ✅ Cost-effective scaling

## 🎯 Benefits of S3 Integration

- **Better Performance**: Faster file uploads and downloads
- **Cost Effective**: Pay only for storage used
- **Scalability**: Handle large video files without database bloat
- **Reliability**: 99.999999999% (11 9's) durability
- **CDN Ready**: Easy integration with CloudFront for global delivery

## 📋 Prerequisites

- AWS Account with billing enabled
- AWS CLI installed (optional but recommended)
- Basic understanding of AWS IAM

## 🛠️ Step-by-Step Setup

### 1. Create S3 Bucket

1. **Log in to AWS Console** and navigate to S3
2. **Click "Create bucket"**
3. **Configure bucket settings**:
   - **Bucket name**: `merchtech-media-files` (or your preferred name)
   - **Region**: Choose closest to your users (e.g., `us-east-1`)
   - **Block Public Access**: Keep default settings (recommended)
   - **Versioning**: Enable (recommended for file recovery)
   - **Encryption**: Enable default encryption

### 2. Create IAM User for Application

1. **Navigate to IAM** in AWS Console
2. **Click "Users" → "Add user"**
3. **Configure user**:
   - **User name**: `merchtech-s3-user`
   - **Access type**: Programmatic access
   - **Permissions**: Attach policies directly
   - **Policy**: Create custom policy (see step 3)

### 3. Create IAM Policy

1. **In IAM, go to "Policies" → "Create policy"**
2. **Click "JSON" tab**
3. **Copy and paste the policy from `AWS_IAM_POLICY.json`**
4. **Replace `your-bucket-name` with your actual bucket name**
5. **Review and create policy**:
   - **Name**: `MerchTechS3MediaPolicy`
   - **Description**: "Allows MerchTech app to manage media files in S3"

### 4. Attach Policy to User

1. **Go back to your IAM user**
2. **Click "Add permissions"**
3. **Select "Attach policies directly"**
4. **Search for and select** `MerchTechS3MediaPolicy`
5. **Complete user creation**
6. **Save the Access Key ID and Secret Access Key** (you'll need these)

### 5. Configure Environment Variables

Add these variables to your `.env` file:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=merchtech-media-files
```

### 6. Run Database Migration

Execute the database migration to add S3 support:

```bash
# Run the migration script
node scripts/migrate.js
```

Or manually run the SQL:

```sql
-- Add S3 key column to media table
ALTER TABLE media ADD COLUMN s3_key VARCHAR(500);
CREATE INDEX idx_media_s3_key ON media(s3_key) WHERE s3_key IS NOT NULL;
```

### 7. Test the Integration

1. **Start your server**:
   ```bash
   npm run start
   ```

2. **Check the logs** for S3 initialization:
   ```
   ✅ S3 service loaded successfully
   ```

3. **Upload a test file** through your app
4. **Check S3 bucket** to verify file was uploaded

## 🔧 Configuration Options

### Bucket Configuration

**Recommended bucket settings**:
- **Versioning**: Enabled (for file recovery)
- **Encryption**: AES-256 or KMS
- **Public Access**: Blocked (files accessed via signed URLs)
- **Lifecycle Rules**: Delete incomplete multipart uploads after 7 days

### CORS Configuration

If you plan to access files directly from the browser, add CORS configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## 🚀 Production Considerations

### Security Best Practices

1. **Use IAM Roles** instead of IAM users when possible
2. **Enable CloudTrail** for audit logging
3. **Use VPC Endpoints** for private network access
4. **Rotate access keys** regularly
5. **Enable MFA** for sensitive operations

### Performance Optimization

1. **Use CloudFront CDN** for global content delivery
2. **Enable Transfer Acceleration** for faster uploads
3. **Use appropriate storage classes** (Standard, IA, Glacier)
4. **Implement lifecycle policies** for cost optimization

### Cost Optimization

1. **Monitor usage** with AWS Cost Explorer
2. **Set up billing alerts**
3. **Use appropriate storage classes**
4. **Implement lifecycle policies** to move old files to cheaper storage

## 🔍 Troubleshooting

### Common Issues

**S3 service not loading**:
- Check if AWS SDK is installed: `npm list @aws-sdk/client-s3`
- Verify environment variables are set correctly

**Upload fails with 403 error**:
- Verify IAM policy includes required permissions
- Check bucket name matches environment variable
- Ensure AWS credentials are valid

**Files not accessible**:
- Verify bucket region matches environment variable
- Check if bucket exists and is accessible
- Verify IAM permissions include `s3:GetObject`

### Debug Mode

Enable debug logging by adding to your environment:

```bash
# Enable AWS SDK debug logging
AWS_SDK_LOG_LEVEL=debug
```

## 📊 Monitoring

### CloudWatch Metrics

Monitor these key metrics:
- **NumberOfObjects**: Total files in bucket
- **BucketSizeBytes**: Total storage used
- **AllRequests**: API request count
- **4xxErrors**: Client errors
- **5xxErrors**: Server errors

### Cost Monitoring

Set up billing alerts for:
- **Monthly storage costs**
- **Data transfer costs**
- **API request costs**

## 🔄 Migration from Base64 Storage

If you have existing files stored as base64 in your database, you can migrate them:

1. **Create a migration script** to convert base64 files to S3
2. **Run migration during maintenance window**
3. **Update database records** with S3 URLs
4. **Test thoroughly** before removing base64 data

## 📞 Support

For issues with this integration:
1. Check AWS documentation
2. Review CloudWatch logs
3. Test with AWS CLI to isolate issues
4. Contact AWS support for service-specific issues

## 🎉 Benefits After Setup

Once configured, your MerchTech application will:
- ✅ Store large video files efficiently
- ✅ Reduce database size and improve performance
- ✅ Scale automatically with usage
- ✅ Provide faster media delivery
- ✅ Support global content distribution (with CloudFront)

---

**Note**: This setup enables automatic S3 upload for new files. Existing base64 files will continue to work but won't be migrated automatically. 