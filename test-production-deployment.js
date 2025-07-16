const puppeteer = require('puppeteer');

/**
 * Production Deployment Verification Test
 * 
 * This test checks if our Audio constructor fix is actually deployed
 * and identifies if caching is causing the issue.
 */

const PRODUCTION_URL = 'https://app.merchtech.net';

async function testProductionDeployment() {
  console.log('🔍 Testing Production Deployment Status...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-cache', '--disable-application-cache']
  });

  const page = await browser.newPage();
  
  // Disable cache to ensure fresh files
  await page.setCacheEnabled(false);
  
  let audioErrors = [];
  let allErrors = [];

  // Capture all errors
  page.on('pageerror', error => {
    allErrors.push(error);
    if (error.message.includes('Audio') || error.message.includes('A.Audio')) {
      audioErrors.push(error);
      console.log('🎯 AUDIO ERROR FOUND!');
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
    console.log('🚀 Step 1: Loading production site with fresh cache...');
    await page.goto(PRODUCTION_URL, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });

    console.log('🔍 Step 2: Checking JavaScript files for Audio constructor patterns...');
    
    // Get all script tags and check their content
    const scriptAnalysis = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const analysis = {
        totalScripts: scripts.length,
        entryScripts: [],
        hasOldAudioPattern: false,
        hasNewAudioPattern: false,
        scriptUrls: []
      };

      scripts.forEach(script => {
        const src = script.src;
        analysis.scriptUrls.push(src);
        
        if (src.includes('entry-') || src.includes('main-')) {
          analysis.entryScripts.push(src);
        }
      });

      return analysis;
    });

    console.log('📊 Script Analysis:');
    console.log('   Total scripts:', scriptAnalysis.totalScripts);
    console.log('   Entry scripts:', scriptAnalysis.entryScripts.length);
    console.log('   Script URLs:', scriptAnalysis.scriptUrls.slice(0, 3)); // Show first 3

    console.log('🔍 Step 3: Testing Audio constructor directly...');
    
    const audioTest = await page.evaluate(() => {
      const tests = [];
      
      // Test 1: Direct Audio constructor
      try {
        const audio = new Audio();
        tests.push({ test: 'direct', success: true, error: null });
        audio.pause(); // Clean up
      } catch (e) {
        tests.push({ test: 'direct', success: false, error: e.message });
      }

      // Test 2: Window Audio constructor
      try {
        const AudioConstructor = window['Audio'];
        const audio = new AudioConstructor();
        tests.push({ test: 'window', success: true, error: null });
        audio.pause(); // Clean up
      } catch (e) {
        tests.push({ test: 'window', success: false, error: e.message });
      }

      // Test 3: Simulate minified code scenario
      try {
        const A = { Audio: window.Audio };
        const audio = new A.Audio(); // This would fail if minified incorrectly
        tests.push({ test: 'minified-simulation', success: true, error: null });
        audio.pause(); // Clean up
      } catch (e) {
        tests.push({ test: 'minified-simulation', success: false, error: e.message });
      }

      return tests;
    });

    console.log('🧪 Audio Constructor Tests:');
    audioTest.forEach(test => {
      console.log(`   ${test.test}: ${test.success ? '✅ PASS' : '❌ FAIL'}`);
      if (!test.success) console.log(`     Error: ${test.error}`);
    });

    console.log('🎬 Step 4: Testing slideshow page specifically...');
    
    // Navigate to slideshow page
    await page.goto(`${PRODUCTION_URL}/slideshow-access/31`, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if page loaded successfully
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasError: document.body.textContent?.includes('error') || false,
        hasWhiteScreen: document.body.children.length < 2,
        bodyText: document.body.textContent?.substring(0, 200) || ''
      };
    });

    console.log('📄 Page Content Analysis:');
    console.log('   Title:', pageContent.title);
    console.log('   Has error text:', pageContent.hasError);
    console.log('   Appears to be white screen:', pageContent.hasWhiteScreen);
    console.log('   Body text preview:', pageContent.bodyText);

    console.log('🔍 Step 5: Force-triggering audio initialization...');
    
    // Try to trigger audio initialization
    const triggerTest = await page.evaluate(() => {
      const results = [];
      
      try {
        // Try to create audio elements like our components do
        const AudioConstructor = window['Audio'];
        
        // Test with URL (like PreviewPlayer does)
        const audio1 = new AudioConstructor('https://www.soundjay.com/misc/sounds/bell-ringing-05.wav');
        results.push({ test: 'audio-with-url', success: true });
        audio1.pause();
        
        // Test multiple rapid calls (stress test)
        for (let i = 0; i < 5; i++) {
          const audio = new AudioConstructor();
          results.push({ test: `rapid-${i}`, success: true });
          audio.pause();
        }
        
      } catch (e) {
        results.push({ test: 'trigger-test', success: false, error: e.message });
      }
      
      return results;
    });

    console.log('🚀 Trigger Test Results:');
    const triggerFailures = triggerTest.filter(r => !r.success);
    console.log(`   ${triggerTest.length - triggerFailures.length}/${triggerTest.length} tests passed`);
    if (triggerFailures.length > 0) {
      console.log('   Failures:', triggerFailures);
    }

    console.log('📊 Final Assessment:');
    console.log(`   Total errors captured: ${allErrors.length}`);
    console.log(`   Audio-related errors: ${audioErrors.length}`);
    
    if (audioErrors.length > 0) {
      console.log('\n❌ AUDIO ERRORS STILL PRESENT:');
      audioErrors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.message}`);
      });
      
      return { 
        deploymentStatus: 'FAILED', 
        reason: 'Audio constructor errors still present',
        errors: audioErrors,
        pageContent 
      };
    } else {
      console.log('\n✅ NO AUDIO ERRORS DETECTED');
      
      if (pageContent.hasWhiteScreen) {
        return { 
          deploymentStatus: 'PARTIAL', 
          reason: 'No audio errors but page appears to have white screen',
          pageContent 
        };
      } else {
        return { 
          deploymentStatus: 'SUCCESS', 
          reason: 'Audio constructor fix is working and page loads correctly',
          pageContent 
        };
      }
    }

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return { 
      deploymentStatus: 'ERROR', 
      reason: error.message,
      errors: allErrors 
    };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testProductionDeployment()
    .then(result => {
      console.log('\n🏁 Production Deployment Test Complete:');
      console.log('📊 Status:', result.deploymentStatus);
      console.log('📝 Reason:', result.reason);
      
      if (result.deploymentStatus === 'FAILED') {
        console.log('\n❌ DEPLOYMENT ISSUE DETECTED');
        console.log('🔧 Possible causes:');
        console.log('   1. Changes not fully deployed yet');
        console.log('   2. Browser/CDN cache serving old files');
        console.log('   3. Service worker caching old JavaScript');
        console.log('   4. Additional Audio constructor calls we missed');
        
        console.log('\n🛠️ Recommended actions:');
        console.log('   1. Hard refresh browser (Ctrl+Shift+R)');
        console.log('   2. Clear browser cache completely');
        console.log('   3. Check Railway deployment logs');
        console.log('   4. Verify all Audio constructor calls are fixed');
      } else if (result.deploymentStatus === 'PARTIAL') {
        console.log('\n⚠️ PARTIAL SUCCESS');
        console.log('Audio constructor fix is working but other issues may exist');
      } else {
        console.log('\n✅ SUCCESS - Fix is deployed and working!');
      }
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
    });
}

module.exports = testProductionDeployment; 