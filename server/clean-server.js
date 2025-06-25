// Routes
app.get('/api/health', async (req, res) => {
  try {
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const pendingCount = await pool.query('SELECT COUNT(*) FROM users WHERE "isEmailVerified" = false');

    res.json({ 
      status: 'ok', 
      database: 'connected',
      users: parseInt(userCount.rows[0].count),
      pendingUsers: parseInt(pendingCount.rows[0].count),
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check database error:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      timestamp: new Date().toISOString() 
    });
  }
});

// Stripe health check
app.get('/api/stripe/health', (req, res) => {
  try {
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    const secretKeyValid = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_');
    const secretKeyType = process.env.STRIPE_SECRET_KEY ? 
      (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : 
       process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'unknown') : 
      'none';

    res.json({
      stripeConfigured,
      secretKeyValid,
      secretKeyType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stripe health check error:', error);
    res.status(503).json({ 
      error: 'Stripe health check failed',
      timestamp: new Date().toISOString() 
    });
  }
});

// Stripe payment intent creation
app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount } = req.body;

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: req.user.email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.username,
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      customer: customer.id,
      setup_future_usage: 'off_session',
      metadata: {
        subscriptionTier,
        userId: req.user.id.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      subscriptionTier
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Stripe checkout session creation
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, amount, successUrl, cancelUrl } = req.body;

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: req.user.email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.username,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} Subscription`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${req.protocol}://${req.get('host')}/subscription/success`,
      cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/subscription`,
      metadata: {
        subscriptionTier,
        userId: req.user.id.toString()
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      customerId: customer.id
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// User subscription update endpoint
app.put('/api/user/subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionTier, isNewUser, stripeCustomerId, stripeSubscriptionId } = req.body;
    const userId = req.user.id;

    // Update user subscription in database
    const updateQuery = `
      UPDATE users 
      SET 
        "subscriptionTier" = $1,
        "isNewUser" = $2,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [subscriptionTier, isNewUser || false, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        subscriptionTier: updatedUser.subscriptionTier,
        isNewUser: updatedUser.isNewUser
      }
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});