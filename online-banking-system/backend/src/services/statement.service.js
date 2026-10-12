const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { Account, Transaction, Beneficiary, Biller, Customer, AccountHolder } = require('../models');
const { AppError } = require('../middleware/errorHandler.middleware');
const { directionFor } = require('../utils/ledger');
const { maskAccountNumber } = require('../utils/mask');
const { round2 } = require('../utils/emi');

const TYPE_LABEL = {
  'Own-Transfer': 'Own-account transfer',
  NEFT: 'NEFT', RTGS: 'RTGS', IMPS: 'IMPS',
  BillPay: 'Bill payment', Recharge: 'Recharge',
  DepositOpen: 'Deposit opened', RDInstallment: 'RD instalment', DepositPayout: 'Deposit proceeds',
  LoanDisbursal: 'Loan disbursal', LoanEMI: 'Loan EMI',
};

const TXN_INCLUDE = [
  { model: Account, as: 'SourceAccount', attributes: ['id', 'accountNumber'] },
  { model: Account, as: 'DestinationAccount', attributes: ['id', 'accountNumber'] },
  { model: Beneficiary, attributes: ['id', 'beneficiaryName', 'nickname'] },
  { model: Biller, attributes: ['id', 'billerName'] },
];

// Human-readable line shown in history and statements.
function describe(txn, direction) {
  const t = txn.transactionType;
  const bene = txn.Beneficiary ? (txn.Beneficiary.nickname || txn.Beneficiary.beneficiaryName) : null;
  switch (t) {
    case 'Own-Transfer':
      return direction === 'debit'
        ? `Transfer to A/c ${maskAccountNumber(txn.DestinationAccount && txn.DestinationAccount.accountNumber)}`
        : `Transfer from A/c ${maskAccountNumber(txn.SourceAccount && txn.SourceAccount.accountNumber)}`;
    case 'NEFT': case 'RTGS': case 'IMPS':
      return `${t} to ${bene || 'beneficiary'}`;
    case 'BillPay':
      return `Bill payment${txn.Biller ? ` - ${txn.Biller.billerName}` : ''}`;
    case 'Recharge':
      return `Recharge${txn.Biller ? ` - ${txn.Biller.billerName}` : ''}`;
    default:
      return TYPE_LABEL[t] || t;
  }
}

function enrich(txn, accountId) {
  const direction = directionFor(txn, accountId);
  const json = txn.toJSON();
  delete json.SourceAccount; delete json.DestinationAccount; delete json.Beneficiary; delete json.Biller;
  return { ...json, direction, description: describe(txn, direction) };
}

// Everything that touched an account, newest first: money out (it is the
// source) and money in (it is the destination of an own-account transfer, or
// the credited account of a loan disbursal / deposit payout).
async function transactionsFor(accountId, { from, to, type, status, direction } = {}) {
  const where = { [Op.or]: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] };
  if (type) where.transactionType = type;
  if (status) where.status = status;
  if (from || to) {
    where.initiatedAt = {};
    if (from) where.initiatedAt[Op.gte] = new Date(from);
    if (to) {
      const end = new Date(to);
      if (String(to).length <= 10) end.setHours(23, 59, 59, 999);
      where.initiatedAt[Op.lte] = end;
    }
  }
  const rows = await Transaction.findAll({ where, include: TXN_INCLUDE, order: [['initiatedAt', 'DESC'], ['id', 'DESC']] });
  const out = rows.map((t) => enrich(t, accountId));
  return direction ? out.filter((t) => t.direction === direction) : out;
}

// Builds a statement for a date range. Balances are reconstructed by walking
// back from the current balance across every successful ledger entry, so the
// running balance is internally consistent with what the account holds today.
async function build(accountId, { from, to } = {}) {
  const account = await Account.findByPk(accountId);
  if (!account) throw new AppError('Account not found.', 404);

  const all = await transactionsFor(accountId, {});
  const chronological = [...all].reverse().filter((t) => t.status === 'Success');
  const net = chronological.reduce((s, t) => s + (t.direction === 'credit' ? 1 : -1) * parseFloat(t.amount), 0);
  let running = round2(parseFloat(account.balance) - net);

  const start = from ? new Date(from) : null;
  let end = null;
  if (to) { end = new Date(to); if (String(to).length <= 10) end.setHours(23, 59, 59, 999); }

  let openingBalance = null;
  const lines = [];
  for (const t of chronological) {
    const at = new Date(t.initiatedAt);
    const before = running;
    running = round2(running + (t.direction === 'credit' ? 1 : -1) * parseFloat(t.amount));
    const inRange = (!start || at >= start) && (!end || at <= end);
    if (!inRange) continue;
    if (openingBalance === null) openingBalance = before;
    lines.push({
      date: t.initiatedAt,
      description: t.description,
      reference: t.referenceNumber || '',
      type: t.transactionType,
      debit: t.direction === 'debit' ? parseFloat(t.amount) : 0,
      credit: t.direction === 'credit' ? parseFloat(t.amount) : 0,
      balance: running,
    });
  }
  if (openingBalance === null) {
    // No activity in range: the balance is whatever it was at the end of the range.
    const before = chronological.filter((t) => !start || new Date(t.initiatedAt) < start);
    openingBalance = round2(parseFloat(account.balance) - net + before.reduce((s, t) => s + (t.direction === 'credit' ? 1 : -1) * parseFloat(t.amount), 0));
  }
  const closingBalance = lines.length ? lines[lines.length - 1].balance : openingBalance;
  const holders = await AccountHolder.findAll({ where: { accountId }, include: [{ model: Customer, attributes: ['fullName'] }] });

  return {
    account: {
      accountNumberMasked: maskAccountNumber(account.accountNumber),
      accountType: account.accountType,
      branchIfsc: account.branchIfsc,
      holders: holders.map((h) => h.Customer.fullName),
    },
    period: { from: from || null, to: to || null },
    generatedAt: new Date(),
    openingBalance,
    closingBalance,
    totalDebits: round2(lines.reduce((s, l) => s + l.debit, 0)),
    totalCredits: round2(lines.reduce((s, l) => s + l.credit, 0)),
    lines,
  };
}

