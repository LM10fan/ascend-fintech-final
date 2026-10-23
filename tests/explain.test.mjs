import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCENARIO, simulate } from "../src/features/ascend/domain/cashflow.js";
import { explainDecision } from "../src/features/ascend/domain/explain.js";

test("aligned reference scenario has an advisory-only explanation", () => {
  const explanation = explainDecision(simulate(DEFAULT_SCENARIO, { months: 3 }));
  assert.equal(explanation.status, "REVIEWABLE");
  assert.deepEqual(explanation.reasons.map((reason) => reason.code), ["FLOW_ALIGNED"]);
  assert.match(explanation.disclaimer, /Not a credit score, approval/);
});

test("delayed stipend explains dated liquidity shortfall", () => {
  const explanation = explainDecision(simulate({ ...DEFAULT_SCENARIO, stipendDay: 20 }, { months: 3 }));
  assert.equal(explanation.status, "PAUSE");
  assert.deepEqual(explanation.reasons.map((reason) => reason.code), ["BUFFER_BREACH"]);
  assert.equal(explanation.reasons[0].amount, 3470);
  assert.equal(explanation.reasons[0].day, 12);
});

test("recurring deficit remains visible even when opening cash is large", () => {
  const explanation = explainDecision(simulate({ ...DEFAULT_SCENARIO, income: 4000, openingBalance: 50000 }, { months: 3 }));
  assert.deepEqual(explanation.reasons.map((reason) => reason.code), ["MONTHLY_DEFICIT"]);
  assert.equal(explanation.reasons[0].amount, 1470);
});

test("independent failures both appear instead of hiding the secondary risk", () => {
  const explanation = explainDecision(simulate({ ...DEFAULT_SCENARIO, income: 4000, stipendDay: 20 }, { months: 3 }));
  assert.deepEqual(explanation.reasons.map((reason) => reason.code), ["MONTHLY_DEFICIT", "BUFFER_BREACH"]);
});

test("rejects non-result values", () => {
  assert.throws(() => explainDecision(null), TypeError);
  assert.throws(() => explainDecision({ status: "APPROVED" }), TypeError);
});
