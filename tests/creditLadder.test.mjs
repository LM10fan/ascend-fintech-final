import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  amountError,
  creditPosition,
  fullUseRepayment,
  ladderTable,
  levelTerms,
} from "../src/features/ascend/domain/creditLadder.js";

test("₹10,000 SDA fixture matches the five-level design table exactly", () => {
  assert.deepEqual(
    ladderTable(10000).map(({ level, baseLimit, proposedLien, unsecured }) => [level, baseLimit, proposedLien, unsecured]),
    [
      [1, 2000, 2000, 0],
      [2, 3500, 3500, 0],
      [3, 5000, 1750, 3250],
      [4, 6000, 3000, 3000],
      [5, 7000, 0, 7000],
    ],
  );
});

test("collateral is a share of the credit limit, never of the SDA balance", () => {
  const l3 = levelTerms(10000, 3);
  assert.equal(l3.proposedLien, l3.baseLimit * 0.35);
  assert.notEqual(l3.proposedLien, 10000 * 0.35);
  const l4 = levelTerms(10000, 4);
  assert.equal(l4.proposedLien, 3000);
  assert.notEqual(l4.proposedLien, 4000);
});

test("limits scale with any balance and round conservatively in paise", () => {
  assert.deepEqual(
    ladderTable(25000).map((row) => row.baseLimit),
    [5000, 8750, 12500, 15000, 17500],
  );
  const odd = levelTerms(1234.57, 3);
  assert.equal(odd.baseLimit, 617.28);
  assert.equal(odd.proposedLien, 216.05);
  assert.equal(odd.unsecured, 401.23);
  for (const row of ladderTable(987654.33))
    assert.equal(Math.round((row.proposedLien + row.unsecured) * 100), Math.round(row.baseLimit * 100));
  assert.ok(LEVELS.every((spec) => levelTerms(5000, spec.level).requiresLenderApproval === spec.level >= 3));
});

test("zero balance yields zero limits; negative or invalid input is rejected", () => {
  assert.ok(ladderTable(0).every((row) => row.baseLimit === 0 && row.proposedLien === 0));
  assert.throws(() => levelTerms(-1, 1), /cannot be negative/);
  assert.throws(() => levelTerms("", 1), /required/);
  assert.throws(() => levelTerms(Number.NaN, 1), /required/);
  assert.throws(() => levelTerms(100.001, 1), /two decimal/);
  assert.throws(() => levelTerms(1000, 6), /Level/);
  assert.throws(() => levelTerms(1000, 0), /Level/);
  assert.equal(amountError(500, "SDA", { min: 1000 }), "SDA must be between ₹1,000 and ₹1,00,00,000.");
});

test("full-use repayment reuses the Decision Lab's 3-installment, 4% flat terms", () => {
  const repayment = fullUseRepayment(3500);
  assert.equal(repayment.fee, 140);
  assert.equal(repayment.total, 3640);
  assert.deepEqual(repayment.installments, [1213.33, 1213.33, 1213.34]);
  assert.equal(repayment.maxInstallment, 1213.34);
  assert.equal(fullUseRepayment(0).maxInstallment, 0);
});

test("confirmed and proposed liens stay separate and no rupee is counted twice", () => {
  const position = creditPosition({ sdaBalance: 10000, otherRestrictions: 1000, confirmedLien: 0, level: 2 });
  assert.equal(position.availableSavings, 9000);
  assert.equal(position.confirmedLien, 0);
  assert.equal(position.proposedLien, 3500);
  assert.equal(position.additionalLienNeeded, 3500);
  assert.equal(position.availableAfterProposedLien, 5500);
  const existing = creditPosition({ sdaBalance: 50000, confirmedLien: 17500, level: 4 });
  assert.equal(existing.availableSavings, 32500);
  assert.equal(existing.proposedLien, 15000);
  assert.equal(existing.additionalLienNeeded, 0);
  assert.equal(existing.availableAfterProposedLien, 32500);
});

test("available credit subtracts the outstanding balance; no facility means no credit", () => {
  const withFacility = creditPosition({
    sdaBalance: 50000,
    confirmedLien: 17500,
    level: 2,
    facility: { approvedLimit: 17500, outstanding: 4200 },
  });
  assert.equal(withFacility.availableCredit, 13300);
  assert.equal(withFacility.outstanding, 4200);
  const none = creditPosition({ sdaBalance: 10000, level: 2 });
  assert.equal(none.facilityActive, false);
  assert.equal(none.availableCredit, 0);
  const over = creditPosition({ sdaBalance: 10000, facility: { approvedLimit: 2000, outstanding: 2500 } });
  assert.equal(over.availableCredit, 0);
  assert.equal(over.overLimit, true);
});

test("restrictions above the balance are flagged and never produce negative savings", () => {
  const position = creditPosition({ sdaBalance: 1000, otherRestrictions: 800, confirmedLien: 500, level: 1 });
  assert.equal(position.inconsistent, true);
  assert.equal(position.availableSavings, 0);
  const shortfall = creditPosition({ sdaBalance: 10000, otherRestrictions: 9000, level: 2 });
  assert.equal(shortfall.collateralShortfall, 2500);
});
