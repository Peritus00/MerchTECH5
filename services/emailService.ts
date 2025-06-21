
import axios from 'axios';

interface EmailTemplate {
  to: Array<{ email: string; name?: string }>;
  templateId: number;
  params?: Record<string, any>;
}

interface SMSData {
  sender: string;
  recipient: string;
  content: string;
}

class BrevoService {
  private apiKey: string;
  private baseURL = 'https://api.brevo.com/v3';
  
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    if (!this.apiKey) {
      console.warn('BREVO_API_KEY not found in environment variables');
    }
  }

  private getHeaders() {
    return {
      'accept': 'application/json',
      'api-key': this.apiKey,
      'content-type': 'application/json'
    };
  }

  async sendTransactionalEmail(data: EmailTemplate) {
    try {
      const response = await axios.post(
        `${this.baseURL}/smtp/email`,
        {
          ...data,
          sender: {
            email: 'noreply@samona.io',
            name: 'Samona.io'
          }
        },
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('Brevo email error:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(userEmail: string, userName: string) {
    return this.sendTransactionalEmail({
      to: [{ email: userEmail, name: userName }],
      templateId: 1, // You'll need to create this template in Brevo
      params: {
        FIRSTNAME: userName,
        EMAIL: userEmail
      }
    });
  }

  async sendEmailVerification(userEmail: string, verificationCode: string) {
    return this.sendTransactionalEmail({
      to: [{ email: userEmail }],
      templateId: 2, // You'll need to create this template in Brevo
      params: {
        VERIFICATION_CODE: verificationCode,
        EMAIL: userEmail
      }
    });
  }

  async sendPasswordReset(userEmail: string, resetToken: string) {
    return this.sendTransactionalEmail({
      to: [{ email: userEmail }],
      templateId: 3, // You'll need to create this template in Brevo
      params: {
        RESET_TOKEN: resetToken,
        EMAIL: userEmail
      }
    });
  }

  async sendSMS(data: SMSData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/transactionalSMS/sms`,
        {
          sender: 'Samona',
          recipient: data.recipient,
          content: data.content
        },
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('Brevo SMS error:', error);
      throw error;
    }
  }

  async sendSMSVerification(phoneNumber: string, verificationCode: string) {
    return this.sendSMS({
      sender: 'Samona',
      recipient: phoneNumber,
      content: `Your Samona.io verification code is: ${verificationCode}`
    });
  }
}

export const brevoService = new BrevoService();
