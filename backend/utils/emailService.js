const fetch = require('node-fetch');
require('dotenv').config();

const RESEND_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

/**
 * Sends an email using the Resend API
 * @param {string} to - The recipient's email address (for onboarding domains, must be a verified Resend address)
 * @param {string} subject - Email subject
 * @param {string} html - HTML formatted email body
 */
async function sendResendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.warn('⚠️ EMAIL_API_KEY not found in .env. Skipping email dispatch.');
    return false;
  }

  // To prevent crashing or rejecting valid domains, we perform a clean fallback
  // Note: if using the test domain (onboarding@resend.dev), Resend strictly dictates
  // that we can only send emails to the email associated with the Resend account.
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `InkVistAR Studio <${EMAIL_FROM}>`,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✉️ Email successfully dispatched to ${to}! ID: ${data.id}`);
      return true;
    } else {
      console.error(`❌ Resend API Error:`, data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Network error while sending email to ${to}:`, error.message);
    return false;
  }
}

module.exports = {
  sendResendEmail
};
