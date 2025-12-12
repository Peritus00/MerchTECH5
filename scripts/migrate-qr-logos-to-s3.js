// Migration script: Back up existing QR code logos to S3
// ------------------------------------------------------
// - Scans qr_codes.options for logo.imageData
// - Uploads each logo to S3 using the shared s3Service
// - Writes logo.imageUrl and logo.s3Key back into options JSONB
//
// Usage:
//   NODE_ENV=production DATABASE_URL="postgres://..." AWS_...=... node scripts/migrate-qr-logos-to-s3.js
//
// You can run with DRY_RUN=true to see what would be changed without writing:
//   DRY_RUN=true node scripts/migrate-qr-logos-to-s3.js

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const s3Service = require('../services/Server/s3Service');

const DRY_RUN = process.env.DRY_RUN === 'true';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

if (!s3Service || typeof s3Service.isConfigured !== 'function' || !s3Service.isConfigured()) {
  console.error('❌ AWS / S3 is not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET_NAME). Aborting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function migrateQrLogos() {
  console.log('🔍 Starting QR logo migration to S3...');
  console.log(`   DRY_RUN = ${DRY_RUN}`);

  const client = await pool.connect();

  try {
    // Find QR codes that have a logo.imageData but no logo.imageUrl yet
    const query = `
      SELECT id, user_id, options
      FROM qr_codes
      WHERE options IS NOT NULL
        AND (options->'logo'->>'imageData') IS NOT NULL
        AND (options->'logo'->>'imageUrl') IS NULL
        AND is_active = true
    `;

    const { rows } = await client.query(query);
    console.log(`📊 Found ${rows.length} QR codes with logo.imageData and no imageUrl`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const { id, user_id } = row;
      let options = row.options;

      if (!options || !options.logo || !options.logo.imageData) {
        skippedCount++;
        continue;
      }

      const imageData = options.logo.imageData;

      if (typeof imageData !== 'string' || !imageData.startsWith('data:') || !imageData.includes(',')) {
        console.warn(`⚠️ QR ${id}: logo.imageData is not a valid data URI, skipping`);
        skippedCount++;
        continue;
      }

      const [meta, base64] = imageData.split(',');
      if (!base64) {
        console.warn(`⚠️ QR ${id}: logo.imageData missing base64 part, skipping`);
        skippedCount++;
        continue;
      }

      const mimeMatch = meta.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';

      let buffer;
      try {
        buffer = Buffer.from(base64, 'base64');
      } catch (error) {
        console.warn(`⚠️ QR ${id}: failed to decode base64 logo, skipping (${error.message})`);
        skippedCount++;
        continue;
      }

      const safeUserId = user_id || 'unknown-user';
      const key = `users/${safeUserId}/qr-logos/${id}-${Date.now()}.${extension}`;

      console.log(`📤 QR ${id}: uploading logo to S3 -> ${key}`);

      if (DRY_RUN) {
        migratedCount++;
        continue;
      }

      try {
        const uploadResult = await s3Service.uploadFile(buffer, key, mimeType);
        const imageUrl = uploadResult.Location;

        const updatedOptions = {
          ...options,
          logo: {
            ...options.logo,
            imageUrl,
            s3Key: key,
          },
        };

        await client.query(
          'UPDATE qr_codes SET options = $1, updated_at = NOW() WHERE id = $2',
          [updatedOptions, id]
        );

        migratedCount++;
      } catch (error) {
        console.error(`❌ QR ${id}: failed to upload logo or update row:`, error.message);
        skippedCount++;
      }
    }

    console.log('✅ QR logo migration complete');
    console.log(`   Migrated: ${migratedCount}`);
    console.log(`   Skipped:  ${skippedCount}`);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateQrLogos().catch((error) => {
  console.error('❌ Unexpected migration error:', error);
  process.exit(1);
});


