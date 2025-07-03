const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function fixSlideshowsTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Fixing slideshows table schema...');
    
    // First, check what columns currently exist
    console.log('🔍 Checking current table structure...');
    const columnsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'slideshows';
    `);
    
    const existingColumns = columnsResult.rows.map(row => row.column_name);
    console.log('📊 Existing columns:', existingColumns);
    
    // SQL commands to fix the slideshows table
    const sqlCommands = [];
    
    // Rename owner_id to user_id if it exists
    if (existingColumns.includes('owner_id') && !existingColumns.includes('user_id')) {
      sqlCommands.push('ALTER TABLE slideshows RENAME COLUMN owner_id TO user_id;');
    }
    
    // Rename title to name if it exists
    if (existingColumns.includes('title') && !existingColumns.includes('name')) {
      sqlCommands.push('ALTER TABLE slideshows RENAME COLUMN title TO name;');
    }
    
    // Add missing columns for slide duration and access control
    if (!existingColumns.includes('autoplay_interval')) {
      sqlCommands.push('ALTER TABLE slideshows ADD COLUMN autoplay_interval INTEGER DEFAULT 5000;');
    }
    
    if (!existingColumns.includes('transition')) {
      sqlCommands.push('ALTER TABLE slideshows ADD COLUMN transition VARCHAR(32) DEFAULT \'fade\';');
    }
    
    if (!existingColumns.includes('requires_activation_code')) {
      sqlCommands.push('ALTER TABLE slideshows ADD COLUMN requires_activation_code BOOLEAN DEFAULT FALSE;');
    }
    
    // Update indexes
    sqlCommands.push('DROP INDEX IF EXISTS idx_slideshows_owner_id;');
    sqlCommands.push('CREATE INDEX IF NOT EXISTS idx_slideshows_user_id ON slideshows(user_id);');
    sqlCommands.push('CREATE INDEX IF NOT EXISTS idx_slideshows_requires_activation_code ON slideshows(requires_activation_code);');
    
    // Update any existing slideshows to have default values
    sqlCommands.push(`
      UPDATE slideshows 
      SET autoplay_interval = 5000,
          transition = 'fade',
          requires_activation_code = FALSE
      WHERE autoplay_interval IS NULL 
         OR transition IS NULL 
         OR requires_activation_code IS NULL;
    `);
    
    // Execute the commands
    for (const sql of sqlCommands) {
      console.log(`📝 Executing: ${sql.split(';')[0].trim()}...`);
      await pool.query(sql);
    }
    
    // Verify the final table structure
    console.log('🔍 Verifying final table structure...');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'slideshows' 
      ORDER BY ordinal_position;
    `);
    
    console.log('✅ Slideshows table fixed successfully!');
    console.log('📊 Final columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
  } catch (error) {
    console.error('❌ Failed to fix slideshows table:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  fixSlideshowsTable();
}

module.exports = { fixSlideshowsTable }; 