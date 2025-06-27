const express = require('express');
const cors = require('cors');
const { brevoService } = require('../services/emailService');
const app = express();
const PORT = process.env.PORT || 5001;

// Stripe configuration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'connected',
    users: 'active',
    timestamp: new Date().toISOString()
  });
});

// Stripe health check
app.get('/api/stripe/health', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        stripeConfigured: false,
        error: 'STRIPE_SECRET_KEY not found'
      });
    }

    // Test Stripe connection
    await stripe.accounts.retrieve();

    res.json({
      stripeConfigured: true,
      secretKeyValid: true,
      secretKeyType: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test'
    });
  } catch (error) {
    console.error('Stripe health check failed:', error);
    res.status(500).json({
      stripeConfigured: false,
      secretKeyValid: false,
      error: error.message
    });
  }
});

// Brevo health check
app.get('/api/brevo/health', async (req, res) => {
  try {
    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({
        brevoConfigured: false,
        error: 'BREVO_API_KEY not found'
      });
    }

    res.json({
      brevoConfigured: true,
      apiKeyValid: true,
      senderEmail: 'help@merchtech.net'
    });
  } catch (error) {
    console.error('Brevo health check failed:', error);
    res.status(500).json({
      brevoConfigured: false,
      error: error.message
    });
  }
});

// Stripe Products endpoint
app.get('/api/stripe/products', async (req, res) => {
  try {
    const products = await stripe.products.list({
      active: true,
      expand: ['data.default_price']
    });

    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true
        });

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          images: product.images,
          metadata: product.metadata,
          default_price: product.default_price,
          prices: prices.data.map(price => ({
            id: price.id,
            unit_amount: price.unit_amount,
            currency: price.currency,
            type: price.type,
            recurring: price.recurring
          }))
        };
      })
    );

    res.json(productsWithPrices);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Payment Intent
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  try {
    const { subscriptionTier, amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 1500,
      currency: 'usd',
      metadata: {
        subscription_tier: subscriptionTier || 'basic'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Checkout Session
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { priceId, quantity = 1, successUrl, cancelUrl } = req.body;

    const baseUrl = `https://${req.get('host')}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: quantity
        }
      ],
      success_url: successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${baseUrl}/cancel`
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  console.log('✅ Login route reached:', req.body);

  const { email, password } = req.body;

  // Mock authentication for development
  if (email && password) {
    res.json({
      success: true,
      user: {
        id: 1,
        email: email,
        username: email.split('@')[0]
      },
      token: 'dev_jwt_token_12345'
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }
});

// Dev login for testing
app.post('/api/auth/dev-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for dev credentials
    if (email === 'djjetfuel@gmail.com' && password === 'Kerrie321') {
      const devUser = {
        id: 999,
        email: 'djjetfuel@gmail.com',
        username: 'djjetfuel',
        firstName: 'DJ',
        lastName: 'JetFuel',
        subscriptionTier: 'premium',
        isEmailVerified: true,
        isAdmin: true,
        createdAt: new Date().toISOString()
      };

      const token = jwt.sign(
        { 
          userId: devUser.id, 
          email: devUser.email,
          subscriptionTier: devUser.subscriptionTier 
        },
        process.env.JWT_SECRET || 'dev-secret-key',
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        user: devUser,
        token: token
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid dev credentials'
    });
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({
      success: false,
      error: 'Dev login failed'
    });
  }
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Mock user creation
    const user = {
      id: Math.floor(Math.random() * 1000),
      email: email,
      username: username
    };

    // Send welcome email via Brevo
    try {
      await brevoService.sendWelcomeEmail(email, username);
      console.log('Welcome email sent successfully');
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }

    res.json({
      success: true,
      user: user,
      token: 'dev_jwt_token_12345'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Email endpoints
app.post('/api/email/send-welcome', async (req, res) => {
  try {
    const { email, name } = req.body;

    const result = await brevoService.sendWelcomeEmail(email, name);

    res.json({
      success: true,
      messageId: result.messageId
    });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/email/send-verification', async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await brevoService.sendEmailVerification(email, code);

    res.json({
      success: true,
      messageId: result.messageId
    });
  } catch (error) {
    console.error('Verification email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SMS endpoints
app.post('/api/sms/send-verification', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    const result = await brevoService.sendSMSVerification(phoneNumber, code);

    res.json({
      success: true,
      messageId: result.messageId
    });
  } catch (error) {
    console.error('SMS sending error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`❌ 404: Route not found for ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ============================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 API Base URL: http://localhost:${PORT}/api`);
  console.log('🚀 ============================================');
  console.log('📧 Brevo Email Service: Configured');
  console.log('💳 Stripe Payment Service: Configured');
  console.log('🚀 ============================================');
});