function csvCell(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// SRS F13/F57: CSV statement.
function toCsv(st) {
  const head = [
    ['Account', st.account.accountNumberMasked],
    ['Type', st.account.accountType],
    ['IFSC', st.account.branchIfsc],
    ['Period', `${st.period.from || 'start'} to ${st.period.to || 'today'}`],
    ['Opening balance', st.openingBalance.toFixed(2)],
    ['Closing balance', st.closingBalance.toFixed(2)],
    [],
    ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'],
  ];
  const body = st.lines.map((l) => [
    new Date(l.date).toISOString(), l.description, l.reference,
    l.debit ? l.debit.toFixed(2) : '', l.credit ? l.credit.toFixed(2) : '', l.balance.toFixed(2),
  ]);
  return [...head, ...body].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function inr(n) {
  return `INR ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// SRS F57: PDF statement. Built-in Helvetica has no rupee glyph, so amounts
// are printed as "INR".
function toPdf(st) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: 'Account Statement', Author: 'Online Banking System' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#1E2761';
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text('Online Banking System', 40, 40);
    doc.fontSize(11).fillColor('#444').font('Helvetica').text('Account Statement');
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor('#222');
    const info = [
      ['Account', `${st.account.accountNumberMasked} (${st.account.accountType})`],
      ['Holder(s)', st.account.holders.join(', ')],
      ['IFSC', st.account.branchIfsc],
      ['Period', `${st.period.from || 'start'} to ${st.period.to || 'today'}`],
      ['Generated', new Date(st.generatedAt).toLocaleString('en-IN')],
      ['Opening balance', inr(st.openingBalance)],
      ['Closing balance', inr(st.closingBalance)],
      ['Total debits / credits', `${inr(st.totalDebits)} / ${inr(st.totalCredits)}`],
    ];
    for (const [k, v] of info) {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(k, 40, y, { width: 120 });
      doc.font('Helvetica').text(v, 165, y, { width: 390 });
    }
    doc.moveDown(0.8);

    const cols = [
      { h: 'Date', x: 40, w: 70 }, { h: 'Description', x: 112, w: 160 }, { h: 'Reference', x: 274, w: 95 },
      { h: 'Debit', x: 371, w: 62, a: 'right' }, { h: 'Credit', x: 435, w: 62, a: 'right' }, { h: 'Balance', x: 499, w: 56, a: 'right' },
    ];
    const header = () => {
      const y = doc.y;
      doc.rect(40, y - 2, 515, 16).fill(navy);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
      for (const c of cols) doc.text(c.h, c.x + 2, y + 2, { width: c.w - 4, align: c.a || 'left' });
      doc.y = y + 18;
      doc.fillColor('#222').font('Helvetica').fontSize(8);
    };
    header();

    if (st.lines.length === 0) {
      doc.text('No transactions in this period.', 42, doc.y + 4);
    }
    st.lines.forEach((l, i) => {
      if (doc.y > 770) { doc.addPage(); doc.y = 40; header(); }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(40, y - 2, 515, 14).fill('#F3F5FB').fillColor('#222');
      const cells = [
        new Date(l.date).toLocaleDateString('en-IN'), l.description, l.reference,
        l.debit ? l.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
        l.credit ? l.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
        l.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      ];
      cols.forEach((c, k) => doc.text(cells[k], c.x + 2, y, { width: c.w - 4, align: c.a || 'left', lineBreak: false, ellipsis: true }));
      doc.y = y + 14;
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.fontSize(7).fillColor('#888').text(`Computer-generated statement. Page ${i + 1} of ${range.count}.`, 40, 810, { width: 515, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { transactionsFor, build, toCsv, toPdf, describe, TYPE_LABEL };
