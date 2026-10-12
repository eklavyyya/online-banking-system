const { compare } = require('./auth.util');
const { logActivity } = require('./activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');

const MPIN_MAX_ATTEMPTS = parseInt(process.env.MPIN_MAX_ATTEMPTS || '3', 10);
const MPIN_LOCK_MINUTES = 10;

// Verifies an MPIN against a User record, with the same bounded-retry
// lockout discipline as login (SRS S7: MPIN as a second authorization
// factor for every fund-movement action). Shared so every module that
// needs "confirm with MPIN" (Transfer now, Bill Pay/Deposits later)
// behaves identically rather than re-implementing this per module.
async function verifyMpin(user, mpin) {
  if (!user.mpinHash) {
    throw new AppError('No MPIN has been set on this account. Set one before making a transfer.', 400);
  }
  if (user.mpinLockedUntil && user.mpinLockedUntil > new Date()) {
    const minsLeft = Math.ceil((user.mpinLockedUntil - new Date()) / 60000);
    throw new AppError(`Too many incorrect MPIN attempts. Try again in ${minsLeft} minute(s).`, 423);
  }

  const ok = await compare(mpin, user.mpinHash);
  if (!ok) {
    user.mpinFailedAttempts += 1;
    if (user.mpinFailedAttempts >= MPIN_MAX_ATTEMPTS) {
      user.mpinLockedUntil = new Date(Date.now() + MPIN_LOCK_MINUTES * 60000);
      user.mpinFailedAttempts = 0;
      await user.save();
      await logActivity(user.id, `MPIN locked after ${MPIN_MAX_ATTEMPTS} failed attempts`, 'User', user.id);
      throw new AppError(`Too many incorrect MPIN attempts. Locked for ${MPIN_LOCK_MINUTES} minutes.`, 423);
    }
    await user.save();
    throw new AppError('Incorrect MPIN.', 400);
  }

  user.mpinFailedAttempts = 0;
  await user.save();
  return true;
}

module.exports = { verifyMpin };
