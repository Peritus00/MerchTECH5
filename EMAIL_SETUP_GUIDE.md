# Email Setup Guide for MerchTech

## Current Status
The password reset functionality is now implemented but needs email credentials to actually send emails.

## Option 1: Gmail Setup (Recommended)

### 1. Enable 2-Factor Authentication
- Go to your Google Account settings
- Enable 2-Factor Authentication

### 2. Generate App Password
- Go to Google Account → Security → App passwords
- Generate a new app password for "Mail"
- Use this password instead of your regular Gmail password

### 3. Add Environment Variables
Add these to your Railway environment variables:

```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## Option 2: Other SMTP Providers

You can use any SMTP provider. Update the `createTransporter()` function in `services/Server/main.js`:

```javascript
// For Outlook/Hotmail
return nodemailer.createTransporter({
  service: 'outlook',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// For custom SMTP
return nodemailer.createTransporter({
  host: 'smtp.yourprovider.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

## Option 3: Email Services

### SendGrid
```javascript
return nodemailer.createTransporter({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY
  }
});
```

### Mailgun
```javascript
return nodemailer.createTransporter({
  host: 'smtp.mailgun.org',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAILGUN_USER,
    pass: process.env.MAILGUN_PASS
  }
});
```

## Testing

Until email is configured, the system will:
1. Generate a reset token
2. Store it in the database
3. Return the token in the response (for testing)
4. Log that email sending failed

## Security Notes

- Never commit email credentials to git
- Use app passwords, not regular passwords
- Consider using environment-specific email providers
- Monitor email sending logs for security 