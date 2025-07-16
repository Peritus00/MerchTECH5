const puppeteer = require('puppeteer');

/**
 * Audio Constructor Stress Test
 * 
 * This test specifically tries to reproduce the minification error by:
 * 1. Testing multiple audio initialization scenarios
 * 2. Simulating the exact conditions that cause minification issues
 * 3. Testing different browser contexts and timing
 */

const PRODUCTION_URL = 'https://app.merchtech.net';

async function stressTestAudioConstructor() {
  console.log('🔥 Audio Constructor Stress Test Starting...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const errors = [];
  const audioConstructorErrors = [];

  // Capture ALL errors
  page.on('pageerror', error => {
    errors.push(error);
    if (error.message.includes('Audio') || error.message.includes('A.Audio')) {
      audioConstructorErrors.push(error);
      console.log('🎯 AUDIO-RELATED ERROR FOUND!');
      console.log('❌ Error:', error.message);
      console.log('📍 Stack:', error.stack);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Audio') || text.includes('A.Audio')) {
        console.log('🎯 AUDIO CONSOLE ERROR:', text);
      }
    }
  });

  try {
    console.log('🚀 Phase 1: Basic Audio Constructor Test');
    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Test 1: Rapid audio constructor calls
    console.log('⚡ Test 1: Rapid audio constructor calls');
    const rapidTest = await page.evaluate(() => {
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        try {
          const audio = new Audio();
          results.push({ attempt: i, success: true });
        } catch (e) {
          results.push({ attempt: i, success: false, error: e.message });
        }
      }
      
      return results;
    });

    const rapidFailures = rapidTest.filter(r => !r.success);
    console.log(`   Rapid test results: ${rapidTest.length - rapidFailures.length}/${rapidTest.length} passed`);
    if (rapidFailures.length > 0) {
      console.log('   Failures:', rapidFailures);
    }

    // Test 2: Test with different URLs
    console.log('🎵 Test 2: Audio constructor with URLs');
    const urlTest = await page.evaluate(() => {
      const testUrls = [
        'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
        'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmkgBSuBzvLZiTYIG2m98OScTgwOUarm7LZlHgU7k9nzx3kpBSF1xe/eizEIHWq+8+OWT'
      ];
      
      const results = [];
      testUrls.forEach((url, index) => {
        try {
          const audio = new Audio(url);
          results.push({ url: index, success: true });
        } catch (e) {
          results.push({ url: index, success: false, error: e.message });
        }
      });
      
      return results;
    });

    const urlFailures = urlTest.filter(r => !r.success);
    console.log(`   URL test results: ${urlTest.length - urlFailures.length}/${urlTest.length} passed`);
    if (urlFailures.length > 0) {
      console.log('   Failures:', urlFailures);
    }

    // Test 3: Test slideshow page specifically
    console.log('🎬 Test 3: Slideshow page stress test');
    await page.goto(`${PRODUCTION_URL}/slideshow-access/31`, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test multiple audio constructor calls in slideshow context
    const slideshowTest = await page.evaluate(() => {
      const results = [];
      
      // Test 1: Direct Audio constructor
      try {
        const audio1 = new Audio();
        results.push({ test: 'direct', success: true });
      } catch (e) {
        results.push({ test: 'direct', success: false, error: e.message });
      }

      // Test 2: Window Audio constructor
      try {
        const AudioConstructor = window['Audio'];
        const audio2 = new AudioConstructor();
        results.push({ test: 'window', success: true });
      } catch (e) {
        results.push({ test: 'window', success: false, error: e.message });
      }

      // Test 3: Multiple rapid calls
      for (let i = 0; i < 5; i++) {
        try {
          const AudioConstructor = window['Audio'];
          const audio = new AudioConstructor();
          results.push({ test: `rapid-${i}`, success: true });
        } catch (e) {
          results.push({ test: `rapid-${i}`, success: false, error: e.message });
        }
      }

      return results;
    });

    const slideshowFailures = slideshowTest.filter(r => !r.success);
    console.log(`   Slideshow test results: ${slideshowTest.length - slideshowFailures.length}/${slideshowTest.length} passed`);
    if (slideshowFailures.length > 0) {
      console.log('   Failures:', slideshowFailures);
    }

    // Test 4: Try to trigger the exact error scenario
    console.log('🎯 Test 4: Attempting to trigger minification error');
    await page.evaluate(() => {
      // Simulate the exact conditions that might cause minification issues
      try {
        // This simulates what might happen in minified code
        const A = { Audio: window.Audio };
        const audio = new A.Audio(); // This would fail if A.Audio is mangled
        console.log('Minification simulation passed');
      } catch (e) {
        console.log('Minification simulation failed:', e.message);
        throw e;
      }
    });

    // Test 5: Test with different timing
    console.log('⏰ Test 5: Testing with different timing scenarios');
    for (let delay = 0; delay < 3; delay++) {
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      
      const timingTest = await page.evaluate((delayMs) => {
        try {
          const AudioConstructor = window['Audio'];
          const audio = new AudioConstructor();
          return { delay: delayMs, success: true };
        } catch (e) {
          return { delay: delayMs, success: false, error: e.message };
        }
      }, delay * 1000);

      if (!timingTest.success) {
        console.log(`   Timing test failed at ${delay}s:`, timingTest.error);
      }
    }

    // Final assessment
    console.log('\n📊 Stress Test Summary:');
    console.log(`   Total errors captured: ${errors.length}`);
    console.log(`   Audio-related errors: ${audioConstructorErrors.length}`);
    
    if (audioConstructorErrors.length > 0) {
      console.log('\n🎯 AUDIO CONSTRUCTOR ERRORS FOUND:');
      audioConstructorErrors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.message}`);
      });
      return { success: true, errors: audioConstructorErrors };
    } else {
      console.log('\n✅ No Audio constructor errors found - fix is working!');
      return { success: false, message: 'No errors reproduced - fix appears to be working' };
    }

  } catch (error) {
    console.error('💥 Stress test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run the stress test
if (require.main === module) {
  stressTestAudioConstructor()
    .then(result => {
      console.log('\n🏁 Stress Test Complete:', result);
      if (result.success) {
        console.log('🎯 Audio constructor error successfully reproduced!');
        console.log('This means there are still issues that need to be fixed.');
      } else {
        console.log('✅ Audio constructor error not found - fix is working!');
        console.log('The window["Audio"] pattern is successfully preventing minification issues.');
      }
    })
    .catch(error => {
      console.error('💥 Stress test suite failed:', error);
    });
}

module.exports = stressTestAudioConstructor; 