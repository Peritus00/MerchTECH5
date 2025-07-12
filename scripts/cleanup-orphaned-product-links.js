#!/usr/bin/env node

const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function cleanupOrphanedProductLinks() {
  console.log('🧹 Starting cleanup of orphaned product links...');
  
  try {
    // Find orphaned product links (links to products that don't exist or are deleted)
    const orphanedLinksQuery = `
      SELECT pl.id, pl.product_id, pl.playlist_id, pl.slideshow_id, pl.title
      FROM product_links pl
      LEFT JOIN products p ON pl.product_id = p.id
      WHERE p.id IS NULL OR p.is_deleted = true
    `;
    
    const orphanedResult = await pool.query(orphanedLinksQuery);
    const orphanedLinks = orphanedResult.rows;
    
    if (orphanedLinks.length === 0) {
      console.log('✅ No orphaned product links found. Database is clean!');
      return;
    }
    
    console.log(`🔍 Found ${orphanedLinks.length} orphaned product links:`);
    orphanedLinks.forEach((link, index) => {
      console.log(`   ${index + 1}. Link ID: ${link.id}, Product ID: ${link.product_id}, Title: "${link.title}"`);
      if (link.playlist_id) {
        console.log(`      └── Linked to Playlist ID: ${link.playlist_id}`);
      }
      if (link.slideshow_id) {
        console.log(`      └── Linked to Slideshow ID: ${link.slideshow_id}`);
      }
    });
    
    // Delete orphaned links
    const deleteQuery = `
      DELETE FROM product_links
      WHERE id IN (
        SELECT pl.id
        FROM product_links pl
        LEFT JOIN products p ON pl.product_id = p.id
        WHERE p.id IS NULL OR p.is_deleted = true
      )
    `;
    
    const deleteResult = await pool.query(deleteQuery);
    
    console.log(`✅ Successfully removed ${deleteResult.rowCount} orphaned product links`);
    
    // Show remaining valid product links
    const remainingQuery = `
      SELECT pl.id, pl.product_id, pl.title, p.name as product_name, pl.playlist_id, pl.slideshow_id
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE p.is_deleted = false
      ORDER BY pl.created_at DESC
    `;
    
    const remainingResult = await pool.query(remainingQuery);
    const remainingLinks = remainingResult.rows;
    
    if (remainingLinks.length > 0) {
      console.log(`\n📋 Remaining valid product links (${remainingLinks.length}):`);
      remainingLinks.forEach((link, index) => {
        console.log(`   ${index + 1}. "${link.title}" → Product: "${link.product_name}" (ID: ${link.product_id})`);
        if (link.playlist_id) {
          console.log(`      └── In Playlist ID: ${link.playlist_id}`);
        }
        if (link.slideshow_id) {
          console.log(`      └── In Slideshow ID: ${link.slideshow_id}`);
        }
      });
    } else {
      console.log('\n📋 No remaining product links found.');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

async function main() {
  try {
    await cleanupOrphanedProductLinks();
    console.log('\n🎉 Cleanup completed successfully!');
  } catch (error) {
    console.error('💥 Cleanup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { cleanupOrphanedProductLinks }; 