const { User, Customer, Notification } = require('../models');
const { hash, compare, signToken, generateOtp } = require('../utils/auth.util');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');

const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
const LOGIN_LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);
const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.MPIN_MAX_ATTEMPTS || '3', 10);

async function clearOtp(user) {
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpPurpose = null;
  user.otpAttempts = 0;
  await user.save();
}

async function issueOtp(user, purpose) {
  const otp = generateOtp();
  user.otpHash = await hash(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
  user.otpPurpose = purpose;
  user.otpAttempts = 0;
  await user.save();

  // Simulated delivery (SRS 2.5 / 3.3): recorded as a Notification for
  // customers (who have a Customer profile to attach it to) and always
  // written to the activity log; also returned in the API response since
  // there is no live SMS/email gateway in Version 1.0.
  if (user.role === 'customer') {
    const customer = await Customer.findOne({ where: { userId: user.id } });
    if (customer) {
      const label = purpose === 'login' ? 'login' : purpose.replace('_', ' ');
      await Notification.create({
        customerId: customer.id,
        message: `Your OTP for ${label} is ${otp}. It expires in ${Math.round(OTP_EXPIRY_SECONDS / 60)} minute(s). Do not share this code.`,
        category: 'Security',
      });
    }
  }
  await logActivity(user.id, `OTP generated for ${purpose}`, 'User', user.id);
  return otp;
}

// ---------------- Login (step 1): credentials -> OTP ----------------
async function login(username, password) {
  const user = await User.findOne({ where: { username } });
  if (!user) throw new AppError('Invalid username or password.', 401);
  if (!user.isActive) throw new AppError('This account has been deactivated. Contact your bank.', 403);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minsLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
    throw new AppError(`Account is locked due to too many failed attempts. Try again in ${minsLeft} minute(s).`, 423);
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= LOGIN_MAX_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000);
      user.failedLoginAttempts = 0;
      await user.save();
      await logActivity(user.id, `Account locked after ${LOGIN_MAX_ATTEMPTS} failed login attempts`, 'User', user.id);
      throw new AppError(`Too many failed attempts. Account locked for ${LOGIN_LOCK_MINUTES} minutes.`, 423);
    }
    await user.save();
    throw new AppError('Invalid username or password.', 401);
  }

  user.failedLoginAttempts = 0;
  await user.save();
  const otp = await issueOtp(user, 'login');

  return {
    message: 'Password verified. OTP sent to your registered mobile/email.',
    devOtp: otp,
    otpExpiresInSeconds: OTP_EXPIRY_SECONDS,
  };
}

// ---------------- Login (step 2): OTP -> JWT ----------------
async function verifyOtp(username, otp) {
  const user = await User.findOne({ where: { username } });
  if (!user) throw new AppError('Invalid request.', 401);

  if (!user.otpHash || !user.otpExpiresAt || user.otpPurpose !== 'login') {
    throw new AppError('No OTP was requested for this account. Please log in again.', 400);
  }
  if (user.otpExpiresAt < new Date()) {
    await clearOtp(user);
    throw new AppError('OTP has expired. Please log in again to request a new one.', 400);
  }

  const otpOk = await compare(otp, user.otpHash);
  if (!otpOk) {
    user.otpAttempts += 1;
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await clearOtp(user);
      throw new AppError('Too many incorrect OTP attempts. Please log in again.', 400);
    }
    await user.save();
    throw new AppError('Incorrect OTP.', 400);
  }

  await clearOtp(user);
  user.previousLoginAt = user.lastLoginAt;
  user.lastLoginAt = new Date();
  await user.save();
  await logActivity(user.id, 'Successful login (OTP verified)', 'User', user.id);

  const token = signToken({ userId: user.id, role: user.role });
  return { token, user: { id: user.id, username: user.username, role: user.role, email: user.email, previousLoginAt: user.previousLoginAt } };
}

// ---------------- Set/update MPIN (SRS F7) ----------------
async function setMpin(userId, mpin) {
  if (!/^\d{4,6}$/.test(String(mpin || ''))) {
    throw new AppError('MPIN must be 4-6 digits.', 400);
  }
  const user = await User.findByPk(userId);
  if (!user || user.role !== 'customer') {
    throw new AppError('Only customers can set an MPIN.', 403);
  }
  user.mpinHash = await hash(mpin);
  await user.save();
  await logActivity(user.id, 'MPIN set/updated', 'User', user.id);
  return { message: 'MPIN updated successfully.' };
}

// ---------------- Forgot / reset password (SRS F8) ----------------
async function requestPasswordReset(username) {
  const user = await User.findOne({ where: { username } });
  if (!user) {
    // Do not reveal whether the username exists.
    return { message: 'If that account exists, an OTP has been sent.' };
  }
  const otp = await issueOtp(user, 'password_reset');
  return { message: 'If that account exists, an OTP has been sent.', devOtp: otp };
}

async function resetPassword(username, otp, newPassword) {
  const user = await User.findOne({ where: { username } });
  if (!user || !user.otpHash || user.otpPurpose !== 'password_reset') {
    throw new AppError('Invalid or expired reset request.', 400);
  }
  if (user.otpExpiresAt < new Date()) {
    await clearOtp(user);
    throw new AppError('OTP has expired. Please request a new one.', 400);
  }
  const otpOk = await compare(otp, user.otpHash);
  if (!otpOk) {
    user.otpAttempts += 1;
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await clearOtp(user);
      throw new AppError('Too many incorrect attempts. Please request a new OTP.', 400);
    }
    await user.save();
    throw new AppError('Incorrect OTP.', 400);
  }
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters.', 400);
  }
  user.passwordHash = await hash(newPassword);
  await clearOtp(user);
  await logActivity(user.id, 'Password reset via OTP verification', 'User', user.id);
  return { message: 'Password reset successful. Please log in with your new password.' };
}

module.exports = { login, verifyOtp, setMpin, requestPasswordReset, resetPassword };
