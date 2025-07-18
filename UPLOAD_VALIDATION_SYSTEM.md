# Upload Validation System 🔍

## Overview

We've implemented a comprehensive upload validation system to ensure that **no database records are saved for incomplete or corrupted S3 uploads**. This prevents the video playback issues you experienced where files appeared to upload successfully but were actually truncated.

## 🛡️ Validation Layers

### 1. **Upload Endpoint Validation** (`/api/upload`)

**What it does:**
- Validates file upload to S3 **before** responding with success
- Checks that the file size on S3 matches the original file size
- Automatically cleans up incomplete uploads

**Process:**
```javascript
// 1. Upload file to S3
const result = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);

// 2. Verify upload was complete
const metadata = await s3Service.getMetadata(result.Key);
if (metadata.ContentLength !== req.file.size) {
  // Delete the incomplete file and return error
  await s3Service.deleteFile(result.Key);
  return res.status(500).json({ error: 'Upload validation failed' });
}

// 3. Only return success if validation passes
res.json({ url: result.Location, validated: true });
```

### 2. **Media Creation Validation** (`/api/media`)

**What it does:**
- Validates that S3 file exists **before** saving database record
- Checks file size consistency between database and S3
- Prevents orphaned database records

**Process:**
```javascript
// Before saving to database
if (s3_key && s3Service.isConfigured()) {
  const metadata = await s3Service.getMetadata(s3_key);
  if (metadata.ContentLength !== filesize) {
    return res.status(400).json({ error: 'File validation failed' });
  }
}
```

## 🔧 Implementation Details

### Upload Validation Flow

1. **File Upload**: User uploads file through `/api/upload`
2. **S3 Upload**: File is uploaded to S3 using multipart upload
3. **Validation**: Server verifies file exists and size matches
4. **Cleanup**: If validation fails, incomplete file is deleted from S3
5. **Response**: Success response only sent if validation passes

### Media Creation Flow

1. **Media Request**: Frontend sends media metadata to `/api/media`
2. **S3 Verification**: Server checks if S3 file exists and matches expected size
3. **Database Save**: Only saves to database if S3 validation passes
4. **Error Response**: Returns error if file doesn't exist or size mismatch

## 🚨 Error Codes

### Upload Validation Errors

- **`UPLOAD_INCOMPLETE`**: File size mismatch detected
- **`UPLOAD_VALIDATION_FAILED`**: Could not verify file integrity

### Media Creation Errors

- **`FILE_SIZE_MISMATCH`**: S3 file size doesn't match expected size
- **`FILE_NOT_FOUND_ON_S3`**: S3 file doesn't exist

## 🧪 Testing

### Test Script: `test-upload-validation.js`

Run comprehensive validation tests:
```bash
node test-upload-validation.js
```

**Tests include:**
- Valid upload with size verification
- Invalid media creation (non-existent S3 file)
- Large file upload validation
- Cleanup of test files

### Cleanup Script: `cleanup-orphaned-s3-files.js`

Find and clean up orphaned records:
```bash
# Check for orphaned files
node cleanup-orphaned-s3-files.js

# Actually clean up orphaned files
node cleanup-orphaned-s3-files.js --confirm
```

## 🔍 Monitoring & Logging

### Upload Validation Logs

```
🔍 UPLOAD_VALIDATION [req_123]: Verifying S3 upload...
🔍 UPLOAD_VALIDATION [req_123]: Size check - Expected: 1048576, Actual: 1048576
✅ UPLOAD_VALIDATION [req_123]: Upload verified successfully
```

### Media Validation Logs

```
🔍 MEDIA_VALIDATION: Verifying S3 file exists for key: users/4/media/file.mp4
🔍 MEDIA_VALIDATION: Size check - Expected: 1048576, Actual: 1048576
✅ MEDIA_VALIDATION: S3 file verified successfully
```

## 🎯 Benefits

### 1. **Prevents Corrupted Uploads**
- No more 48KB video fragments
- Ensures complete file transfers
- Automatic cleanup of failed uploads

### 2. **Data Integrity**
- Database records only exist for valid S3 files
- No orphaned records
- Consistent file size tracking

### 3. **User Experience**
- Clear error messages for failed uploads
- No false success responses
- Reliable media playback

### 4. **System Reliability**
- Automatic cleanup of incomplete uploads
- Validation at multiple layers
- Comprehensive error handling

## 🛠️ Configuration

### Environment Variables

```env
# S3 Configuration (required for validation)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-2
```

### Validation Settings

```javascript
// Maximum file size for validation
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Validation timeout
const VALIDATION_TIMEOUT = 30000; // 30 seconds
```

## 📋 Troubleshooting

### Common Issues

1. **"Upload validation failed"**
   - Check network connectivity to S3
   - Verify S3 permissions
   - Check file size limits

2. **"File not found on S3"**
   - Verify S3 bucket configuration
   - Check file path/key format
   - Ensure upload completed successfully

3. **Size mismatch errors**
   - May indicate network issues during upload
   - Check for multipart upload problems
   - Verify file wasn't modified during upload

### Recovery Steps

1. **For existing corrupted files:**
   ```bash
   # Find corrupted files
   node cleanup-orphaned-s3-files.js
   
   # Clean up corrupted records
   node cleanup-orphaned-s3-files.js --confirm
   ```

2. **For failed uploads:**
   - Re-upload the file through the media interface
   - Check server logs for specific error details
   - Verify S3 bucket has sufficient space

## 🔄 Migration for Existing Files

For files uploaded before validation was implemented:

1. **Run the cleanup script** to identify problematic files
2. **Re-upload corrupted files** through the interface
3. **Verify all media plays correctly** after cleanup

## 🎉 Result

With this validation system in place:

- ✅ **No more incomplete uploads saved to database**
- ✅ **Automatic cleanup of failed uploads**
- ✅ **Consistent file integrity checking**
- ✅ **Clear error messages for users**
- ✅ **Reliable video/audio playback**

The system ensures that if an upload fails or is incomplete, **no database record is created**, preventing the exact issue you experienced with the 48KB video fragments. 