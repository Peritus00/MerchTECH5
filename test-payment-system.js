
const axios = require('axios');

const API_BASE_URL = 'https://2baba274-1c74-4233-8964-1b11f1b566fa-00-205iex35lh4nb.kirk.replit.dev/api';

// Test configuration
const TEST_USER = {
  email: 'test.payment@example.com',
  password: 'TestPass123!',
  username: 'paymentTester'
};

const SUBSCRIPTION_TIERS = [
  { name: 'basic', amount: 1999 },
  { name: 'premium', amount: 4999 }
];

class PaymentSystemTester {
  constructor() {
    this.authToken = null;
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 PAYMENT SYSTEM TESTING STARTED');
    console.log('=====================================\n');

    try {
      // Step 1: Test Stripe Health Check
      await this.testStripeHealth();
      
      // Step 2: Test User Authentication
      await this.testAuthentication();
      
      // Step 3: Test Payment Intent Creation
      await this.testPaymentIntentCreation();
      
      // Step 4: Test Checkout Session Creation
      await this.testCheckoutSessionCreation();
      
      // Step 5: Test Subscription Update
      await this.testSubscriptionUpdate();
      
      // Step 6: Generate Test Report
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
    console.log('🔍 Testing User Authentication...');
    
    try {
      // First try to register (might fail if user exists)
      try {
        await axios.post(`${API_BASE_URL}/auth/register`, TEST_USER);
        console.log('   ✅ User registration successful');
      } catch (regError) {
        console.log('   ⚠️  User registration failed (might already exist)');
      }
      
      // Now login
      const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: TEST_USER.email,
        password: TEST_USER.password
      });
      
      if (loginResponse.status === 200 && loginResponse.data.token) {
        this.authToken = loginResponse.data.token;
        console.log('✅ User Authentication: PASSED');
        console.log('   - Token obtained successfully');
        
        this.testResults.push({
          test: 'User Authentication',
          status: 'PASSED',
          userId: loginResponse.data.user.id
        });
      }
    } catch (error) {
      console.log('❌ User Authentication: FAILED');
      console.log('   Error:', error.response?.data || error.message);
      
      this.testResults.push({
        test: 'User Authentication',
        status: 'FAILED',
        error: error.response?.data || error.message
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

    for (const tier of SUBSCRIPTION_TIERS) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/stripe/create-payment-intent`,
          {
            subscriptionTier: tier.name,
            amount: tier.amount
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 200 && response.data.clientSecret) {
          console.log(`   ✅ Payment Intent (${tier.name}): PASSED`);
          console.log(`      - Client Secret: ${response.data.clientSecret.substring(0, 20)}...`);
          console.log(`      - Customer ID: ${response.data.customerId}`);
        }
        
        this.testResults.push({
          test: `Payment Intent (${tier.name})`,
          status: 'PASSED',
          clientSecret: response.data.clientSecret?.substring(0, 20) + '...',
          customerId: response.data.customerId
        });
        
      } catch (error) {
        console.log(`   ❌ Payment Intent (${tier.name}): FAILED`);
        console.log('      Error:', error.response?.data || error.message);
        
        this.testResults.push({
          test: `Payment Intent (${tier.name})`,
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

    for (const tier of SUBSCRIPTION_TIERS) {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/stripe/create-checkout-session`,
          {
            subscriptionTier: tier.name,
            amount: tier.amount,
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

        if (response.status === 200 && (response.data.url || response.data.sessionId)) {
          console.log(`   ✅ Checkout Session (${tier.name}): PASSED`);
          if (response.data.url) {
            console.log(`      - Checkout URL: ${response.data.url.substring(0, 50)}...`);
          }
          console.log(`      - Session ID: ${response.data.sessionId}`);
        }
        
        this.testResults.push({
          test: `Checkout Session (${tier.name})`,
          status: 'PASSED',
          sessionId: response.data.sessionId,
          hasUrl: !!response.data.url
        });
        
      } catch (error) {
        console.log(`   ❌ Checkout Session (${tier.name}): FAILED`);
        console.log('      Error:', error.response?.data || error.message);
        
        this.testResults.push({
          test: `Checkout Session (${tier.name})`,
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }
    
    console.log('');
  }

  async testSubscriptionUpdate() {
    console.log('🔍 Testing Subscription Update...');
    
    if (!this.authToken) {
      console.log('❌ Subscription Update: SKIPPED (No auth token)');
      this.testResults.push({
        test: 'Subscription Update',
        status: 'SKIPPED',
        reason: 'No authentication token'
      });
      console.log('');
      return;
    }

    try {
      const response = await axios.put(
        `${API_BASE_URL}/user/subscription`,
        {
          subscriptionTier: 'basic',
          isNewUser: false,
          stripeCustomerId: 'cus_test_12345',
          stripeSubscriptionId: 'sub_test_12345'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200 && response.data.success) {
        console.log('   ✅ Subscription Update: PASSED');
        console.log('      - Updated user subscription successfully');
        
        this.testResults.push({
          test: 'Subscription Update',
          status: 'PASSED',
          updatedUser: response.data.user
        });
      }
      
    } catch (error) {
      console.log('   ❌ Subscription Update: FAILED');
      console.log('      Error:', error.response?.data || error.message);
      
      this.testResults.push({
        test: 'Subscription Update',
        status: 'FAILED',
        error: error.response?.data || error.message
      });
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
      console.log(`   - Re-run tests after fixes`);
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
