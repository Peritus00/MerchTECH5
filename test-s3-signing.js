#!/usr/bin/env node

require('dotenv').config();
const { S3Service } = require('./s3Service.js');

async function testS3Signing() {
  const s3Service = new S3Service();
  
  console.log('=== S3 Configuration ===');
  console.log('S3 Service configured:', s3Service.isConfigured());
  console.log('Bucket:', process.env.AWS_S3_BUCKET_NAME);
  console.log('Region:', process.env.AWS_REGION);
  console.log('Access Key exists:', !!process.env.AWS_ACCESS_KEY_ID);
  console.log('Secret Key exists:', !!process.env.AWS_SECRET_ACCESS_KEY);
  
  console.log('\n=== Testing Signed URL Generation ===');
  const testKey = 'users/1/media/1752018614400-putitinthepotbeat(2).mp3';
  
  try {
    const signedUrl = await s3Service.getSignedUrl(testKey, 3600);
    console.log('✅ Signed URL generated successfully');
    console.log('URL length:', signedUrl.length);
    console.log('URL preview:', signedUrl.substring(0, 100) + '...');
    
    // Test if the URL works
    console.log('\n=== Testing Signed URL ===');
    const response = await fetch(signedUrl, { method: 'HEAD' });
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
  } catch (error) {
    console.error('❌ Signed URL generation failed:', error.message);
    console.error('Error details:', error);
  }
}

testS3Signing(); 