const nodemailer = require('nodemailer');
require('dotenv').config();

async function testBrevoEmail() {
  console.log('🧪 Testing Brevo Email Configuration\n');
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`BREVO_SMTP_KEY: ${process.env.BREVO_SMTP_KEY ? '✅ Configured' : '❌ Not configured'}`);
  
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
    return;
  }
  
  // Test email sending
  console.log('\n📧 Testing email sending...');
  try {
    const info = await transporter.sendMail({
      from: 'noreply@merchtech.net',
      to: 'djjetfuel@gmail.com',
      subject: 'MerchTech - Email Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">MerchTech Email Test</h2>
          <p>This is a test email to verify Brevo email configuration.</p>
          <p>If you receive this email, your Brevo setup is working correctly!</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            Sent from MerchTech backend at ${new Date().toISOString()}
          </p>
        </div>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log(`Message ID: ${info.messageId}`);
    console.log('\n📬 Check your email (djjetfuel@gmail.com) for the test message');
    
  } catch (error) {
    console.log('❌ Email sending failed:', error.message);
  }
}

testBrevoEmail().catch(console.error); 