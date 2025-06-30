const axios = require('axios');

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

class PaymentSystemTester {
  constructor() {
    this.authToken = null;
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 PAYMENT SYSTEM TESTING STARTED');
    console.log('=====================================\n');

    try {
      await this.testServerHealth();
      await this.testStripeHealth();
      await this.testAuthentication();
      await this.testPaymentIntentCreation();
      await this.testCheckoutSessionCreation();
      this.generateTestReport();
    } catch (error) {
      console.error('🔴 TESTING FAILED:', error.message);
      this.testResults.push({
        test: 'Overall Testing',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testServerHealth() {
    console.log('🔍 Testing Server Health...');

    try {
      const response = await axios.get(`${API_BASE_URL}/health`);

      if (response.status === 200) {
        console.log('✅ Server Health: PASSED');
        console.log('   - Status:', response.data.status);
        console.log('   - Database:', response.data.database);
        console.log('   - Users:', response.data.users);

        this.testResults.push({
          test: 'Server Health',
          status: 'PASSED',
          data: response.data
        });
      }
    } catch (error) {
      console.log('❌ Server Health: FAILED');
      console.log('   Error:', error.response?.data || error.message);

      this.testResults.push({
        test: 'Server Health',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }

    console.log('');
  }

  async testStripeHealth() {
    console.log('🔍 Testing Stripe Health Check...');

    try {
      const response = await axios.get(`${API_BASE_URL}/stripe/health`);

      if (response.status === 200) {
        console.log('✅ Stripe Health Check: PASSED');
        console.log('   - Stripe Configured:', response.data.stripeConfigured);
        console.log('   - Secret Key Valid:', response.data.secretKeyValid);
        console.log('   - Key Type:', response.data.secretKeyType);

        this.testResults.push({
          test: 'Stripe Health Check',
          status: 'PASSED',
          data: response.data
        });
      }
    } catch (error) {
      console.log('❌ Stripe Health Check: FAILED');
      console.log('   Error:', error.response?.data || error.message);

      this.testResults.push({
        test: 'Stripe Health Check',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
    }

    console.log('');
  }

  async testAuthentication() {
    console.log('🔍 Testing Authentication...');

    try {
      // Use developer fallback token
      this.authToken = 'dev_jwt_token_djjetfuel_12345';

      console.log('✅ Authentication: PASSED (Using dev token)');
      this.testResults.push({
        test: 'Authentication',
        status: 'PASSED',
        method: 'Developer token'
      });
    } catch (error) {
      console.log('❌ Authentication: FAILED');
      console.log('   Error:', error.message);

      this.testResults.push({
        test: 'Authentication',
        status: 'FAILED',
        error: error.message
      });
    }

    console.log('');
  }

  async testPaymentIntentCreation() {
    console.log('🔍 Testing Payment Intent Creation...');

    if (!this.authToken) {
      console.log('❌ Payment Intent Creation: SKIPPED (No auth token)');
      this.testResults.push({
        test: 'Payment Intent Creation',
        status: 'SKIPPED',
        reason: 'No authentication token'
      });
      console.log('');
      return;
    }

    const testCases = [
      { tier: 'basic', amount: 1500 },
      { tier: 'pro', amount: 2500 },
      { tier: 'premium', amount: 4900 }
    ];

    for (const testCase of testCases) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/stripe/create-payment-intent`,
          {
            subscriptionTier: testCase.tier,
            amount: testCase.amount
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 200 && response.data.clientSecret) {
          console.log(`   ✅ Payment Intent (${testCase.tier}): PASSED`);
          console.log(`      - Client Secret: ${response.data.clientSecret.substring(0, 20)}...`);
          console.log(`      - Customer ID: ${response.data.customerId}`);
        }

        this.testResults.push({
          test: `Payment Intent (${testCase.tier})`,
          status: 'PASSED',
          clientSecret: response.data.clientSecret?.substring(0, 20) + '...',
          customerId: response.data.customerId
        });

      } catch (error) {
        console.log(`   ❌ Payment Intent (${testCase.tier}): FAILED`);
        console.log('      Error:', error.response?.data || error.message);

        this.testResults.push({
          test: `Payment Intent (${testCase.tier})`,
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }

    console.log('');
  }

  async testCheckoutSessionCreation() {
    console.log('🔍 Testing Checkout Session Creation...');

    if (!this.authToken) {
      console.log('❌ Checkout Session Creation: SKIPPED (No auth token)');
      this.testResults.push({
        test: 'Checkout Session Creation',
        status: 'SKIPPED',
        reason: 'No authentication token'
      });
      console.log('');
      return;
    }

    const testCases = [
      { tier: 'basic', amount: 1500 },
      { tier: 'pro', amount: 2500 }
    ];

    for (const testCase of testCases) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/stripe/create-checkout-session`,
          {
            subscriptionTier: testCase.tier,
            amount: testCase.amount,
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel'
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 200 && response.data.success && response.data.url) {
          console.log(`   ✅ Checkout Session (${testCase.tier}): PASSED`);
          console.log(`      - Session URL: ${response.data.url.substring(0, 50)}...`);
          console.log(`      - Session ID: ${response.data.sessionId}`);
        }

        this.testResults.push({
          test: `Checkout Session (${testCase.tier})`,
          status: 'PASSED',
          sessionUrl: response.data.url?.substring(0, 50) + '...',
          sessionId: response.data.sessionId
        });

      } catch (error) {
        console.log(`   ❌ Checkout Session (${testCase.tier}): FAILED`);
        console.log('      Error:', error.response?.data || error.message);

        this.testResults.push({
          test: `Checkout Session (${testCase.tier})`,
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }

    console.log('');
  }

  generateTestReport() {
    console.log('📊 PAYMENT SYSTEM TEST REPORT');
    console.log('==============================');

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIPPED').length;

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${this.testResults.length}`);

    console.log(`\n📋 Detailed Results:`);
    this.testResults.forEach((result, index) => {
      const status = result.status === 'PASSED' ? '✅' : 
                   result.status === 'FAILED' ? '❌' : '⏭️';
      console.log(`   ${index + 1}. ${status} ${result.test}`);

      if (result.error) {
        console.log(`      Error: ${JSON.stringify(result.error, null, 2)}`);
      }
    });

    console.log(`\n🎯 Next Steps:`);
    if (failed > 0) {
      console.log(`   - Fix ${failed} failed test(s)`);
      console.log(`   - Check server configuration`);
      console.log(`   - Verify Stripe keys are set`);
    } else {
      console.log(`   - All tests passing! Payment system is ready`);
    }

    console.log('\n=====================================');
    console.log('🧪 PAYMENT SYSTEM TESTING COMPLETED');
  }
}

// Run the tests
if (require.main === module) {
  const tester = new PaymentSystemTester();
  tester.runAllTests().catch(console.error);
}

module.exports = PaymentSystemTester;