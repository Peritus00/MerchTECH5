const multer = require('multer');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Recreate the exact multer configuration from the server
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB limit (matches web frontend)
  fileFilter: (req, file, cb) => {
    const requestId = `req_${Date.now()}`;
    console.log(`🔍 FILE_FILTER [${requestId}]: Checking file:`, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    const allowedTypes = /jpeg|jpg|png|gif|webp|mp3|wav|m4a|aac|ogg|mp4|webm|avi|mov|wmv|flv|mkv|quicktime/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype.startsWith('audio/') || 
                    file.mimetype.startsWith('image/') ||
                    file.mimetype.startsWith('video/');
    
    if (extname || mimetype) {
      console.log(`✅ FILE_FILTER [${requestId}]: File accepted`);
      cb(null, true);
    } else {
      const filterError = new Error('File type not allowed. Only images, audio, and video are supported.');
      filterError.code = 'FILE_TYPE_NOT_ALLOWED';
      console.log(`❌ FILE_FILTER [${requestId}]: File rejected. Type not allowed: ${file.mimetype}`);
      cb(filterError, false);
    }
  }
});

// Test endpoint to check buffer sizes
app.post('/test-upload', upload.single('image'), (req, res) => {
  const requestId = `test_${Date.now()}`;
  console.log(`🧪 TEST_UPLOAD [${requestId}]: Starting buffer test`);
  
  if (!req.file) {
    console.error(`❌ TEST_UPLOAD [${requestId}]: No file uploaded.`);
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  console.log(`🧪 TEST_UPLOAD [${requestId}]: File info:`, {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    hasBuffer: !!req.file.buffer,
    bufferLength: req.file.buffer ? req.file.buffer.length : 'undefined',
    bufferType: typeof req.file.buffer
  });

  // Check if buffer size matches reported file size
  if (req.file.buffer && req.file.size !== req.file.buffer.length) {
    console.error(`❌ TEST_UPLOAD [${requestId}]: BUFFER SIZE MISMATCH!`);
    console.error(`   Reported size: ${req.file.size}`);
    console.error(`   Buffer length: ${req.file.buffer.length}`);
    console.error(`   Difference: ${req.file.size - req.file.buffer.length} bytes`);
    
    return res.status(500).json({
      error: 'Buffer size mismatch detected',
      reportedSize: req.file.size,
      bufferLength: req.file.buffer.length,
      difference: req.file.size - req.file.buffer.length
    });
  }

  console.log(`✅ TEST_UPLOAD [${requestId}]: Buffer size matches reported size`);
  
  res.json({
    message: 'Buffer test successful',
    filename: req.file.originalname,
    reportedSize: req.file.size,
    bufferLength: req.file.buffer.length,
    match: req.file.size === req.file.buffer.length
  });
});

// Test with a real file
async function testWithRealFile() {
  console.log('🧪 BUFFER TEST: Testing multer buffer handling...\n');
  
  try {
    // Create a test file
    const testSize = 1024 * 1024; // 1MB
    const testData = Buffer.alloc(testSize, 'A');
    const testFilePath = path.join(__dirname, 'test-buffer-file.mp4');
    
    fs.writeFileSync(testFilePath, testData);
    console.log(`📁 Created test file: ${testFilePath} (${testSize} bytes)`);
    
    // Check file size on disk
    const stats = fs.statSync(testFilePath);
    console.log(`📊 File on disk: ${stats.size} bytes`);
    
    if (stats.size !== testSize) {
      console.error('❌ File creation failed - size mismatch');
      return;
    }
    
    console.log('✅ Test file created successfully');
    console.log('\n💡 To test this:');
    console.log('1. Start this test server: node test-upload-buffer.js');
    console.log('2. Upload the test file to http://localhost:3001/test-upload');
    console.log('3. Check the logs for buffer size issues');
    
    // Cleanup
    fs.unlinkSync(testFilePath);
    
  } catch (error) {
    console.error('❌ Test setup failed:', error);
  }
}

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🧪 Buffer test server running on http://localhost:${PORT}`);
  testWithRealFile();
});

// If running directly, just run the test
if (require.main === module) {
  testWithRealFile();
} 