const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Checking database schema...\n');
    
    // Check if slideshows table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'slideshows'
      );
    `);
    
    console.log('📋 Slideshows table exists:', tableExists.rows[0].exists);
    
    if (tableExists.rows[0].exists) {
      // Get table structure
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'slideshows' 
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📊 Slideshows table columns:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'} ${col.column_default ? `default: ${col.column_default}` : ''}`);
      });
      
      // Check for specific columns we need
      const hasOwnerId = columns.rows.some(col => col.column_name === 'owner_id');
      const hasUserId = columns.rows.some(col => col.column_name === 'user_id');
      const hasRequiresActivation = columns.rows.some(col => col.column_name === 'requires_activation_code');
      
      console.log('\n🔍 Key columns check:');
      console.log(`  - owner_id: ${hasOwnerId ? '✅' : '❌'}`);
      console.log(`  - user_id: ${hasUserId ? '✅' : '❌'}`);
      console.log(`  - requires_activation_code: ${hasRequiresActivation ? '✅' : '❌'}`);
      
      if (!hasRequiresActivation) {
        console.log('\n⚠️  Missing requires_activation_code column. Running migration...');
        
        const migrationSQL = `
          ALTER TABLE slideshows 
          ADD COLUMN IF NOT EXISTS autoplay_interval INTEGER DEFAULT 5000,
          ADD COLUMN IF NOT EXISTS transition VARCHAR(32) DEFAULT 'fade',
          ADD COLUMN IF NOT EXISTS requires_activation_code BOOLEAN DEFAULT FALSE;
          
          ALTER TABLE slideshows RENAME COLUMN IF EXISTS owner_id TO user_id;
          ALTER TABLE slideshows RENAME COLUMN IF EXISTS title TO name;
        `;
        
        await pool.query(migrationSQL);
        console.log('✅ Migration applied successfully!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema(); 