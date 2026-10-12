require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { assertSchemaCurrent } = require('./utils/schemaCheck');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log(`Database connected (${sequelize.getDialect()}).`);

    // Dev-stage table sync. A production deployment would replace this
    // with versioned Sequelize migrations (see README).
    await sequelize.sync();
    await assertSchemaCurrent(sequelize);
    console.log(`All ${Object.keys(sequelize.models).length} tables ready.`);

    app.listen(PORT, () => {
      console.log(`Online Banking System API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    if (err.isSchemaError) console.error(`\n${err.message}\n`);
    else console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
