// Database connection config.
//
// DB_DIALECT=sqlite (default) needs zero setup — used for local development
// and for this sandboxed build, since it needs no background server process.
//
// DB_DIALECT=mysql switches to the production target named in the SRS
// (Exp-1, Section 2.5). Model definitions are identical either way; only
// this file changes.

const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'sqlite';

let sequelize;

if (dialect === 'mysql') {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'online_banking_system',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false,
      define: {
        underscored: true,
        timestamps: true,
      },
    }
  );
} else {
  const storagePath = path.resolve(
    __dirname,
    '../../',
    process.env.DB_STORAGE || './data/obs.sqlite'
  );
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  });
}

module.exports = sequelize;
