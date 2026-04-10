import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';

dotenv.config();

// Initialize Firebase Admin
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore(firebaseConfig.firestoreDatabaseId);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Initialize Admin Password if not exists
async function initAdmin() {
  try {
    const adminRef = db.collection('settings').doc('admin');
    const doc = await adminRef.get();
    if (!doc.exists) {
      await adminRef.set({
        password: 'om123',
        email: 'pandeyomg40@gmail.com'
      });
      console.log('Admin settings initialized with default password.');
    }
  } catch (error) {
    console.error('Error initializing admin settings:', error);
  }
}
initAdmin();

// OTP Storage (In-memory for simplicity)
const otps = new Map<string, { otp: string, expires: number }>();

// API Routes
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  try {
    const adminDoc = await db.collection('settings').doc('admin').get();
    const adminData = adminDoc.data();
    
    if (adminData && adminData.password === password) {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.post('/api/admin/send-otp', async (req, res) => {
  const { email } = req.body;
  if (email !== 'pandeyomg40@gmail.com') {
    return res.status(403).json({ success: false, message: 'Unauthorized email' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otps.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 }); // 10 mins

  // Send Email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Admin Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`,
    });
    res.json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email. Ensure GMAIL_USER and GMAIL_PASS are set in Settings.' });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const stored = otps.get(email);

  if (stored && stored.otp === otp && stored.expires > Date.now()) {
    try {
      await db.collection('settings').doc('admin').update({ password: newPassword });
      otps.delete(email);
      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update password' });
    }
  } else {
    res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
  }
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
