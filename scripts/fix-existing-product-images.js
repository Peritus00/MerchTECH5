const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

// Helper function to sanitize product image URLs (same as in server)
const sanitizeImageUrls = (urls) => {
  if (!Array.isArray(urls)) return [];

  const sanitizedUrls = urls.map(url => {
    if (typeof url !== 'string') return null;

    // Ensure HTTPS
    let newUrl = url.replace('http://', 'https://');
    
    // Replace local IP with production domain if present
    const localIpRegex = /https:\/\/192\.168\.[0-9]+\.[0-9]+:[0-9]+/;
    // Use the correct Railway deployment URL for production
    const publicBaseUrl = 'https://merchtech5-production.up.railway.app';
    newUrl = newUrl.replace(localIpRegex, publicBaseUrl);
    
    // If it's a relative path, prepend the public base URL
    if (newUrl.startsWith('/api/')) {
      newUrl = `${publicBaseUrl}${newUrl}`;
    }
    
    return newUrl;
  }).filter(Boolean); // Remove any null entries

  return sanitizedUrls;
};

async function fixExistingProductImages() {
  try {
    console.log('🔍 Scanning for products with HTTP image URLs...');
    
    // Get all products with images
    const result = await pool.query(`
      SELECT id, name, images 
      FROM products 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0
      AND is_deleted = false
    `);
    
    console.log(`📦 Found ${result.rows.length} products with images`);
    
    let updatedCount = 0;
    
    for (const product of result.rows) {
      const originalImages = product.images;
      const sanitizedImages = sanitizeImageUrls(originalImages);
      
      // Check if any URLs were changed
      const hasChanges = JSON.stringify(originalImages) !== JSON.stringify(sanitizedImages);
      
      if (hasChanges) {
        console.log(`🔧 Updating product "${product.name}" (ID: ${product.id})`);
        console.log(`   Before: ${originalImages[0]?.substring(0, 60)}...`);
        console.log(`   After:  ${sanitizedImages[0]?.substring(0, 60)}...`);
        
        await pool.query(
          'UPDATE products SET images = $1, updated_at = NOW() WHERE id = $2',
          [sanitizedImages, product.id]
        );
        
        updatedCount++;
      }
    }
    
    console.log(`✅ Migration complete! Updated ${updatedCount} products with sanitized image URLs`);
    
  } catch (error) {
    console.error('❌ Error fixing product images:', error);
  } finally {
    await pool.end();
  }
}

// Run the migration
fixExistingProductImages(); 