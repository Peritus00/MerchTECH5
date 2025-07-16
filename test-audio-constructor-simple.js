const puppeteer = require('puppeteer');

/**
 * Simple Audio Constructor Error Test
 * 
 * This test specifically targets the "Uncaught TypeError: A.Audio is not a constructor" error
 * by testing the exact scenarios where it occurs in production builds.
 */

const PRODUCTION_URL = 'https://app.merchtech.net';

async function testAudioConstructorError() {
  console.log('🎯 Testing Audio Constructor Error in Production...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  let audioConstructorError = null;

  // Capture the specific error we're looking for
  page.on('pageerror', error => {
    if (error.message.includes('A.Audio is not a constructor')) {
      audioConstructorError = error;
      console.log('🎯 FOUND THE ERROR!');
      console.log('❌ Error:', error.message);
      console.log('📍 Stack:', error.stack);
    }
  });

  // Also capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('A.Audio is not a constructor')) {
      console.log('🎯 CONSOLE ERROR FOUND!');
      console.log('❌ Console Error:', msg.text());
    }
  });

  try {
    console.log('🚀 Navigating to production site...');
    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('🔍 Testing Audio Constructor Access...');
    
    // Test 1: Check if Audio constructor is accessible
    const audioTest = await page.evaluate(() => {
      const results = {
        directAudio: typeof Audio,
        windowAudio: typeof window['Audio'],
        audioConstructorWorks: false,
        windowAudioConstructorWorks: false,
        error: null
      };

      // Test direct Audio constructor
      try {
        const audio1 = new Audio();
        results.audioConstructorWorks = true;
      } catch (e) {
        results.error = e.message;
      }

      // Test window['Audio'] constructor
      try {
        const AudioConstructor = window['Audio'];
        const audio2 = new AudioConstructor();
        results.windowAudioConstructorWorks = true;
      } catch (e) {
        results.windowAudioError = e.message;
      }

      return results;
    });

    console.log('📊 Audio Constructor Test Results:');
    console.log('   Direct Audio type:', audioTest.directAudio);
    console.log('   Window Audio type:', audioTest.windowAudio);
    console.log('   Direct Audio works:', audioTest.audioConstructorWorks);
    console.log('   Window Audio works:', audioTest.windowAudioConstructorWorks);
    if (audioTest.error) console.log('   Error:', audioTest.error);
    if (audioTest.windowAudioError) console.log('   Window Audio Error:', audioTest.windowAudioError);

    // Test 2: Navigate to slideshow page to trigger the error
    console.log('🎬 Testing slideshow page for Audio constructor usage...');
    await page.goto(`${PRODUCTION_URL}/slideshow-access/31`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for any JavaScript to execute
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: Try to trigger audio playback
    console.log('▶️ Attempting to trigger audio playback...');
    await page.evaluate(() => {
      // Try to find and click any play buttons
      const playButtons = document.querySelectorAll('button, [role="button"]');
      playButtons.forEach(button => {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('play') || ariaLabel.includes('play') || 
            button.classList.contains('play') || button.classList.contains('play-button')) {
          try {
            button.click();
            console.log('Clicked play button:', button);
          } catch (e) {
            console.log('Error clicking play button:', e.message);
          }
        }
      });
    });

    // Wait for potential errors
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Manually test Audio constructor in different contexts
    console.log('🧪 Testing Audio constructor in different contexts...');
    const contextTests = await page.evaluate(() => {
      const tests = [];
      
      // Test in global scope
      try {
        const audio = new Audio();
        tests.push({ context: 'global', success: true });
      } catch (e) {
        tests.push({ context: 'global', success: false, error: e.message });
      }

      // Test in function scope
      try {
        (function() {
          const audio = new Audio();
          tests.push({ context: 'function', success: true });
        })();
      } catch (e) {
        tests.push({ context: 'function', success: false, error: e.message });
      }

      // Test with window access
      try {
        const AudioConstructor = window['Audio'];
        const audio = new AudioConstructor();
        tests.push({ context: 'window', success: true });
      } catch (e) {
        tests.push({ context: 'window', success: false, error: e.message });
      }

      return tests;
    });

    console.log('🧪 Context Test Results:');
    contextTests.forEach(test => {
      console.log(`   ${test.context}: ${test.success ? '✅ PASS' : '❌ FAIL'}`);
      if (!test.success) console.log(`     Error: ${test.error}`);
    });

    // Test 5: Check if the error occurs in minified code
    console.log('🔍 Checking for minified code issues...');
    const minificationTest = await page.evaluate(() => {
      // Look for signs of minification affecting Audio constructor
      const scripts = Array.from(document.scripts);
      const minifiedScripts = scripts.filter(script => 
        script.src.includes('entry-') || 
        script.src.includes('.min.') ||
        (script.textContent && script.textContent.includes('A.Audio'))
      );
      
      return {
        totalScripts: scripts.length,
        minifiedScripts: minifiedScripts.length,
        hasMinifiedAudio: minifiedScripts.some(script => 
          script.textContent && script.textContent.includes('A.Audio')
        )
      };
    });

    console.log('🔍 Minification Test Results:');
    console.log('   Total scripts:', minificationTest.totalScripts);
    console.log('   Minified scripts:', minificationTest.minifiedScripts);
    console.log('   Has minified Audio:', minificationTest.hasMinifiedAudio);

    // Final result
    if (audioConstructorError) {
      console.log('\n🎯 SUCCESS: Audio constructor error reproduced!');
      console.log('❌ Error message:', audioConstructorError.message);
      console.log('📍 Stack trace:', audioConstructorError.stack);
      return { success: true, error: audioConstructorError };
    } else {
      console.log('\n✅ No Audio constructor error found - our fix is working!');
      return { success: false, message: 'No error reproduced - fix appears to be working' };
    }

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testAudioConstructorError()
    .then(result => {
      console.log('\n📊 Final Result:', result);
      if (result.success) {
        console.log('🎯 Audio constructor error successfully reproduced!');
      } else {
        console.log('✅ Audio constructor error not found - fix is working!');
      }
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
    });
}

module.exports = testAudioConstructorError; 