// EMI maths shared by the loan service and the standalone calculator
// (SRS F41, P6: pure computation, no database round-trip).

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Standard reducing-balance EMI: P * r * (1+r)^n / ((1+r)^n - 1), r = annual/12/100.
function computeEmi(principal, annualRatePercent, tenureMonths) {
  const P = Number(principal);
  const n = Number(tenureMonths);
  const r = Number(annualRatePercent) / 12 / 100;
  if (!(P > 0) || !(n > 0)) return 0;
  if (r === 0) return round2(P / n);
  const f = Math.pow(1 + r, n);
  return round2((P * r * f) / (f - 1));
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

function isoDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// Full amortisation schedule. The final instalment absorbs rounding so the
// balance closes at exactly zero.
function buildSchedule(principal, annualRatePercent, tenureMonths, startDate) {
  const P = Number(principal);
  const n = Number(tenureMonths);
  const r = Number(annualRatePercent) / 12 / 100;
  const emi = computeEmi(P, annualRatePercent, n);
  const rows = [];
  let balance = P;
  for (let k = 1; k <= n; k += 1) {
    const interest = round2(balance * r);
    let principalPart = round2(emi - interest);
    let payment = emi;
    if (k === n || principalPart > balance) {
      principalPart = round2(balance);
      payment = round2(principalPart + interest);
    }
    balance = round2(balance - principalPart);
    rows.push({
      installment: k,
      dueDate: startDate ? isoDate(addMonths(startDate, k)) : null,
      emi: payment,
      principalComponent: principalPart,
      interestComponent: interest,
      balanceAfter: balance < 0.005 ? 0 : balance,
    });
  }
  return rows;
}

function summarise(principal, annualRatePercent, tenureMonths) {
  const emi = computeEmi(principal, annualRatePercent, tenureMonths);
  const schedule = buildSchedule(principal, annualRatePercent, tenureMonths, null);
  const totalPayable = round2(schedule.reduce((s, row) => s + row.emi, 0));
  return {
    principal: Number(principal),
    annualRatePercent: Number(annualRatePercent),
    tenureMonths: Number(tenureMonths),
    emi,
    totalPayable,
    totalInterest: round2(totalPayable - Number(principal)),
  };
}

module.exports = { computeEmi, buildSchedule, summarise, addMonths, isoDate, round2 };
