const authService = require('../services/auth.service');
const { User, Customer } = require('../models');
const { logActivity } = require('../utils/activityLogger');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required.' });
    }
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) { next(err); }
}

async function verifyOtp(req, res, next) {
  try {
    const { username, otp } = req.body;
    if (!username || !otp) {
      return res.status(400).json({ error: 'username and otp are required.' });
    }
    const result = await authService.verifyOtp(username, otp);
    res.json(result);
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    await logActivity(req.user.id, 'Logout', 'User', req.user.id);
    res.json({
      message: 'Logged out. Discard the token on the client; per the SRS, Version 1.0 has no '
        + 'server-side token blocklist, so a JWT technically remains valid until it expires.',
    });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'role', 'email', 'phoneNumber', 'isActive'],
    });
    let profile = null;
    if (user.role === 'customer') {
      profile = await Customer.findOne({ where: { userId: user.id } });
    }
    res.json({ user, profile });
  } catch (err) { next(err); }
}

async function setMpin(req, res, next) {
  try {
    const { mpin } = req.body;
    const result = await authService.setMpin(req.user.id, mpin);
    res.json(result);
  } catch (err) { next(err); }
}

async function requestPasswordReset(req, res, next) {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required.' });
    const result = await authService.requestPasswordReset(username);
    res.json(result);
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { username, otp, newPassword } = req.body;
    const result = await authService.resetPassword(username, otp, newPassword);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { login, verifyOtp, logout, me, setMpin, requestPasswordReset, resetPassword };
