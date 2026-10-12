const express = require('express');
const { sequelize } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      database: sequelize.getDialect(),
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
