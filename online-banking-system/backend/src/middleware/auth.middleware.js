const { verifyToken } = require('../utils/auth.util');
const { User } = require('../models');

// Verifies the JWT bearer token and attaches req.user = { id, role }.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    }
    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

// Restricts a route to a specific role (SRS S2 - role-based access control).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
