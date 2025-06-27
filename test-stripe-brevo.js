
const axios = require('axios');

const API_BASE_URL = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api';

class StripeBrevoTester {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 STRIPE & BREVO INTEGRATION TESTING');
    console.log('=====================================\n');

    try {
      await this.testServerHealth();
      await this.testStripeIntegration();
      await this.testBrevoIntegration();
      await this.testStripeProducts();
      await this.testPaymentFlow();
      await this.testEmailFlow();
      this.generateReport();
    } catch (error) {
      console.error('🔴 TESTING FAILED:', error.message);
    }
  }

  async testServerHealth() {
    console.log('🔍 Testing Server Health...');
    try {
      const response = await axios.get(`${API_BASE_URL}/health`);
      console.log('✅ Server Health: PASSED');
      console.log(`   Status: ${response.data.status}`);
      this.testResults.push({ test: 'Server Health', status: 'PASSED' });
    } catch (error) {
      console.log('❌ Server Health: FAILED');
      console.log(`   Error: ${error.message}`);
      this.testResults.push({ test: 'Server Health', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  async testStripeIntegration() {
    console.log('🔍 Testing Stripe Integration...');
    try {
      const response = await axios.get(`${API_BASE_URL}/stripe/health`);
      
      if (response.data.stripeConfigured) {
        console.log('✅ Stripe Integration: PASSED');
        console.log(`   Key Type: ${response.data.secretKeyType}`);
        console.log(`   Valid: ${response.data.secretKeyValid}`);
        this.testResults.push({ test: 'Stripe Integration', status: 'PASSED' });
      } else {
        throw new Error('Stripe not configured');
      }
    } catch (error) {
      console.log('❌ Stripe Integration: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({ test: 'Stripe Integration', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  async testBrevoIntegration() {
    console.log('🔍 Testing Brevo Integration...');
    try {
      const response = await axios.get(`${API_BASE_URL}/brevo/health`);
      
      if (response.data.brevoConfigured) {
        console.log('✅ Brevo Integration: PASSED');
        console.log(`   API Key Valid: ${response.data.apiKeyValid}`);
        console.log(`   Sender Email: ${response.data.senderEmail}`);
        this.testResults.push({ test: 'Brevo Integration', status: 'PASSED' });
      } else {
        throw new Error('Brevo not configured');
      }
    } catch (error) {
      console.log('❌ Brevo Integration: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({ test: 'Brevo Integration', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  async testStripeProducts() {
    console.log('🔍 Testing Stripe Products...');
    try {
      const response = await axios.get(`${API_BASE_URL}/stripe/products`);
      const products = response.data;
      
      console.log('✅ Stripe Products: PASSED');
      console.log(`   Products Found: ${products.length}`);
      
      if (products.length > 0) {
        console.log('   Sample Products:');
        products.slice(0, 3).forEach((product, index) => {
          console.log(`     ${index + 1}. ${product.name} (${product.id})`);
        });
      }
      
      this.testResults.push({ test: 'Stripe Products', status: 'PASSED', count: products.length });
    } catch (error) {
      console.log('❌ Stripe Products: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({ test: 'Stripe Products', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  async testPaymentFlow() {
    console.log('🔍 Testing Payment Intent Creation...');
    try {
      const response = await axios.post(`${API_BASE_URL}/stripe/create-payment-intent`, {
        subscriptionTier: 'basic',
        amount: 1500
      });
      
      if (response.data.clientSecret) {
        console.log('✅ Payment Intent: PASSED');
        console.log(`   Client Secret: ${response.data.clientSecret.substring(0, 20)}...`);
        this.testResults.push({ test: 'Payment Intent', status: 'PASSED' });
      } else {
        throw new Error('No client secret returned');
      }
    } catch (error) {
      console.log('❌ Payment Intent: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({ test: 'Payment Intent', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  async testEmailFlow() {
    console.log('🔍 Testing Email Sending...');
    try {
      const response = await axios.post(`${API_BASE_URL}/email/send-welcome`, {
        email: 'test@example.com',
        name: 'Test User'
      });
      
      if (response.data.success) {
        console.log('✅ Email Sending: PASSED');
        console.log(`   Message ID: ${response.data.messageId}`);
        this.testResults.push({ test: 'Email Sending', status: 'PASSED' });
      } else {
        throw new Error('Email sending failed');
      }
    } catch (error) {
      console.log('❌ Email Sending: FAILED');
      console.log(`   Error: ${error.response?.data?.error || error.message}`);
      this.testResults.push({ test: 'Email Sending', status: 'FAILED', error: error.message });
    }
    console.log('');
  }

  generateReport() {
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('========================\n');
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    
    console.log(`✅ Tests Passed: ${passed}`);
    console.log(`❌ Tests Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / this.testResults.length) * 100).toFixed(1)}%\n`);
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Your Stripe and Brevo integration is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please check your configuration.');
    }
  }
}

// Run the tests
const tester = new StripeBrevoTester();
tester.runAllTests().catch(console.error);
