import test from "node:test";
import assert from "node:assert/strict";
import { INPUT_RANGE, modelFeatures, predictDefault, validateWeights } from "../src/features/ascend/domain/defaultModel.js";
import { RISK_MODEL_WEIGHTS } from "../src/features/ascend/domain/riskModelWeights.js";
import { createHybridModel, rulesModel, toFeatureVector } from "../src/features/ascend/domain/riskEngine.js";

const vector = (history, utilization = null) => ({
  ...toFeatureVector(null, null, history, null),
  bureauUtilization: utilization,
});
const pd = (history, utilization) => predictDefault(vector(history, utilization), RISK_MODEL_WEIGHTS).pd;

test("the shipped weights are valid and passed the training robustness checks", () => {
  assert.equal(validateWeights(RISK_MODEL_WEIGHTS), true);
  for (const variant of Object.values(RISK_MODEL_WEIGHTS.variants)) {
    assert.ok(variant.metrics.holdoutAuc >= 0.65);
    assert.ok(variant.metrics.holdoutEce <= 0.03);
  }
  assert.ok(RISK_MODEL_WEIGHTS.dataset.excludedColumns.includes("sex"));
});

test("a first-time applicant is never scored, so never penalised", () => {
  for (const history of [null, { onTime: 0, late: 0, missed: 0 }]) {
    const result = predictDefault(vector(history, 0.9), RISK_MODEL_WEIGHTS);
    assert.equal(result.available, false);
    assert.match(result.reason, /not treated as negative/);
  }
});

test("risk rises monotonically with late payments, missed payments and utilisation", () => {
  assert.ok(pd({ onTime: 5, late: 1, missed: 0 }) > pd({ onTime: 6, late: 0, missed: 0 }));
  assert.ok(pd({ onTime: 5, late: 0, missed: 1 }) > pd({ onTime: 5, late: 1, missed: 0 }));
  assert.ok(pd({ onTime: 3, late: 0, missed: 3 }) > pd({ onTime: 5, late: 0, missed: 1 }));
  assert.ok(pd({ onTime: 6, late: 0, missed: 0 }, 0.9) > pd({ onTime: 6, late: 0, missed: 0 }, 0.1));
});

test("clean histories score low and heavy delinquency scores high", () => {
  const clean = predictDefault(vector({ onTime: 8, late: 0, missed: 0 }, 0.14), RISK_MODEL_WEIGHTS);
  assert.equal(clean.band, "LOW");
  assert.equal(clean.variant, "history_utilization");
  const poor = predictDefault(vector({ onTime: 1, late: 1, missed: 4 }), RISK_MODEL_WEIGHTS);
  assert.equal(poor.band, "HIGH");
  assert.equal(poor.variant, "history");
  assert.equal(poor.contributions[0].feature, "missedShare");
});

test("out-of-range inputs are clipped to the training range, not extrapolated", () => {
  const features = modelFeatures({ onTime: 500, late: 0, missed: 0 }, 40);
  assert.equal(features.repayments, Math.log1p(INPUT_RANGE.maxRepayments));
  assert.equal(features.utilization, INPUT_RANGE.maxUtilization);
  const score = pd({ onTime: 500, late: 0, missed: 0 }, 40);
  assert.ok(score > 0 && score < 1);
});

test("missing or corrupt weights degrade to rules-only instead of failing", () => {
  const corrupt = structuredClone(RISK_MODEL_WEIGHTS);
  corrupt.variants.history.coefficients.missedShare = "NaN";
  for (const weights of [null, {}, corrupt]) {
    const v = vector({ onTime: 1, late: 1, missed: 4 });
    assert.equal(predictDefault(v, weights).available, false);
    const hybrid = createHybridModel(weights).riskCap(v);
    assert.deepEqual({ ...hybrid, ml: undefined }, { ...rulesModel.riskCap(v), ml: undefined });
  }
});

test("the model can lower the rules' cap but never raise it", () => {
  const hybrid = createHybridModel();
  const cases = [
    { history: { onTime: 12, late: 0, missed: 0 }, utilization: 0.1 },
    { history: { onTime: 12, late: 1, missed: 0 }, utilization: 1.2 },
    { history: { onTime: 4, late: 0, missed: 2 }, utilization: null },
    { history: { onTime: 2, late: 2, missed: 0 }, utilization: 0.95 },
  ];
  for (const { history, utilization } of cases) {
    const v = { ...vector(history, utilization), confidence: "HIGH" };
    const rules = rulesModel.riskCap(v);
    const result = hybrid.riskCap(v);
    assert.ok(result.cap <= rules.cap);
    if (result.ml.band !== "LOW") assert.equal(result.manualReview, true);
  }
});
