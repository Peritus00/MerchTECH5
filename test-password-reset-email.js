const nodemailer = require('nodemailer');
require('dotenv').config();

async function testPasswordResetEmail() {
  console.log('🧪 Testing Password Reset Email Configuration\n');
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`BREVO_SMTP_KEY: ${process.env.BREVO_SMTP_KEY ? '✅ Configured (' + process.env.BREVO_SMTP_KEY.substring(0, 10) + '...)' : '❌ Not configured'}`);
  console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL || '❌ Not configured (will use default)'}`);
  console.log(`EXPO_PUBLIC_FRONTEND_URL: ${process.env.EXPO_PUBLIC_FRONTEND_URL || '❌ Not configured'}`);
  
  if (!process.env.BREVO_SMTP_KEY) {
    console.log('\n❌ BREVO_SMTP_KEY not found in environment variables');
    console.log('Please add it to your Railway environment variables');
    return;
  }
  
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: '8e773a002@smtp-brevo.com',
      pass: process.env.BREVO_SMTP_KEY
    }
  });
  
  // Test connection
  console.log('\n🔍 Testing SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful');
  } catch (error) {
    console.log('❌ SMTP connection failed:', error.message);
    console.log('Error details:', error);
    return;
  }
  
  // Test password reset email
  console.log('\n📧 Testing password reset email...');
  const testEmail = 'perrie.benton@gmail.com';
  const frontendUrl = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://www.merchtrader.org';
  const resetToken = 'test-token-' + Date.now();
  const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;
  
  try {
    const mailOptions = {
      from: '"MerchTrader QR" <help@merchtrader.org>',
      to: testEmail,
      subject: 'Reset Your MerchTech Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password for your MerchTrader account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Password reset email sent successfully!');
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response: ${info.response}`);
    console.log(`\n📬 Check ${testEmail} for the password reset email`);
    console.log(`Reset URL: ${resetUrl}`);
    
  } catch (error) {
    console.log('❌ Email sending failed:', error.message);
    console.log('Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
    });
  }
}

testPasswordResetEmail().catch(console.error);

