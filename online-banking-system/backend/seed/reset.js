// `npm run db:reset`: wipes every table and recreates the empty schema with a
// single admin user, for a clean slate. Use `npm run seed` instead if you want
// the demo customers, accounts and sample data.
require('dotenv').config();
const { sequelize, User } = require('../src/models');
const { hash } = require('../src/utils/auth.util');

async function reset() {
  await sequelize.sync({ force: true });
  await User.create({
    username: 'admin', passwordHash: await hash('Admin@123'), role: 'admin',
    email: 'admin@obs-bank.test', phoneNumber: '9000000000',
  });
  console.log('Database reset. Only the admin user exists: admin / Admin@123.');
  console.log('Run `npm run seed` for demo customers and data.');
}

reset().then(() => process.exit(0)).catch((err) => { console.error('Reset failed:', err); process.exit(1); });
