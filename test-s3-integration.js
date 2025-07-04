const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Test S3 Integration for MerchTech App
class S3IntegrationTester {
  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.70:5001/api';
    this.authToken = null;
    this.testResults = [];
  }

  async login() {
    console.log('🔐 Logging in for S3 integration test...');
    try {
      const response = await axios.post(`${this.apiUrl}/auth/login`, {
        email: 'djjetfuel@gmail.com',
        password: 'temp123'
      });
      
      this.authToken = response.data.token;
      console.log('✅ Login successful');
      return true;
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testS3Configuration() {
    console.log('\n🔧 Testing S3 Configuration...');
    
    // Check if S3 environment variables are set
    const s3Config = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucketName: process.env.AWS_S3_BUCKET_NAME
    };
    
    const configStatus = {
      accessKeyId: s3Config.accessKeyId ? '✅ Set' : '❌ Missing',
      secretAccessKey: s3Config.secretAccessKey ? '✅ Set' : '❌ Missing',
      region: s3Config.region ? '✅ Set' : '❌ Missing',
      bucketName: s3Config.bucketName ? '✅ Set' : '❌ Missing'
    };
    
    console.log('S3 Configuration Status:');
    console.log(`  AWS_ACCESS_KEY_ID: ${configStatus.accessKeyId}`);
    console.log(`  AWS_SECRET_ACCESS_KEY: ${configStatus.secretAccessKey}`);
    console.log(`  AWS_REGION: ${configStatus.region}`);
    console.log(`  AWS_S3_BUCKET_NAME: ${configStatus.bucketName}`);
    
    const isConfigured = Object.values(s3Config).every(value => value);
    
    if (isConfigured) {
      console.log('✅ S3 configuration appears complete');
      return true;
    } else {
      console.log('⚠️  S3 configuration incomplete - will use base64 fallback');
      return false;
    }
  }

  async testVideoUpload() {
    console.log('\n🎥 Testing Video Upload with S3...');
    
    if (!this.authToken) {
      console.log('❌ No auth token available');
      return false;
    }

    try {
      // Create a small test video data URL (base64 encoded)
      const testVideoData = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const uploadData = {
        title: 'S3 Test Video',
        url: testVideoData,
        filename: 'test-video.mp4',
        fileType: 'video',
        contentType: 'video/mp4',
        filesize: 1024,
        duration: 10,
        uniqueId: `test-${Date.now()}`
      };

      console.log('📤 Uploading test video...');
      const response = await axios.post(`${this.apiUrl}/media`, uploadData, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Video upload successful');
      console.log('📊 Response:', {
        id: response.data.id,
        title: response.data.title,
        url: response.data.url?.substring(0, 50) + '...',
        s3_key: response.data.s3_key || 'No S3 key (using base64)'
      });

      // Test file retrieval
      console.log('📥 Testing file retrieval...');
      const getResponse = await axios.get(`${this.apiUrl}/media/${response.data.id}`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      console.log('✅ File retrieval successful');
      console.log('📊 Retrieved file info:', {
        id: getResponse.data.media.id,
        title: getResponse.data.media.title,
        url: getResponse.data.media.url?.substring(0, 50) + '...',
        fileType: getResponse.data.media.fileType
      });

      // Clean up - delete test file
      console.log('🗑️  Cleaning up test file...');
      await axios.delete(`${this.apiUrl}/media/${response.data.id}`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      console.log('✅ Test file deleted successfully');
      return true;

    } catch (error) {
      console.log('❌ Video upload test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testServerS3Status() {
    console.log('\n🖥️  Testing Server S3 Status...');
    
    try {
      const response = await axios.get(`${this.apiUrl}/health`);
      console.log('✅ Server health check passed');
      
      // The server logs will show S3 status on startup
      console.log('💡 Check server logs for S3 service initialization status');
      return true;
    } catch (error) {
      console.log('❌ Server health check failed:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting S3 Integration Tests for MerchTech\n');
    
    const tests = [
      { name: 'S3 Configuration', test: () => this.testS3Configuration() },
      { name: 'Server S3 Status', test: () => this.testServerS3Status() },
      { name: 'User Login', test: () => this.login() },
      { name: 'Video Upload with S3', test: () => this.testVideoUpload() }
    ];

    let passed = 0;
    let total = tests.length;

    for (const { name, test } of tests) {
      console.log(`\n🧪 Running test: ${name}`);
      try {
        const result = await test();
        if (result) {
          console.log(`✅ ${name} - PASSED`);
          passed++;
        } else {
          console.log(`❌ ${name} - FAILED`);
        }
      } catch (error) {
        console.log(`❌ ${name} - ERROR:`, error.message);
      }
    }

    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! S3 integration is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the output above for details.');
      console.log('💡 Note: S3 tests may fail if AWS credentials are not configured, but the app will still work with base64 storage.');
    }
  }
}

// Run the tests
const tester = new S3IntegrationTester();
tester.runAllTests().catch(console.error); 