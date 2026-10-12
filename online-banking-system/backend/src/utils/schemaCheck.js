// Phase 2 added columns to existing tables. sequelize.sync() creates missing
// tables but never alters existing ones, so a database created by Phase 1
// would fail later with confusing "no such column" errors. This check turns
// that into one clear message at start-up.
async function findSchemaProblems(sequelize) {
  const qi = sequelize.getQueryInterface();
  const problems = [];
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    let columns;
    try {
      columns = await qi.describeTable(table);
    } catch (err) {
      problems.push(`${table} (table missing)`);
      continue;
    }
    for (const attr of Object.values(model.rawAttributes)) {
      if (attr.type && attr.type.key === 'VIRTUAL') continue;
      const field = attr.field || attr.fieldName;
      if (!(field in columns)) problems.push(`${table}.${field}`);
    }
  }
  return problems;
}

async function assertSchemaCurrent(sequelize) {
  const problems = await findSchemaProblems(sequelize);
  if (problems.length) {
    const sample = problems.slice(0, 6).join(', ');
    const err = new Error(
      'The database was created by an older version of the application and is missing: '
      + `${sample}${problems.length > 6 ? ', ...' : ''}.\n`
      + 'Run `npm run seed` to rebuild it with the current schema and demo data (this erases existing data).'
    );
    err.isSchemaError = true;
    throw err;
  }
}

module.exports = { findSchemaProblems, assertSchemaCurrent };
