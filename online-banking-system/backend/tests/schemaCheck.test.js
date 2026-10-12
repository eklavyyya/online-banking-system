const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown } = require('./helpers');
const { findSchemaProblems, assertSchemaCurrent } = require('../src/utils/schemaCheck');

test.before(async () => { await setup(); });
test.after(teardown);

test('a freshly seeded database is current', async () => {
  assert.deepEqual(await findSchemaProblems(models.sequelize), []);
  await assertSchemaCurrent(models.sequelize); // does not throw
});

test('a database from an older version gives one clear, actionable message', async () => {
  // simulate a Phase 1 database: columns that Phase 2 added are missing
  await models.sequelize.query('ALTER TABLE cards DROP COLUMN atm_limit');
  await models.sequelize.query('ALTER TABLE users DROP COLUMN previous_login_at');
  const problems = await findSchemaProblems(models.sequelize);
  assert.ok(problems.includes('cards.atm_limit'));
  assert.ok(problems.includes('users.previous_login_at'));

  await assert.rejects(() => assertSchemaCurrent(models.sequelize), (err) => {
    assert.equal(err.isSchemaError, true);
    assert.match(err.message, /older version/);
    assert.match(err.message, /cards\.atm_limit/);
    assert.match(err.message, /npm run seed/);
    return true;
  });
});

test('a missing table is reported too', async () => {
  await models.sequelize.query('DROP TABLE review_flags');
  const problems = await findSchemaProblems(models.sequelize);
  assert.ok(problems.some((p) => p.startsWith('review_flags') && p.includes('table missing')));
});
