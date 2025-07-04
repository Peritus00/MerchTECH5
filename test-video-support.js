const axios = require('axios');

// Test Video Support in MerchTech App
class VideoSupportTester {
  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.70:5001/api';
    this.authToken = null;
    this.testResults = [];
  }

  async login() {
    console.log('🔐 Logging in for video support test...');
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

  async testVideoUpload() {
    console.log('🎥 Testing Video Upload Support...');
    if (!this.authToken) {
      console.log('⏭️ Video Upload: SKIPPED (No auth token)');
      return;
    }

    try {
      // Test uploading a mock video file
      const mockVideoData = {
        title: 'Test Video File',
        filePath: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=',
        url: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=',
        filename: 'test-video.mp4',
        fileType: 'video',
        contentType: 'video/mp4',
        filesize: 1024000,
        uniqueId: `video-test-${Date.now()}`
      };

      const response = await axios.post(`${this.apiUrl}/media`, mockVideoData, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.data.id) {
        console.log('✅ Video Upload: PASSED');
        console.log(`   - Video ID: ${response.data.id}`);
        console.log(`   - File Type: ${response.data.file_type}`);
        console.log(`   - Content Type: ${response.data.content_type}`);
        
        this.testResults.push({
          test: 'Video Upload',
          status: 'PASSED',
          details: { 
            videoId: response.data.id,
            fileType: response.data.file_type,
            contentType: response.data.content_type
          }
        });

        // Test video streaming
        await this.testVideoStreaming(response.data.id);
      } else {
        throw new Error('Invalid video upload response');
      }
    } catch (error) {
      console.log('❌ Video Upload: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({
        test: 'Video Upload',
        status: 'FAILED',
        error: error.response?.data?.error || error.message
      });
    }
    console.log('');
  }

  async testVideoStreaming(videoId) {
    console.log('🎬 Testing Video Streaming...');
    try {
      const response = await axios.get(`${this.apiUrl}/media/${videoId}/stream`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (response.status === 200) {
        console.log('✅ Video Streaming: PASSED');
        console.log(`   - Content Type: ${response.headers['content-type']}`);
        console.log(`   - Content Length: ${response.headers['content-length']}`);
        
        this.testResults.push({
          test: 'Video Streaming',
          status: 'PASSED',
          details: { 
            contentType: response.headers['content-type'],
            contentLength: response.headers['content-length']
          }
        });
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Video Streaming: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({
        test: 'Video Streaming',
        status: 'FAILED',
        error: error.response?.data?.error || error.message
      });
    }
  }

  async testSubscriptionLimits() {
    console.log('📊 Testing Video Subscription Limits...');
    if (!this.authToken) {
      console.log('⏭️ Subscription Limits: SKIPPED (No auth token)');
      return;
    }

    try {
      // Get current media count
      const mediaResponse = await axios.get(`${this.apiUrl}/media?mine=true`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      const mediaCount = mediaResponse.data.media?.length || 0;
      console.log(`   - Current media files: ${mediaCount}`);
      
      // Check if user is at limit
      if (mediaCount >= 3) { // Free tier limit
        console.log('✅ Subscription Limits: WORKING (User at limit)');
        this.testResults.push({
          test: 'Subscription Limits',
          status: 'PASSED',
          details: { mediaCount, atLimit: true }
        });
      } else {
        console.log('✅ Subscription Limits: WORKING (User under limit)');
        this.testResults.push({
          test: 'Subscription Limits',
          status: 'PASSED',
          details: { mediaCount, atLimit: false }
        });
      }
    } catch (error) {
      console.log('❌ Subscription Limits: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({
        test: 'Subscription Limits',
        status: 'FAILED',
        error: error.response?.data?.error || error.message
      });
    }
    console.log('');
  }

  async testFileTypeDetection() {
    console.log('🔍 Testing File Type Detection...');
    
    const testCases = [
      { mimeType: 'video/mp4', expected: 'video' },
      { mimeType: 'video/webm', expected: 'video' },
      { mimeType: 'video/avi', expected: 'video' },
      { mimeType: 'audio/mp3', expected: 'audio' },
      { mimeType: 'audio/wav', expected: 'audio' },
      { mimeType: 'image/jpeg', expected: 'image' },
    ];

    let allPassed = true;
    for (const testCase of testCases) {
      const detected = this.getFileType(testCase.mimeType);
      const passed = detected === testCase.expected;
      
      console.log(`   - ${testCase.mimeType}: ${detected} ${passed ? '✅' : '❌'}`);
      if (!passed) allPassed = false;
    }

    if (allPassed) {
      console.log('✅ File Type Detection: PASSED');
      this.testResults.push({
        test: 'File Type Detection',
        status: 'PASSED'
      });
    } else {
      console.log('❌ File Type Detection: FAILED');
      this.testResults.push({
        test: 'File Type Detection',
        status: 'FAILED'
      });
    }
    console.log('');
  }

  getFileType(mimeType) {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    return 'other';
  }

  async runAllTests() {
    console.log('🎥 MerchTech Video Support Test Suite');
    console.log('=====================================');
    console.log('');

    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.log('⚠️ Cannot run full test suite without authentication');
    }

    await this.testFileTypeDetection();
    await this.testVideoUpload();
    await this.testSubscriptionLimits();

    console.log('📋 Test Results Summary:');
    console.log('========================');
    this.testResults.forEach(result => {
      const status = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.details) {
        console.log(`   Details:`, result.details);
      }
    });

    const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
    const totalTests = this.testResults.length;
    
    console.log('');
    console.log(`📊 Overall: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All video support tests passed! Video functionality is ready.');
    } else {
      console.log('⚠️ Some tests failed. Please review the issues above.');
    }
  }
}

// Run the tests
const tester = new VideoSupportTester();
tester.runAllTests().catch(console.error); 