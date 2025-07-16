const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Comprehensive Production Audio Constructor Error Test
 * 
 * This test simulates the exact conditions that cause the 
 * "Uncaught TypeError: A.Audio is not a constructor" error
 * in production builds by testing various scenarios.
 */

const PRODUCTION_URL = 'https://app.merchtech.net';
const TEST_SLIDESHOW_ID = '31'; // Replace with actual slideshow ID
const TEST_PLAYLIST_ID = '1';   // Replace with actual playlist ID

class AudioConstructorErrorTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.errors = [];
    this.testResults = [];
  }

  async initialize() {
    console.log('🚀 Initializing Production Audio Constructor Test...');
    
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for CI/CD
      devtools: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Enable console logging
    this.page.on('console', msg => {
      console.log(`📄 PAGE LOG: ${msg.text()}`);
    });

    // Capture JavaScript errors
    this.page.on('pageerror', error => {
      console.error(`❌ PAGE ERROR: ${error.message}`);
      this.errors.push({
        type: 'pageerror',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Capture console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`❌ CONSOLE ERROR: ${msg.text()}`);
        this.errors.push({
          type: 'console',
          message: msg.text(),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Set viewport for consistent testing
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async testScenario(name, testFunction) {
    console.log(`\n🧪 Testing: ${name}`);
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
      this.testResults.push({
        name,
        status: 'PASSED',
        duration,
        errors: []
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${name} - FAILED (${duration}ms):`, error.message);
      this.testResults.push({
        name,
        status: 'FAILED',
        duration,
        errors: [error.message]
      });
    }
  }

  async testSlideshowAudioConstructor() {
    await this.testScenario('Slideshow Audio Constructor', async () => {
      // Navigate to slideshow page
      await this.page.goto(`${PRODUCTION_URL}/slideshow-access/${TEST_SLIDESHOW_ID}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for slideshow to load
      await this.page.waitForSelector('[data-testid="slideshow-container"]', { timeout: 10000 });

      // Check for Audio constructor usage
      const audioConstructorErrors = await this.page.evaluate(() => {
        const errors = [];
        
        // Try to trigger audio initialization
        try {
          // Simulate clicking play button
          const playButton = document.querySelector('[data-testid="play-button"]');
          if (playButton) {
            playButton.click();
          }
        } catch (e) {
          errors.push(`Play button error: ${e.message}`);
        }

        // Check for Audio constructor in global scope
        try {
          if (typeof Audio === 'undefined') {
            errors.push('Audio constructor is undefined');
          }
        } catch (e) {
          errors.push(`Audio check error: ${e.message}`);
        }

        return errors;
      });

      if (audioConstructorErrors.length > 0) {
        throw new Error(`Audio constructor issues: ${audioConstructorErrors.join(', ')}`);
      }

      // Wait for potential audio initialization
      await this.page.waitForTimeout(3000);
    });
  }

  async testPlaylistAudioConstructor() {
    await this.testScenario('Playlist Audio Constructor', async () => {
      // Navigate to playlist page
      await this.page.goto(`${PRODUCTION_URL}/playlist-access/${TEST_PLAYLIST_ID}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for playlist to load
      await this.page.waitForSelector('[data-testid="playlist-container"]', { timeout: 10000 });

      // Trigger audio playback
      const audioErrors = await this.page.evaluate(() => {
        const errors = [];
        
        try {
          // Find and click play button
          const playButton = document.querySelector('[data-testid="play-button"]') || 
                           document.querySelector('button[aria-label*="play"]') ||
                           document.querySelector('.play-button');
          
          if (playButton) {
            playButton.click();
          } else {
            errors.push('Play button not found');
          }
        } catch (e) {
          errors.push(`Playlist play error: ${e.message}`);
        }

        return errors;
      });

      if (audioErrors.length > 0) {
        throw new Error(`Playlist audio errors: ${audioErrors.join(', ')}`);
      }

      await this.page.waitForTimeout(3000);
    });
  }

  async testPreviewPlayerAudioConstructor() {
    await this.testScenario('Preview Player Audio Constructor', async () => {
      // Navigate to media player page
      await this.page.goto(`${PRODUCTION_URL}/media-player/${TEST_PLAYLIST_ID}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for preview player to load
      await this.page.waitForSelector('[data-testid="preview-player"]', { timeout: 10000 });

      // Test audio initialization in preview player
      const previewErrors = await this.page.evaluate(() => {
        const errors = [];
        
        try {
          // Trigger preview playback
          const previewButton = document.querySelector('[data-testid="preview-play-button"]') ||
                               document.querySelector('.preview-play-button');
          
          if (previewButton) {
            previewButton.click();
          }
        } catch (e) {
          errors.push(`Preview player error: ${e.message}`);
        }

        return errors;
      });

      if (previewErrors.length > 0) {
        throw new Error(`Preview player errors: ${previewErrors.join(', ')}`);
      }

      await this.page.waitForTimeout(3000);
    });
  }

  async testInlineMediaPlayerAudioConstructor() {
    await this.testScenario('Inline Media Player Audio Constructor', async () => {
      // Navigate to a page with inline media player
      await this.page.goto(`${PRODUCTION_URL}/`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Look for inline media players
      const inlineErrors = await this.page.evaluate(() => {
        const errors = [];
        
        try {
          // Find inline media players
          const inlinePlayers = document.querySelectorAll('[data-testid="inline-media-player"]');
          
          inlinePlayers.forEach((player, index) => {
            try {
              const playButton = player.querySelector('button');
              if (playButton) {
                playButton.click();
              }
            } catch (e) {
              errors.push(`Inline player ${index} error: ${e.message}`);
            }
          });
        } catch (e) {
          errors.push(`Inline media player error: ${e.message}`);
        }

        return errors;
      });

      if (inlineErrors.length > 0) {
        throw new Error(`Inline media player errors: ${inlineErrors.join(', ')}`);
      }

      await this.page.waitForTimeout(3000);
    });
  }

  async testBrowserCompatibility() {
    await this.testScenario('Browser Compatibility', async () => {
      const compatibilityResults = await this.page.evaluate(() => {
        const results = {
          audioSupported: typeof Audio !== 'undefined',
          webAudioSupported: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined',
          userAgent: navigator.userAgent,
          audioConstructorType: typeof Audio,
          windowAudioAccess: typeof window['Audio'] !== 'undefined'
        };

        return results;
      });

      console.log('🔍 Browser Compatibility Results:', compatibilityResults);

      if (!compatibilityResults.audioSupported) {
        throw new Error('Audio constructor not supported in this browser');
      }

      if (!compatibilityResults.windowAudioAccess) {
        throw new Error('window["Audio"] access not available');
      }
    });
  }

  async testProductionBuildSpecific() {
    await this.testScenario('Production Build Specific Issues', async () => {
      // Test for minified code issues
      const buildIssues = await this.page.evaluate(() => {
        const issues = [];
        
        // Check for common minification issues
        try {
          // Test if Audio constructor is properly accessible
          const AudioConstructor = window['Audio'];
          if (typeof AudioConstructor !== 'function') {
            issues.push('Audio constructor not accessible via window["Audio"]');
          }
          
          // Test actual audio creation
          const testAudio = new AudioConstructor();
          if (!(testAudio instanceof Audio)) {
            issues.push('Audio constructor does not create Audio instance');
          }
          
        } catch (e) {
          issues.push(`Production build issue: ${e.message}`);
        }

        return issues;
      });

      if (buildIssues.length > 0) {
        throw new Error(`Production build issues: ${buildIssues.join(', ')}`);
      }
    });
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      testResults: this.testResults,
      errors: this.errors,
      summary: {
        totalTests: this.testResults.length,
        passed: this.testResults.filter(r => r.status === 'PASSED').length,
        failed: this.testResults.filter(r => r.status === 'FAILED').length,
        totalErrors: this.errors.length
      }
    };

    // Save report to file
    const reportPath = path.join(__dirname, 'production-audio-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Test Report Generated:', reportPath);
    console.log('📈 Summary:', report.summary);

    return report;
  }

  async runAllTests() {
    try {
      await this.initialize();

      // Run all test scenarios
      await this.testBrowserCompatibility();
      await this.testProductionBuildSpecific();
      await this.testSlideshowAudioConstructor();
      await this.testPlaylistAudioConstructor();
      await this.testPreviewPlayerAudioConstructor();
      await this.testInlineMediaPlayerAudioConstructor();

      // Generate report
      const report = await this.generateReport();

      return report;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Run the test if called directly
if (require.main === module) {
  const test = new AudioConstructorErrorTest();
  test.runAllTests()
    .then(report => {
      console.log('\n🎉 All tests completed!');
      if (report.summary.failed > 0) {
        console.error('❌ Some tests failed. Check the report for details.');
        process.exit(1);
      } else {
        console.log('✅ All tests passed!');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = AudioConstructorErrorTest; 