require('dotenv').config();
const {
  sequelize, User, Customer, Account, AccountHolder, Beneficiary, Transaction, Biller, Deposit,
  Notification, NotificationPreference, ActivityLog, Card, Loan, ServiceRequest, ReviewFlag,
} = require('../src/models');
const { hash } = require('../src/utils/auth.util');
const { buildSchedule, computeEmi, addMonths, isoDate } = require('../src/utils/emi');

const DAY = 86400000;

// Rebuilds the whole database with demo data for every module.
// Historic loan repayments pre-date the ledger, so they are not written as
// Transaction rows; everything created through the app from now on is.
async function seed({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * DAY);
  const daysAhead = (n) => new Date(now.getTime() + n * DAY);

  await sequelize.sync({ force: true });
  log('Tables reset.');

  // ---------------- Users, customers, accounts ----------------
  const adminUser = await User.create({
    username: 'admin', passwordHash: await hash('Admin@123'), role: 'admin',
    email: 'admin@obs-bank.test', phoneNumber: '9000000000',
  });

  async function makeCustomer({ username, mpin, email, phone, fullName, dob, street, city = 'Chennai', pin, kyc, active = true }) {
    const user = await User.create({
      username, passwordHash: await hash('Customer@123'), mpinHash: await hash(mpin), role: 'customer',
      email, phoneNumber: phone, isActive: active,
    });
    const customer = await Customer.create({
      userId: user.id, fullName, dateOfBirth: dob, addressStreet: street, addressCity: city,
      addressState: 'Tamil Nadu', addressPincode: pin, kycRefNumber: kyc,
    });
    return { user, customer };
  }

  const priya = await makeCustomer({ username: 'priya', mpin: '1234', email: 'priya@example.test', phone: '9111111111', fullName: 'Priya Sharma', dob: '1994-03-12', street: '12 MG Road', pin: '600001', kyc: 'KYC-PRIYA-0001' });
  const arjun = await makeCustomer({ username: 'arjun', mpin: '4321', email: 'arjun@example.test', phone: '9222222222', fullName: 'Arjun Nair', dob: '1990-07-25', street: '45 Anna Salai', pin: '600002', kyc: 'KYC-ARJUN-0002' });
  const kavya = await makeCustomer({ username: 'kavya', mpin: '5678', email: 'kavya@example.test', phone: '9333333333', fullName: 'Kavya Nair', dob: '1992-11-03', street: '45 Anna Salai', pin: '600002', kyc: 'KYC-KAVYA-0003' });
  const meera = await makeCustomer({ username: 'meera', mpin: '2468', email: 'meera@example.test', phone: '9444444444', fullName: 'Meera Iyer', dob: '1985-01-19', street: '8 Lake View Road', pin: '600020', kyc: 'KYC-MEERA-0004' });
  const rohan = await makeCustomer({ username: 'rohan', mpin: '1357', email: 'rohan@example.test', phone: '9555555555', fullName: 'Rohan Das', dob: '1998-09-30', street: '3 Beach Road', pin: '600041', kyc: 'KYC-ROHAN-0005', active: false });

  const acct = async (accountNumber, accountType, balance, openedDaysAgo = 400) => Account.create({
    accountNumber, accountType, branchIfsc: 'OBSB0000123', balance, openedAt: daysAgo(openedDaysAgo),
  });
  const priyaAcc = await acct('1000100010001', 'Savings', 85000);
  const jointAcc = await acct('1000200020002', 'Savings', 152000);
  const soloAcc = await acct('1000300030003', 'Current', 42000);
  const meeraAcc = await acct('1000400040004', 'Savings', 320000);
  const rohanAcc = await acct('1000500050005', 'Savings', 18000, 120);

  await AccountHolder.create({ accountId: priyaAcc.id, customerId: priya.customer.id, holderRole: 'Primary' });
  await AccountHolder.create({ accountId: jointAcc.id, customerId: arjun.customer.id, holderRole: 'Primary' });
  await AccountHolder.create({ accountId: jointAcc.id, customerId: kavya.customer.id, holderRole: 'Joint' });
  await AccountHolder.create({ accountId: soloAcc.id, customerId: arjun.customer.id, holderRole: 'Primary' });
  await AccountHolder.create({ accountId: meeraAcc.id, customerId: meera.customer.id, holderRole: 'Primary' });
  await AccountHolder.create({ accountId: rohanAcc.id, customerId: rohan.customer.id, holderRole: 'Primary' });

  // ---------------- Beneficiaries (spread over the reporting window) ----------------
  const coolingOver = (days) => ({ addedAt: daysAgo(days), activeFrom: new Date(daysAgo(days).getTime() + 30 * 60000), status: 'Active' });
  const rahul = await Beneficiary.create({ customerId: priya.customer.id, beneficiaryName: 'Rahul Verma', accountNumber: '2000500050005', ifscCode: 'HDFC0001234', nickname: 'Rahul', ...coolingOver(26) });
  await Beneficiary.create({
    customerId: priya.customer.id, beneficiaryName: 'Landlord - Mr. Iyer', accountNumber: '2000600060006', ifscCode: 'ICIC0005678',
    nickname: 'Rent', status: 'Pending Activation', addedAt: now, activeFrom: daysAhead(0.02),
  });
  const dhruv = await Beneficiary.create({ customerId: arjun.customer.id, beneficiaryName: 'Dhruv Menon', accountNumber: '2000700070007', ifscCode: 'SBIN0004321', nickname: 'Dhruv', ...coolingOver(24) });
  const sneha = await Beneficiary.create({ customerId: arjun.customer.id, beneficiaryName: 'Sneha Pillai', accountNumber: '2000800080008', ifscCode: 'UTIB0001111', nickname: 'Sneha', ...coolingOver(12) });
  await Beneficiary.create({ customerId: kavya.customer.id, beneficiaryName: 'Lakshmi Nair', accountNumber: '2000900090009', ifscCode: 'CNRB0002222', nickname: 'Amma', ...coolingOver(18) });
  const sharma = await Beneficiary.create({ customerId: meera.customer.id, beneficiaryName: 'Sharma Traders', accountNumber: '2001000100010', ifscCode: 'HDFC0005555', nickname: 'Sharma Traders', ...coolingOver(29) });
  const kiran = await Beneficiary.create({ customerId: meera.customer.id, beneficiaryName: 'Kiran Estates Pvt Ltd', accountNumber: '2001100110011', ifscCode: 'ICIC0006666', nickname: 'Kiran Estates', ...coolingOver(16) });

  // ---------------- Billers ----------------
  const ebBiller = await Biller.create({ customerId: priya.customer.id, billerName: 'City Power Electricity Board', billerCategory: 'Electricity', consumerNumber: 'EB-99887766' });
  const bbBiller = await Biller.create({ customerId: priya.customer.id, billerName: 'Metro Broadband', billerCategory: 'Internet', consumerNumber: 'BB-11223344' });
  const tataBiller = await Biller.create({ customerId: arjun.customer.id, billerName: 'Tata Power', billerCategory: 'Electricity', consumerNumber: 'TP-55443322' });
  const jioBiller = await Biller.create({ customerId: meera.customer.id, billerName: 'Jio Fiber', billerCategory: 'Internet', consumerNumber: 'JF-77889900' });
  const bescomBiller = await Biller.create({ customerId: meera.customer.id, billerName: 'City Water Board', billerCategory: 'Utilities', consumerNumber: 'WB-12121212' });

  // ---------------- Transaction history (last ~4 weeks) ----------------
  const acc = { priya: priyaAcc, joint: jointAcc, solo: soloAcc, meera: meeraAcc };
  const ben = { rahul, dhruv, sneha, sharma, kiran };
  const bill = { eb: ebBiller, bb: bbBiller, tata: tataBiller, jio: jioBiller, wb: bescomBiller };
  const history = [
    // [days ago, account, type, amount, status, counterpart]
    [25, 'priya', 'BillPay', 1850, 'Success', 'bill:eb'],
    [20, 'priya', 'IMPS', 3000, 'Success', 'ben:rahul'],
    [14, 'priya', 'Recharge', 599, 'Success', null],
    [9, 'priya', 'NEFT', 8000, 'Success', 'ben:rahul'],
    [7, 'priya', 'Recharge', 199, 'Success', null],
    [4, 'priya', 'BillPay', 2100, 'Failed', 'bill:bb'],
    [27, 'joint', 'Own-Transfer', 20000, 'Success', 'dest:solo'],
    [22, 'joint', 'NEFT', 15000, 'Success', 'ben:dhruv'],
    [18, 'joint', 'BillPay', 3400, 'Success', 'bill:tata'],
    [12, 'joint', 'BillPay', 980, 'Failed', 'bill:tata'],
    [11, 'joint', 'IMPS', 7500, 'Success', 'ben:sneha'],
    [6, 'joint', 'Own-Transfer', 10000, 'Success', 'dest:solo'],
    [5, 'joint', 'Recharge', 149, 'Success', null],
    [3, 'joint', 'NEFT', 25000, 'Failed', 'ben:dhruv'],
    [16, 'solo', 'Own-Transfer', 5000, 'Success', 'dest:joint'],
    [8, 'solo', 'Recharge', 299, 'Success', null],
    [2, 'solo', 'IMPS', 4500, 'Success', 'ben:sneha'],
    [28, 'meera', 'NEFT', 60000, 'Success', 'ben:sharma'],
    [21, 'meera', 'BillPay', 1299, 'Success', 'bill:jio'],
    [15, 'meera', 'RTGS', 250000, 'Success', 'ben:kiran'],
    [10, 'meera', 'IMPS', 12000, 'Success', 'ben:sharma'],
    [5, 'meera', 'BillPay', 2750, 'Success', 'bill:wb'],
    [2, 'meera', 'IMPS', 9000, 'Success', 'ben:sharma'],
    [1, 'meera', 'NEFT', 40000, 'Failed', 'ben:kiran'],
  ];
  const txRows = [];
  let seq = 0;
  for (const [d, a, type, amount, status, who] of history) {
    const at = daysAgo(d);
    const row = {
      sourceAccountId: acc[a].id, transactionType: type, amount, status,
      initiatedAt: at, completedAt: at,
      referenceNumber: status === 'Success' ? `UTR${1760000000000 + (seq += 1) * 997}` : null,
      failureReason: status === 'Failed' ? 'Core Banking System declined the posting (simulated).' : null,
    };
    if (who && who.startsWith('ben:')) row.beneficiaryId = ben[who.slice(4)].id;
    if (who && who.startsWith('bill:')) row.billerId = bill[who.slice(5)].id;
    if (who && who.startsWith('dest:')) row.destinationAccountId = acc[who.slice(5)].id;
    txRows.push(await Transaction.create(row));
  }
  // The "just now" transfer that the Phase 1 demo always showed.
  const justNow = await Transaction.create({
    sourceAccountId: priyaAcc.id, beneficiaryId: rahul.id, transactionType: 'IMPS', amount: 5000, status: 'Success',
    referenceNumber: `UTR${Date.now()}`, initiatedAt: new Date(now.getTime() - 3600000), completedAt: new Date(now.getTime() - 3600000),
  });

  // ---------------- Deposits ----------------
  const fdMaturity = new Date(now); fdMaturity.setMonth(fdMaturity.getMonth() + 12);
  await Deposit.create({
    accountId: priyaAcc.id, depositType: 'FD', principalAmount: 50000, interestRate: 6.5, tenureMonths: 12,
    maturityDate: isoDate(fdMaturity), maturityAmount: +(50000 * (1 + 0.065)).toFixed(2),
  });
  const rdOpened = addMonths(now, -3);
  await Deposit.create({
    accountId: priyaAcc.id, depositType: 'RD', principalAmount: 24000, installmentAmount: 2000, installmentsPaid: 4,
    interestRate: 6.0, tenureMonths: 12, maturityDate: isoDate(addMonths(rdOpened, 12)),
    nextInstallmentDate: isoDate(addMonths(rdOpened, 4)),
    maturityAmount: 24000 + 2000 * 0.06 * (12 * 13 / 2) / 12,
    createdAt: rdOpened,
  });
  await Deposit.create({
    accountId: meeraAcc.id, depositType: 'FD', principalAmount: 100000, interestRate: 7.0, tenureMonths: 36,
    maturityDate: isoDate(addMonths(now, 26)), maturityAmount: +(100000 * (1 + 0.07 * 3)).toFixed(2),
    createdAt: addMonths(now, -10),
  });

  // ---------------- Cards ----------------
  const cardDefaults = { atmEnabled: true, posEnabled: true, onlineEnabled: true, internationalEnabled: false, network: 'RuPay' };
  await Card.create({ ...cardDefaults, accountId: priyaAcc.id, cardHolderName: 'PRIYA SHARMA', cardNumberMasked: 'XXXX XXXX XXXX 4821', cardType: 'Debit', dailyLimit: 100000, atmLimit: 25000, posLimit: 75000, onlineLimit: 50000, expiryDate: '2029-08-01' });
  await Card.create({ ...cardDefaults, network: 'Visa', internationalEnabled: true, accountId: priyaAcc.id, cardHolderName: 'PRIYA SHARMA', cardNumberMasked: 'XXXX XXXX XXXX 9034', cardType: 'Credit', dailyLimit: 200000, atmLimit: 20000, posLimit: 150000, onlineLimit: 100000, expiryDate: '2030-02-01' });
  await Card.create({ ...cardDefaults, accountId: jointAcc.id, cardHolderName: 'ARJUN NAIR', cardNumberMasked: 'XXXX XXXX XXXX 1177', cardType: 'Debit', dailyLimit: 150000, atmLimit: 40000, posLimit: 100000, onlineLimit: 75000, expiryDate: '2028-11-01' });
  const blockedCard = await Card.create({ ...cardDefaults, accountId: soloAcc.id, cardHolderName: 'ARJUN NAIR', cardNumberMasked: 'XXXX XXXX XXXX 2205', cardType: 'Debit', dailyLimit: 100000, atmLimit: 25000, posLimit: 75000, onlineLimit: 50000, expiryDate: '2029-03-01', status: 'Reissue Requested', blockedAt: daysAgo(2) });
  await Card.create({ ...cardDefaults, network: 'Mastercard', internationalEnabled: true, accountId: meeraAcc.id, cardHolderName: 'MEERA IYER', cardNumberMasked: 'XXXX XXXX XXXX 5512', cardType: 'Credit', dailyLimit: 400000, atmLimit: 30000, posLimit: 350000, onlineLimit: 250000, expiryDate: '2031-01-01' });

  // ---------------- Loans ----------------
  async function seedLoan({ who, account, type, principal, rate, tenure, paid, disbursedDaysAgoMonths, offsetDays = 0, status, purpose, createdAt, reason }) {
    const base = {
      accountId: account.id, customerId: who.customer.id, loanType: type, principalAmount: principal,
      interestRate: rate, tenureMonths: tenure, purpose, createdAt,
    };
    if (status === 'Applied') return Loan.create({ ...base, status, emiAmount: computeEmi(principal, rate, tenure) });
    if (status === 'Rejected') return Loan.create({ ...base, status, rejectionReason: reason, approvedByUserId: adminUser.id, decidedAt: new Date(createdAt.getTime() + 2 * DAY), emiAmount: computeEmi(principal, rate, tenure) });
    const disbursed = new Date(addMonths(now, -disbursedDaysAgoMonths).getTime() - offsetDays * DAY);
    const schedule = buildSchedule(principal, rate, tenure, disbursed);
    return Loan.create({
      ...base, status, approvedByUserId: adminUser.id, decidedAt: disbursed, disbursedAt: disbursed,
      emiAmount: schedule[0].emi, emisPaid: paid,
      outstandingBalance: paid >= tenure ? 0 : schedule[paid - 1].balanceAfter,
      nextEmiDate: paid >= tenure ? null : schedule[paid].dueDate,
      createdAt: new Date(disbursed.getTime() - 2 * DAY),
    });
  }
  await seedLoan({ who: priya, account: priyaAcc, type: 'Personal', principal: 200000, rate: 11.5, tenure: 24, paid: 6, disbursedDaysAgoMonths: 6, offsetDays: 3, status: 'Active', purpose: 'Home renovation' });
  await seedLoan({ who: priya, account: priyaAcc, type: 'Education', principal: 300000, rate: 9.5, tenure: 60, status: 'Applied', purpose: 'Masters programme fees', createdAt: daysAgo(1) });
  await seedLoan({ who: arjun, account: jointAcc, type: 'Vehicle', principal: 500000, rate: 9.0, tenure: 48, status: 'Applied', purpose: 'New hatchback', createdAt: daysAgo(2) });
  await seedLoan({ who: arjun, account: soloAcc, type: 'Personal', principal: 400000, rate: 11.5, tenure: 36, status: 'Rejected', purpose: 'Consolidation', createdAt: daysAgo(21), reason: 'Existing obligations exceed the policy limit for this product.' });
  await seedLoan({ who: arjun, account: jointAcc, type: 'Personal', principal: 50000, rate: 11.5, tenure: 6, paid: 6, disbursedDaysAgoMonths: 9, status: 'Closed', purpose: 'Appliance purchase' });
  await seedLoan({ who: meera, account: meeraAcc, type: 'Home', principal: 2500000, rate: 8.5, tenure: 120, paid: 14, disbursedDaysAgoMonths: 14, offsetDays: 5, status: 'Active', purpose: 'Apartment purchase' });

  // ---------------- Service requests ----------------
  const sr = (customer, type, description, status, createdDays, extra = {}) => ServiceRequest.create({
    customerId: customer.customer.id, requestType: type, description, status, createdAt: daysAgo(createdDays), ...extra,
  });
  await sr(priya, 'ChequeBook', 'Please issue a 25-leaf cheque book to my registered address.', 'Open', 2, { relatedAccountId: priyaAcc.id });
  await sr(priya, 'Complaint', 'ATM debited ₹2,000 but no cash was dispensed at the MG Road ATM.', 'In Progress', 5, { relatedAccountId: priyaAcc.id });
  await sr(priya, 'Statement', 'Need a physical statement for the last 6 months for a visa application.', 'Resolved', 12, {
    relatedAccountId: priyaAcc.id, resolvedByUserId: adminUser.id, resolvedAt: new Date(daysAgo(11).getTime() + 2 * 3600000),
    resolutionNotes: 'Statement printed and dispatched by speed post. Tracking ID SP123456789IN.',
  });
  await sr(arjun, 'CardIssue', 'Unblock / reissue request for Debit card ending 2205. Customer note: card blocked after it was misplaced; found it, please reissue anyway.', 'Open', 2, { relatedCardId: blockedCard.id, relatedAccountId: soloAcc.id });
  await sr(kavya, 'Other', 'Please update my communication preference to e-mail only.', 'Closed', 9, {
    resolvedByUserId: adminUser.id, resolvedAt: daysAgo(8), resolutionNotes: 'Preference updated as requested.',
  });
  await sr(meera, 'Complaint', 'Duplicate debit of ₹1,299 against my Jio Fiber payment.', 'Resolved', 6, {
    relatedAccountId: meeraAcc.id, resolvedByUserId: adminUser.id, resolvedAt: new Date(daysAgo(5).getTime() + 5 * 3600000),
    resolutionNotes: 'Duplicate debit reversed within one working day.',
  });

  // ---------------- Notifications and preferences ----------------
  const note = (customer, message, category, daysBack, isRead, channels = 'In-App,SMS,Email') => Notification.create({
    customerId: customer.customer.id, message, category, isRead, channels, createdAt: daysAgo(daysBack),
  });
  await note(priya, 'Debit alert: ₹5,000 sent via IMPS from A/c XXXXXXXXX0001. Ref: UTR-demo-1.', 'Transactional', 0.04, false);
  await note(priya, 'Your loan application #2 for ₹3,00,000 has been received and is awaiting review.', 'Transactional', 1, false);
  await note(priya, 'Your complaint SR000002 is now In Progress. We are checking the ATM journal.', 'Transactional', 3, false);
  await note(priya, 'Security alert: a login to your account was detected from a new device.', 'Security', 4, true, 'In-App,SMS');
  await note(priya, 'Your statement request SR000003 is now Resolved. Note: Statement printed and dispatched by speed post.', 'Transactional', 11, true);
  await note(priya, 'Festive offer: pre-approved personal loans from 11.5% p.a. Check your offers today!', 'Promotional', 13, true, 'In-App,Email');
  await note(priya, 'Debit alert: ₹599 paid for recharge from A/c XXXXXXXXX0001.', 'Transactional', 14, true);
  await note(priya, 'Welcome to Online Banking System. Please set your transaction MPIN from your Profile page.', 'Security', 40, true, 'In-App,SMS');
  await note(arjun, 'Security alert: your Debit card ending 2205 has been blocked. All transactions on it are now declined.', 'Security', 2, false, 'In-App,SMS');
  await note(arjun, 'Your request SR000004 to unblock/reissue the card ending 2205 has been raised.', 'Transactional', 2, false);
  await note(arjun, 'Your Vehicle loan application #3 for ₹5,00,000 has been received and is awaiting review.', 'Transactional', 2, true);
  await note(kavya, 'Credit alert: ₹10,000 credited to A/c XXXXXXXXX0002 from A/c XXXXXXXXX0003.', 'Transactional', 6, true);
  await note(meera, 'Your request SR000006 is now Resolved. Note: Duplicate debit reversed within one working day.', 'Transactional', 5, true);

  await NotificationPreference.create({ customerId: priya.customer.id });
  await NotificationPreference.create({ customerId: arjun.customer.id, alertThreshold: 5000 });
  await NotificationPreference.create({ customerId: kavya.customer.id, promotionalEnabled: false, smsEnabled: false });
  await NotificationPreference.create({ customerId: meera.customer.id });
  await NotificationPreference.create({ customerId: rohan.customer.id });

  // ---------------- Review flags ----------------
  const bigRtgs = txRows.find((t) => t.transactionType === 'RTGS');
  await ReviewFlag.create({ entityType: 'Transaction', entityId: bigRtgs.id, reason: 'Large RTGS to a recently added beneficiary - verify purpose.', flaggedByUserId: adminUser.id });
  const failedNeft = txRows.find((t) => t.transactionType === 'NEFT' && t.status === 'Failed' && t.sourceAccountId === meeraAcc.id);
  await ReviewFlag.create({
    entityType: 'Transaction', entityId: failedNeft.id, reason: 'Repeated failure on the same beneficiary.', flaggedByUserId: adminUser.id,
    status: 'Cleared', clearedByUserId: adminUser.id, clearedAt: daysAgo(0.5), clearanceNote: 'Beneficiary bank was down; customer informed.',
  });

  // ---------------- Activity log ----------------
  const logs = [
    [adminUser, 'Seed data initialized', 'System', null, 30],
    [priya.user, 'Successful login (OTP verified)', 'User', priya.user.id, 4],
    [priya.user, 'Loan application submitted: Education ₹300000 for 60 months', 'Loan', 2, 1],
    [arjun.user, 'Card ending 2205 blocked by customer', 'Card', blockedCard.id, 2],
    [arjun.user, 'Loan application submitted: Vehicle ₹500000 for 48 months', 'Loan', 3, 2],
    [adminUser, 'Loan 4 rejected: Existing obligations exceed the policy limit for this product.', 'Loan', 4, 19],
    [adminUser, `Transaction ${bigRtgs.id} flagged for review: Large RTGS to a recently added beneficiary - verify purpose.`, 'Transaction', bigRtgs.id, 1],
    [adminUser, 'Service request SR000003 moved In Progress -> Resolved', 'ServiceRequest', 3, 11],
    [meera.user, 'Successful login (OTP verified)', 'User', meera.user.id, 3],
    [adminUser, 'Customer login account deactivated: rohan', 'User', rohan.user.id, 7],
  ];
  for (const [user, desc, entity, entityId, back] of logs) {
    await ActivityLog.create({ userId: user.id, actionDescription: desc, entityAffected: entity, entityId, timestamp: daysAgo(back) });
  }

  if (!quiet) {
    console.log('\nSeed complete. Sample login credentials:');
    console.table([
      { role: 'admin', username: 'admin', password: 'Admin@123', mpin: '-', note: 'admin console' },
      { role: 'customer', username: 'priya', password: 'Customer@123', mpin: '1234', note: 'savings, 2 cards, active loan, FD + RD' },
      { role: 'customer', username: 'arjun', password: 'Customer@123', mpin: '4321', note: 'joint + solo account, blocked card' },
      { role: 'customer', username: 'kavya', password: 'Customer@123', mpin: '5678', note: 'joint account holder' },
      { role: 'customer', username: 'meera', password: 'Customer@123', mpin: '2468', note: 'home loan, credit card' },
      { role: 'customer', username: 'rohan', password: 'Customer@123', mpin: '1357', note: 'deactivated (admin can activate)' },
    ]);
  }
  return { adminUser, priya, arjun, kavya, meera, rohan, accounts: { priyaAcc, jointAcc, soloAcc, meeraAcc, rohanAcc }, justNow };
}

module.exports = { seed };

if (require.main === module) {
  seed()
    .then(() => { console.log('\nDone.'); process.exit(0); })
    .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
}
