// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// 1. Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. Configure Multer (Buffer storage)
const upload = multer({ storage: multer.memoryStorage() });

// Mock Database (In production, use real DB)
let historyDb = [];

// 3. Configure email (Brevo SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'false',
  auth: {
    user: process.env.SMTP_USER, // SMTP login from Brevo
    pass: process.env.SMTP_PASS, // SMTP key from Brevo
  },
});

// Optional: verify transporter on start
transporter.verify((err) => {
  if (err) {
    console.error("SMTP transporter verification failed:", err.message);
  } else {
    console.log("SMTP server ready");
  }
});

// 4. OTP email endpoint
app.post('/api/send-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: 'DigitLens - Password Reset Code',
    text: `Your password reset code is: ${otp}. It expires in 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #2563eb;">DigitLens Password Reset</h2>
        <p>You requested a password reset. Use the code below:</p>
        <div style="
          background: #f1f5f9;
          padding: 15px;
          border-radius: 8px;
          font-size: 24px;
          font-weight: bold;
          letter-spacing: 5px;
          text-align: center;
          margin: 20px 0;
        ">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #666;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${email}. id: ${info.messageId}`);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// 5. Upload history (image + metadata → S3 + memory)
app.post('/api/history', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const { email, digit, confidence, explanation } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const fileKey = `${email}/${Date.now()}_${uuidv4()}.jpg`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    const record = {
      id: uuidv4(),
      userEmail: email,
      timestamp: Date.now(),
      imageData: imageUrl,
      digit,
      confidence,
      explanation,
    };

    historyDb.push(record);

    res.status(200).json({ message: 'Saved to AWS S3', record });
  } catch (error) {
    console.error('S3 Upload Error:', error);
    res.status(500).json({ error: 'Failed to upload to S3' });
  }
});

// 6. Get history
app.get('/api/history', (req, res) => {
  const { email } = req.query;

  const userHistory = historyDb
    .filter((record) => record.userEmail === email)
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json(userHistory);
});

// 7. Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
