// Shared paging for list endpoints. Defaults keep responses small; the
// ceiling keeps a careless pageSize from loading a whole table.
function paginate(query = {}, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function pageResult(items, total, p) {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

module.exports = { paginate, pageResult };
