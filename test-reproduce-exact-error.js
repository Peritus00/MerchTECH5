const puppeteer = require('puppeteer');

/**
 * Test to Reproduce Exact Error
 * 
 * This test tries to reproduce the exact "A.Audio is not a constructor" error
 * that the user is still experiencing, even though our tests show it's fixed.
 */

const PRODUCTION_URL = 'https://app.merchtech.net';

async function reproduceExactError() {
  console.log('🎯 Attempting to reproduce the exact error you\'re seeing...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  let foundTheError = false;
  let errorDetails = null;

  // Capture the EXACT error pattern
  page.on('pageerror', error => {
    console.log('🔍 Page Error Captured:', error.message);
    
    if (error.message.includes('A.Audio is not a constructor')) {
      foundTheError = true;
      errorDetails = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
      console.log('🎯 FOUND THE EXACT ERROR!');
      console.log('❌ Message:', error.message);
      console.log('📍 Stack:', error.stack);
    }
  });

  try {
    console.log('🚀 Test 1: Basic page load (like you would do)...');
    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('🎬 Test 2: Navigate to slideshow page...');
    await page.goto(`${PRODUCTION_URL}/slideshow-access/31`, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait for any delayed errors
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🔄 Test 3: Refresh the page (common user action)...');
    await page.reload({ waitUntil: 'networkidle2' });
    
    // Wait for any delayed errors
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('▶️ Test 4: Try to interact with audio elements...');
    
    // Try to find and click any audio-related buttons
    const interactionResult = await page.evaluate(() => {
      const results = [];
      
      // Look for play buttons
      const playButtons = document.querySelectorAll('button, [role="button"]');
      let foundPlayButton = false;
      
      playButtons.forEach((button, index) => {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('play') || ariaLabel.includes('play') || 
            button.classList.contains('play') || button.classList.contains('play-button')) {
          foundPlayButton = true;
          try {
            button.click();
            results.push({ action: `clicked-play-${index}`, success: true });
          } catch (e) {
            results.push({ action: `clicked-play-${index}`, success: false, error: e.message });
          }
        }
      });
      
      if (!foundPlayButton) {
        results.push({ action: 'find-play-button', success: false, error: 'No play buttons found' });
      }
      
      return results;
    });
    
    console.log('🎮 Interaction Results:', interactionResult);
    
    // Wait for any errors triggered by interactions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔄 Test 5: Try multiple rapid page loads (stress test)...');
    
    for (let i = 0; i < 3; i++) {
      console.log(`   Attempt ${i + 1}/3...`);
      await page.goto(`${PRODUCTION_URL}/slideshow-access/31`, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('🧪 Test 6: Check current page state...');
    
    const pageState = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyHTML: document.body.innerHTML.length,
        hasContent: document.body.children.length > 2,
        errorElements: document.querySelectorAll('[class*="error"], [id*="error"]').length,
        scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
        consoleErrors: window.console ? 'Console available' : 'Console not available'
      };
    });
    
    console.log('📄 Current Page State:');
    console.log('   URL:', pageState.url);
    console.log('   Title:', pageState.title);
    console.log('   Body HTML length:', pageState.bodyHTML);
    console.log('   Has content:', pageState.hasContent);
    console.log('   Error elements:', pageState.errorElements);
    console.log('   Scripts loaded:', pageState.scripts.length);
    
    console.log('🔍 Test 7: Manual Audio constructor test in current context...');
    
    const manualTest = await page.evaluate(() => {
      const tests = [];
      
      // Test exactly what our code does
      try {
        const AudioConstructor = window['Audio'];
        const audio = new AudioConstructor('https://www.soundjay.com/misc/sounds/bell-ringing-05.wav');
        tests.push({ test: 'manual-audio-creation', success: true });
        audio.pause();
      } catch (e) {
        tests.push({ test: 'manual-audio-creation', success: false, error: e.message });
      }
      
      return tests;
    });
    
    console.log('🧪 Manual Test Results:', manualTest);
    
    console.log('\n📊 Final Assessment:');
    
    if (foundTheError) {
      console.log('🎯 SUCCESS: Reproduced the exact error!');
      console.log('❌ Error Details:', errorDetails);
      return { 
        success: true, 
        error: errorDetails,
        pageState,
        message: 'Error successfully reproduced - this means the fix is not working in your specific scenario'
      };
    } else {
      console.log('❓ Could not reproduce the error');
      console.log('This suggests:');
      console.log('   1. The error may be browser-specific');
      console.log('   2. The error may be timing-dependent');
      console.log('   3. The error may be caused by cached files on your end');
      console.log('   4. The error may happen only under specific conditions');
      
      return { 
        success: false, 
        pageState,
        message: 'Could not reproduce the error - the fix appears to be working'
      };
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      message: 'Test failed due to technical issue'
    };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  reproduceExactError()
    .then(result => {
      console.log('\n🏁 Error Reproduction Test Complete:');
      console.log('📊 Result:', result.success ? 'ERROR REPRODUCED' : 'ERROR NOT REPRODUCED');
      console.log('📝 Message:', result.message);
      
      if (result.success) {
        console.log('\n🎯 NEXT STEPS:');
        console.log('   1. The error is still happening in production');
        console.log('   2. We need to investigate the specific error context');
        console.log('   3. There may be additional Audio constructor calls we missed');
        console.log('   4. The fix may not be working in all scenarios');
      } else {
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('   1. Clear your browser cache completely');
        console.log('   2. Try a different browser or incognito mode');
        console.log('   3. Check if the error happens on different devices');
        console.log('   4. The fix may already be working but cached files are causing issues');
      }
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
    });
}

module.exports = reproduceExactError; 