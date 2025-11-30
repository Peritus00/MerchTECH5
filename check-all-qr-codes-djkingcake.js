const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkAll() {
  try {
    const userId = 43;
    
    console.log('🔍 Getting ALL QR codes for user DJKINGCAKE (including inactive)...\n');
    
    const allQRs = await pool.query(
      `SELECT 
        q.id,
        q.name,
        q.url,
        q.playlist_id,
        q.created_at,
        q.is_active,
        COUNT(s.id) as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      WHERE q.user_id = $1
      GROUP BY q.id, q.name, q.url, q.playlist_id, q.created_at, q.is_active
      ORDER BY q.created_at DESC`,
      [userId]
    );
    
    console.log(`Total QR codes found: ${allQRs.rows.length}\n`);
    console.log('All QR codes:\n');
    allQRs.rows.forEach((qr, idx) => {
      const matches = qr.name?.toLowerCase().includes('bottle') || 
                     qr.url?.includes('playlist-access/43') || 
                     qr.scan_count === 4;
      console.log(`${idx + 1}. ID: ${qr.id} | Name: "${qr.name}" | URL: ${qr.url?.substring(0, 60)}... | Scans: ${qr.scan_count} | Active: ${qr.is_active}${matches ? ' ⭐' : ''}`);
    });
    
    // Check if there's a QR code that was recently updated
    console.log('\n🔍 Checking updated_at timestamps...\n');
    const updatedQRs = await pool.query(
      `SELECT id, name, url, created_at, updated_at, is_active
       FROM qr_codes
       WHERE user_id = $1
         AND updated_at >= '2025-11-01'
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId]
    );
    
    if (updatedQRs.rows.length > 0) {
      console.log(`Found ${updatedQRs.rows.length} QR codes updated recently:\n`);
      updatedQRs.rows.forEach((qr, idx) => {
        console.log(`${idx + 1}. ID: ${qr.id}, Name: "${qr.name}", Updated: ${qr.updated_at}`);
      });
    } else {
      console.log('No QR codes updated recently.\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAll();

