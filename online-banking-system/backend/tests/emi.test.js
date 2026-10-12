const test = require('node:test');
const assert = require('node:assert/strict');
const { computeEmi, buildSchedule, summarise, addMonths, isoDate } = require('../src/utils/emi');
const { interestRateFor, computeMaturity, computeRdMaturity } = require('../src/services/deposit.service');
const { maskAccountNumber } = require('../src/utils/mask');
const { paginate } = require('../src/utils/pagination');

test('EMI matches the standard reducing-balance formula', () => {
  assert.equal(computeEmi(100000, 12, 12), 8884.88);
  assert.equal(computeEmi(500000, 9, 48), 12442.52);
});

test('EMI with a zero rate is principal divided by tenure', () => {
  assert.equal(computeEmi(12000, 0, 12), 1000);
});

test('EMI returns 0 for invalid input rather than NaN', () => {
  assert.equal(computeEmi(0, 10, 12), 0);
  assert.equal(computeEmi(1000, 10, 0), 0);
});

test('amortisation schedule closes at exactly zero and sums correctly', () => {
  const s = buildSchedule(250000, 11.5, 24, new Date('2026-01-15'));
  assert.equal(s.length, 24);
  assert.equal(s[23].balanceAfter, 0);
  const principalSum = s.reduce((a, r) => a + r.principalComponent, 0);
  assert.ok(Math.abs(principalSum - 250000) < 0.05, `principal components sum to ${principalSum}`);
  for (const row of s) assert.ok(Math.abs(row.emi - (row.principalComponent + row.interestComponent)) < 0.011);
  assert.equal(s[0].dueDate, '2026-02-15');
  assert.equal(s[23].dueDate, '2028-01-15');
});

test('summary reports total payable and interest', () => {
  const sm = summarise(100000, 12, 12);
  assert.equal(sm.emi, 8884.88);
  assert.ok(Math.abs(sm.totalPayable - 106618.56) < 0.2);
  assert.ok(Math.abs(sm.totalInterest - 6618.56) < 0.2);
});

test('addMonths clamps to the last day of shorter months', () => {
  assert.equal(isoDate(addMonths(new Date(2027, 0, 31), 1)), '2027-02-28');
  assert.equal(isoDate(addMonths(new Date(2028, 0, 31), 1)), '2028-02-29');
  assert.equal(isoDate(addMonths(new Date(2026, 10, 30), 3)), '2027-02-28');
});

test('deposit interest bands: FD pays more than RD and longer tenures pay more', () => {
  assert.equal(interestRateFor('FD', 6), 5.5);
  assert.equal(interestRateFor('FD', 24), 6.5);
  assert.equal(interestRateFor('FD', 60), 7.0);
  assert.equal(interestRateFor('RD', 12), 5.0);
  assert.ok(interestRateFor('FD', 12) > interestRateFor('RD', 12));
});

test('FD maturity uses simple interest', () => {
  assert.equal(computeMaturity(50000, 6.5, 12), 53250);
});

test('RD maturity pays interest per instalment for the months it was held', () => {
  // 2000 x 12 months at 6%: interest = 2000 * 0.06/12 * (12*13/2) = 780
  assert.equal(computeRdMaturity(2000, 6, 12), 24780);
  // only 4 instalments paid: 4 deposits held 12,11,10,9 months = 42 instalment-months
  assert.equal(computeRdMaturity(2000, 6, 12, 4), 8000 + 2000 * 0.06 / 12 * 42);
});

test('account numbers are masked to the last four digits', () => {
  assert.equal(maskAccountNumber('1000100010001'), 'XXXXXXXXX0001');
  assert.equal(maskAccountNumber('1234'), '1234');
  assert.equal(maskAccountNumber(null), '');
});

test('pagination clamps page and page size', () => {
  assert.deepEqual(paginate({ page: '0', pageSize: '1000' }), { page: 1, pageSize: 100, limit: 100, offset: 0 });
  assert.deepEqual(paginate({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, limit: 10, offset: 20 });
  assert.equal(paginate({}).pageSize, 20);
});
