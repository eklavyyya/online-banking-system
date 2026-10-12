// Simulated Core Banking System posting (SRS: CBS integration is simulated
// in Version 1.0 - see Exp-1 2.5, Exp-8 Core Banking Connector component).
// Shared by every module that posts a debit/credit, so the failure rate is
// configured in exactly one place.
// Read at call time (not import time) so tests can switch failures on and off.
function failureRate() {
  const raw = process.env.CBS_SIMULATED_FAILURE_RATE;
  const rate = raw === undefined || raw === '' ? 0.05 : parseFloat(raw);
  return Number.isNaN(rate) ? 0.05 : Math.min(1, Math.max(0, rate));
}

function simulateCbsPosting() {
  return Math.random() >= failureRate();
}

module.exports = { simulateCbsPosting };
