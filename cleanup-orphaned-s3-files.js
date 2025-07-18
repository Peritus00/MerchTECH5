const { Pool } = require('pg');
const s3Service = require('./services/Server/s3Service');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function findOrphanedS3Files() {
  console.log('🔍 ORPHANED S3 FILES CLEANUP STARTING...\n');
  
  try {
    // Get all media records with S3 keys
    const mediaResult = await pool.query('SELECT id, s3_key, filename, filesize FROM media WHERE s3_key IS NOT NULL');
    const mediaFiles = mediaResult.rows;
    
    console.log(`📊 Found ${mediaFiles.length} media records with S3 keys`);
    
    const orphanedFiles = [];
    const validFiles = [];
    const errorFiles = [];
    
    for (const media of mediaFiles) {
      try {
        console.log(`🔍 Checking S3 file: ${media.s3_key}`);
        
        // Check if file exists on S3
        const exists = await s3Service.fileExists(media.s3_key);
        
        if (!exists) {
          console.log(`❌ S3 file not found: ${media.s3_key} (Media ID: ${media.id})`);
          orphanedFiles.push({
            mediaId: media.id,
            s3Key: media.s3_key,
            filename: media.filename,
            reason: 'S3_FILE_NOT_FOUND'
          });
        } else {
          // File exists, check size if available
          try {
            const metadata = await s3Service.getMetadata(media.s3_key);
            const expectedSize = media.filesize;
            const actualSize = metadata.ContentLength;
            
            if (expectedSize && actualSize !== expectedSize) {
              console.log(`⚠️  Size mismatch: ${media.s3_key} - Expected: ${expectedSize}, Actual: ${actualSize}`);
              orphanedFiles.push({
                mediaId: media.id,
                s3Key: media.s3_key,
                filename: media.filename,
                reason: 'SIZE_MISMATCH',
                expectedSize,
                actualSize
              });
            } else {
              console.log(`✅ Valid file: ${media.s3_key}`);
              validFiles.push(media);
            }
          } catch (metadataError) {
            console.log(`❌ Metadata error for ${media.s3_key}:`, metadataError.message);
            errorFiles.push({
              mediaId: media.id,
              s3Key: media.s3_key,
              filename: media.filename,
              reason: 'METADATA_ERROR',
              error: metadataError.message
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error checking ${media.s3_key}:`, error.message);
        errorFiles.push({
          mediaId: media.id,
          s3Key: media.s3_key,
          filename: media.filename,
          reason: 'CHECK_ERROR',
          error: error.message
        });
      }
    }
    
    // Report results
    console.log('\n📊 CLEANUP RESULTS:');
    console.log(`✅ Valid files: ${validFiles.length}`);
    console.log(`❌ Orphaned files: ${orphanedFiles.length}`);
    console.log(`⚠️  Error files: ${errorFiles.length}`);
    
    if (orphanedFiles.length > 0) {
      console.log('\n🗑️  ORPHANED FILES DETECTED:');
      orphanedFiles.forEach(file => {
        console.log(`  - Media ID ${file.mediaId}: ${file.filename} (${file.reason})`);
        if (file.expectedSize && file.actualSize) {
          console.log(`    Expected: ${file.expectedSize} bytes, Actual: ${file.actualSize} bytes`);
        }
      });
      
      // Ask for confirmation to clean up
      console.log('\n⚠️  WARNING: This will DELETE database records for files that are missing or corrupted on S3!');
      console.log('Run with --confirm flag to actually perform the cleanup.');
      
      if (process.argv.includes('--confirm')) {
        console.log('\n🗑️  CLEANING UP ORPHANED RECORDS...');
        
        for (const file of orphanedFiles) {
          try {
            await pool.query('DELETE FROM media WHERE id = $1', [file.mediaId]);
            console.log(`✅ Deleted media record ID ${file.mediaId}: ${file.filename}`);
          } catch (deleteError) {
            console.error(`❌ Failed to delete media record ID ${file.mediaId}:`, deleteError.message);
          }
        }
        
        console.log(`✅ Cleanup completed. Removed ${orphanedFiles.length} orphaned records.`);
      } else {
        console.log('\n💡 To perform the cleanup, run: node cleanup-orphaned-s3-files.js --confirm');
      }
    }
    
    if (errorFiles.length > 0) {
      console.log('\n⚠️  FILES WITH ERRORS:');
      errorFiles.forEach(file => {
        console.log(`  - Media ID ${file.mediaId}: ${file.filename} (${file.reason})`);
        console.log(`    Error: ${file.error}`);
      });
    }
    
    console.log('\n🎉 ORPHANED FILES CLEANUP COMPLETED');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await pool.end();
  }
}

async function findIncompleteUploads() {
  console.log('\n🔍 CHECKING FOR INCOMPLETE UPLOADS...');
  
  try {
    // Find media records where file size is suspiciously small for video files
    const suspiciousResult = await pool.query(`
      SELECT id, s3_key, filename, filesize, content_type 
      FROM media 
      WHERE s3_key IS NOT NULL 
      AND content_type LIKE 'video/%' 
      AND filesize < 100000
      ORDER BY filesize ASC
    `);
    
    const suspiciousFiles = suspiciousResult.rows;
    
    if (suspiciousFiles.length > 0) {
      console.log(`⚠️  Found ${suspiciousFiles.length} suspiciously small video files:`);
      
      for (const file of suspiciousFiles) {
        console.log(`  - ID ${file.id}: ${file.filename} (${file.filesize} bytes)`);
        
        // Check actual size on S3
        try {
          const metadata = await s3Service.getMetadata(file.s3_key);
          const actualSize = metadata.ContentLength;
          
          if (actualSize === file.filesize && actualSize < 100000) {
            console.log(`    ❌ CONFIRMED INCOMPLETE: S3 file is also ${actualSize} bytes`);
          } else {
            console.log(`    ✅ S3 file is ${actualSize} bytes (database may be wrong)`);
          }
        } catch (error) {
          console.log(`    ❌ Could not check S3: ${error.message}`);
        }
      }
    } else {
      console.log('✅ No suspiciously small video files found');
    }
    
  } catch (error) {
    console.error('❌ Error checking incomplete uploads:', error);
  }
}

// Run the cleanup
async function main() {
  await findOrphanedS3Files();
  await findIncompleteUploads();
}

main().catch(console.error); 