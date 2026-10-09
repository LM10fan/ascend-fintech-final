/**
 * Single source of truth for Ascend credit-ladder arithmetic. Integer paise only.
 * These are proposed prototype product rules, not lender policy or regulatory approval.
 */
import { POLICY } from "./cashflow.js";

export const LADDER_VERSION = "ascend-ladder-proposal-v1";
export const MIN_SDA_BALANCE = 1000;
export const MAX_AMOUNT = 10000000;

export const LEVELS = Object.freeze([
  { level: 1, name: "Anchor", limitPct: 20, collateralPct: 100, role: "Beginner" },
  { level: 2, name: "Habit", limitPct: 35, collateralPct: 100, role: "Repayment habit building" },
  { level: 3, name: "Hybrid", limitPct: 50, collateralPct: 35, role: "Initial risk sharing" },
  { level: 4, name: "Velocity", limitPct: 60, collateralPct: 50, role: "Established repayment history" },
  { level: 5, name: "Apex", limitPct: 70, collateralPct: 0, role: "Advanced credit assessment" },
]);

const toPaise = (value) => Math.round(value * 100);
const fromPaise = (value) => value / 100;

export function amountError(value, label = "Amount", { min = 0, max = MAX_AMOUNT } = {}) {
  if (value === "" || value == null || !Number.isFinite(Number(value)))
    return `${label} is required.`;
  const number = Number(value);
  if (number < 0) return `${label} cannot be negative.`;
  if (number < min || number > max)
    return `${label} must be between ₹${min.toLocaleString("en-IN")} and ₹${max.toLocaleString("en-IN")}.`;
  if (Math.abs(number * 100 - Math.round(number * 100)) > 0.00001)
    return `${label} supports up to two decimal places.`;
  return "";
}

function assertAmount(value, label) {
  const error = amountError(value, label);
  if (error) throw new RangeError(error);
  return Number(value);
}

export function getLevel(level) {
  const found = LEVELS.find((item) => item.level === level);
  if (!found) throw new RangeError("Level must be between 1 and 5.");
  return found;
}

/** Base limit = SDA × limit%; proposed lien = base limit × collateral% (of the limit, never of the SDA). */
export function levelTerms(sdaBalance, level) {
  const balanceP = toPaise(assertAmount(sdaBalance, "SDA balance"));
  const spec = getLevel(level);
  // Conservative rounding: the limit rounds down, the lien rounds up.
  const limitP = Math.floor((balanceP * spec.limitPct) / 100);
  const lienP = Math.ceil((limitP * spec.collateralPct) / 100);
  return {
    ...spec,
    sdaBalance: fromPaise(balanceP),
    baseLimit: fromPaise(limitP),
    proposedLien: fromPaise(lienP),
    unsecured: fromPaise(limitP - lienP),
    requiresLenderApproval: spec.level >= 3,
  };
}

export function ladderTable(sdaBalance) {
  return LEVELS.map((spec) => levelTerms(sdaBalance, spec.level));
}

/** Repayment if the full limit were used, on the same 3-installment, 4% flat-charge terms as the Decision Lab. */
export function fullUseRepayment(limit) {
  const limitP = toPaise(assertAmount(limit, "Credit limit"));
  const feeP = Math.round(limitP * POLICY.totalFeeRate);
  const totalP = limitP + feeP;
  const regularP = Math.floor(totalP / POLICY.months);
  const installmentsP = [regularP, regularP, totalP - regularP * 2];
  return {
    principal: fromPaise(limitP),
    fee: fromPaise(feeP),
    total: fromPaise(totalP),
    months: POLICY.months,
    installments: installmentsP.map(fromPaise),
    maxInstallment: fromPaise(Math.max(...installmentsP)),
  };
}

/**
 * Savings and credit are reported separately and never double-counted.
 * confirmedLien is bank-confirmed for Ascend; otherRestrictions are unrelated holds.
 */
export function creditPosition({
  sdaBalance,
  otherRestrictions = 0,
  confirmedLien = 0,
  level = null,
  facility = null,
}) {
  const balanceP = toPaise(assertAmount(sdaBalance, "SDA balance"));
  const otherP = toPaise(assertAmount(otherRestrictions, "Other restrictions"));
  const confirmedP = toPaise(assertAmount(confirmedLien, "Confirmed LIEN"));
  const restrictedP = otherP + confirmedP;
  const inconsistent = restrictedP > balanceP;
  const availableSavingsP = Math.max(0, balanceP - restrictedP);
  const terms = level ? levelTerms(fromPaise(balanceP), level) : null;
  const proposedP = terms ? toPaise(terms.proposedLien) : 0;
  const collateralCapacityP = Math.max(0, balanceP - otherP);
  const afterProposedP = Math.max(0, balanceP - otherP - Math.max(confirmedP, proposedP));
  let approvedP = 0;
  let outstandingP = 0;
  if (facility) {
    approvedP = toPaise(assertAmount(facility.approvedLimit, "Approved limit"));
    outstandingP = toPaise(assertAmount(facility.outstanding, "Outstanding balance"));
  }
  return {
    sdaBalance: fromPaise(balanceP),
    otherRestrictions: fromPaise(otherP),
    confirmedLien: fromPaise(confirmedP),
    availableSavings: fromPaise(availableSavingsP),
    inconsistent,
    level: terms?.level ?? null,
    baseLimit: terms ? terms.baseLimit : null,
    proposedLien: terms ? terms.proposedLien : null,
    unsecuredExposure: terms ? terms.unsecured : null,
    additionalLienNeeded: terms ? fromPaise(Math.max(0, proposedP - confirmedP)) : null,
    collateralShortfall: terms ? fromPaise(Math.max(0, proposedP - collateralCapacityP)) : null,
    availableAfterProposedLien: terms ? fromPaise(afterProposedP) : null,
    facilityActive: !!facility,
    approvedLimit: facility ? fromPaise(approvedP) : null,
    outstanding: fromPaise(outstandingP),
    availableCredit: facility ? fromPaise(Math.max(0, approvedP - outstandingP)) : 0,
    overLimit: outstandingP > approvedP && !!facility,
  };
}
