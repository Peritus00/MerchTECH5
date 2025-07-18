const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function identifyPreValidationUploads() {
  console.log('🔍 IDENTIFYING PRE-VALIDATION UPLOADS...\n');
  
  try {
    // Find all video files that are suspiciously small
    const suspiciousVideos = await pool.query(`
      SELECT id, filename, filesize, s3_key, created_at, content_type
      FROM media 
      WHERE content_type LIKE 'video/%' 
      AND filesize < 100000 
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${suspiciousVideos.rows.length} suspiciously small video files:`);
    
    for (const file of suspiciousVideos.rows) {
      console.log(`\n⚠️  Video ID ${file.id}:`);
      console.log(`  📁 Filename: ${file.filename}`);
      console.log(`  📊 Database Size: ${file.filesize} bytes`);
      console.log(`  🗓️  Created: ${file.created_at}`);
      console.log(`  🔑 S3 Key: ${file.s3_key}`);
      console.log(`  🎬 Content Type: ${file.content_type}`);
    }
    
    // Find files uploaded around the time validation was implemented
    const recentUploads = await pool.query(`
      SELECT id, filename, filesize, s3_key, created_at, content_type
      FROM media 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      AND content_type LIKE 'video/%'
      ORDER BY created_at DESC
    `);
    
    console.log(`\n📊 Recent video uploads (last 7 days): ${recentUploads.rows.length}`);
    
    for (const file of recentUploads.rows) {
      const isSuspicious = file.filesize < 100000;
      const status = isSuspicious ? '⚠️  SUSPICIOUS' : '✅ NORMAL';
      
      console.log(`\n${status} Video ID ${file.id}:`);
      console.log(`  📁 Filename: ${file.filename}`);
      console.log(`  📊 Database Size: ${(file.filesize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  🗓️  Created: ${file.created_at}`);
      
      if (isSuspicious) {
        console.log(`  🚨 NEEDS RE-UPLOAD: File is likely truncated`);
      }
    }
    
    // Summary
    console.log('\n📋 SUMMARY:');
    console.log(`🔍 Total suspicious video files: ${suspiciousVideos.rows.length}`);
    console.log(`📅 Recent video uploads: ${recentUploads.rows.length}`);
    
    if (suspiciousVideos.rows.length > 0) {
      console.log('\n🔧 RECOMMENDED ACTIONS:');
      console.log('1. Re-upload the suspicious files through the media interface');
      console.log('2. The validation system will ensure complete uploads');
      console.log('3. Delete the old truncated files after successful re-upload');
      
      console.log('\n💡 FILES TO RE-UPLOAD:');
      suspiciousVideos.rows.forEach(file => {
        console.log(`  - ${file.filename} (ID: ${file.id})`);
      });
    } else {
      console.log('\n✅ No suspicious files found - validation system is working!');
    }
    
  } catch (error) {
    console.error('❌ Error identifying uploads:', error);
  } finally {
    await pool.end();
  }
}

identifyPreValidationUploads().catch(console.error); 