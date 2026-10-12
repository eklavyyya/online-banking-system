const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

async function hash(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function compare(plain, hashed) {
  if (!hashed) return false;
  return bcrypt.compare(plain, hashed);
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '1h',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// Generates a 6-digit OTP. In production this would be sent via a real
// SMS/email gateway; per the SRS (Section 2.5 / 3.3) this is simulated —
// it is written to the Notifications table and also returned in the API
// response so the app is usable end-to-end without a live gateway.
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { hash, compare, signToken, verifyToken, generateOtp };
