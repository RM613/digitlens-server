// test-smtp.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  logger: true,
  debug: true,
  tls: { rejectUnauthorized: false },
});

console.log('Using SMTP host:', process.env.SMTP_HOST);
console.log('Using SMTP user:', process.env.EMAIL_USER && process.env.EMAIL_USER.replace(/.(?=.{2})/g, '*'));

transporter.verify((err, success) => {
  if (err) {
    console.error('verify error:', err);
    process.exit(1);
  } else {
    console.log('SMTP verified ok');
    process.exit(0);
  }
});
