const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkUploadIssue() {
  try {
    console.log('🔍 Checking recent uploads with "brazilianbums" in filename...');
    
    const result = await pool.query(`
      SELECT id, filename, filesize, s3_key, created_at, content_type
      FROM media 
      WHERE filename LIKE '%brazilianbums%' 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`📊 Found ${result.rows.length} matching files:`);
    
    for (const file of result.rows) {
      console.log(`\n📁 File ID ${file.id}:`);
      console.log(`  Filename: ${file.filename}`);
      console.log(`  Size: ${file.filesize} bytes`);
      console.log(`  S3 Key: ${file.s3_key}`);
      console.log(`  Content Type: ${file.content_type}`);
      console.log(`  Created: ${file.created_at}`);
      
      // Check if it's a suspiciously small video file
      if (file.content_type && file.content_type.startsWith('video/') && file.filesize < 100000) {
        console.log(`  ⚠️  SUSPICIOUS: Video file is only ${file.filesize} bytes!`);
      }
    }
    
    console.log('\n🔍 Checking all recent video uploads under 100KB...');
    
    const suspiciousResult = await pool.query(`
      SELECT id, filename, filesize, s3_key, created_at, content_type
      FROM media 
      WHERE content_type LIKE 'video/%' 
      AND filesize < 100000 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log(`📊 Found ${suspiciousResult.rows.length} suspicious video files:`);
    
    for (const file of suspiciousResult.rows) {
      console.log(`\n⚠️  Suspicious Video ID ${file.id}:`);
      console.log(`  Filename: ${file.filename}`);
      console.log(`  Size: ${file.filesize} bytes`);
      console.log(`  S3 Key: ${file.s3_key}`);
      console.log(`  Created: ${file.created_at}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking uploads:', error);
  } finally {
    await pool.end();
  }
}

checkUploadIssue().catch(console.error); 