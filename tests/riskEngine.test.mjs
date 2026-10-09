import test from "node:test";
import assert from "node:assert/strict";
import { assessCreditProfile, toFeatureVector, ENGINE } from "../src/features/ascend/domain/riskEngine.js";
import { extractFeatures } from "../src/features/ascend/domain/aaFeatures.js";
import {
  CREDIT_FIXTURES,
  STATEMENT_AS_OF,
  defaultDemoSettings,
  demoBureauPayload,
  generateStatement,
} from "../src/features/ascend/data/creditProfiles.js";
import { normalizeCreditReport } from "../src/features/ascend/integrations/demoServices.js";

const now = "2026-10-09T10:00:00.000Z";
const features = (id, overrides = {}) =>
  extractFeatures(generateStatement(id, { ...defaultDemoSettings(id), ...overrides }), { asOf: STATEMENT_AS_OF });
const sda = (balance, extra = {}) => ({
  status: "VERIFIED",
  balance,
  otherRestrictions: 0,
  confirmedLien: 0,
  checkedAt: "2026-10-09T09:00:00.000Z",
  ...extra,
});
const report = (scenario) =>
  normalizeCreditReport(demoBureauPayload(scenario), { requestId: "TEST", retrievedAt: "2026-10-09T09:30:00.000Z" });
function assessFixture(id, overrides = {}) {
  const fixture = CREDIT_FIXTURES[id];
  const settings = { ...defaultDemoSettings(id), ...overrides };
  return assessCreditProfile(
    features(id, overrides),
    sda(settings.bankBalance, { otherRestrictions: fixture.otherRestrictions, confirmedLien: fixture.facility?.confirmedLien ?? 0 }),
    { onTime: settings.onTime, late: settings.late, missed: settings.missed },
    null,
    { now, facility: fixture.facility },
  );
}

test("the six demo profiles produce meaningfully different, conservative outcomes", () => {
  const results = Object.fromEntries(Object.keys(CREDIT_FIXTURES).map((id) => [id, assessFixture(id)]));
  assert.equal(results.aarav.recommendedLevel, 2);
  assert.equal(results.aarav.status, "READY_FOR_LENDER_REVIEW");
  assert.equal(results.mira.recommendedLevel, 1);
  assert.equal(results.mira.affordability.status, "TIGHT");
  assert.equal(results.mira.manualReviewRequired, true);
  assert.equal(results.riya.recommendedLevel, 1);
  assert.equal(results.kabir.recommendedLevel, 4);
  assert.equal(results.kabir.manualReviewRequired, true);
  assert.equal(results.kabir.fastTrack.eligible, true);
  assert.equal(results.dev.status, "PROVISIONAL");
  assert.equal(results.dev.recommendedLevel, 1);
  assert.equal(results.neha.status, "PAUSE");
  assert.equal(results.neha.recommendedLevel, null);
  assert.equal(results.neha.eligibleToProceed, false);
  assert.ok(Object.values(results).filter((r) => (r.recommendedLevel ?? 0) >= 3).length === 1);
});

test("recommended terms always come from the central ladder module", () => {
  const result = assessFixture("aarav");
  assert.equal(result.baseLimit, 3500);
  assert.equal(result.proposedLien, 3500);
  assert.equal(result.unsecuredExposure, 0);
  assert.deepEqual(
    result.levels.map((row) => [row.baseLimit, row.proposedLien]),
    [[2000, 2000], [3500, 3500], [5000, 1750], [6000, 3000], [7000, 0]],
  );
});

test("a different SDA balance after assessment changes limits consistently", () => {
  const before = assessFixture("aarav");
  const after = assessFixture("aarav", { bankBalance: 20000 });
  assert.equal(after.recommendedLevel, 1);
  assert.equal(after.baseLimit, 4000);
  assert.ok(after.reasons.some((reason) => reason.includes("steps down to Level 1")));
  assert.notEqual(before.baseLimit, after.baseLimit);
});

test("missing AA data gives a provisional, fully secured start, not a rejection", () => {
  const result = assessCreditProfile(null, sda(10000), null, null, { now });
  assert.equal(result.status, "PROVISIONAL");
  assert.equal(result.recommendedLevel, 1);
  assert.equal(result.affordability.status, "UNKNOWN");
  assert.equal(result.eligibleToProceed, true);
  assert.equal(result.manualReviewRequired, true);
  assert.ok(result.missing.some((item) => item.includes("Account Aggregator")));
  assert.equal(result.confidence, "INSUFFICIENT");
});

test("unverified, failed or zero SDA balances never yield a recommendation", () => {
  for (const status of ["NOT_STARTED", "PENDING", "TIMEOUT", "FAILED"]) {
    const result = assessCreditProfile(features("aarav"), { status, balance: 10000 }, null, null, { now });
    assert.equal(result.status, "INCOMPLETE");
    assert.equal(result.recommendedLevel, null);
    assert.equal(result.eligibleToProceed, false);
    assert.equal(result.position, null);
  }
  const zero = assessCreditProfile(features("aarav"), sda(0), null, null, { now });
  assert.equal(zero.status, "INCOMPLETE");
  assert.equal(zero.recommendedLevel, null);
  assert.ok(zero.riskFlags.some((flag) => flag.code === "INSUFFICIENT_BALANCE"));
});

test("a stale SDA check blocks progress until refreshed", () => {
  const result = assessCreditProfile(features("aarav"), sda(10000, { checkedAt: "2026-10-07T09:00:00.000Z" }), null, null, { now });
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.eligibleToProceed, false);
  assert.ok(result.riskFlags.some((flag) => flag.code === "SDA_STALE"));
  assert.ok(result.missing.some((item) => item.includes("fresh SDA")));
});

test("existing liens restrict savings and are carried into the position", () => {
  const result = assessFixture("kabir");
  assert.equal(result.verifiedCollateral, 17500);
  assert.equal(result.position.confirmedLien, 17500);
  assert.equal(result.position.availableSavings, 32500);
  assert.equal(result.position.proposedLien, 15000);
  assert.equal(result.position.availableCredit, 13300);
});

test("insufficient free cash flow and large existing repayments lead to a pause", () => {
  const strained = assessFixture("aarav", { existingEmi: 3000 });
  assert.equal(strained.status, "PAUSE");
  assert.equal(strained.recommendedLevel, null);
  assert.ok(strained.reasons.at(-1).includes("pausing"));
  const lowIncome = assessFixture("aarav", { incomeScale: 50 });
  assert.equal(lowIncome.recommendedLevel, null);
});

test("incomplete coverage caps the level and is reported as missing information", () => {
  const result = assessFixture("aarav", { coverageMonths: 4 });
  assert.equal(result.confidence, "LOW");
  assert.equal(result.recommendedLevel, 1);
  assert.equal(result.status, "PROVISIONAL");
  const medium = assessFixture("aarav", { coverageMonths: 9 });
  assert.equal(medium.confidence, "MEDIUM");
  assert.ok(medium.recommendedLevel <= 2);
});

test("no credit history is not negative; a high score alone never upgrades", () => {
  const aa = features("aarav");
  const base = assessCreditProfile(aa, sda(10000), { onTime: 0, late: 0, missed: 0 }, null, { now });
  const noHit = assessCreditProfile(aa, sda(10000), { onTime: 0, late: 0, missed: 0 }, report("NO_HISTORY"), { now });
  assert.equal(noHit.recommendedLevel, base.recommendedLevel);
  assert.ok(noHit.reasons.some((reason) => reason.includes("not treated as negative")));
  const clean = assessCreditProfile(aa, sda(10000), { onTime: 0, late: 0, missed: 0 }, report("RETRIEVED_CLEAN"), { now });
  assert.ok(clean.recommendedLevel <= 3);
  assert.ok(clean.riskCap <= 3);
  const kabirClean = assessCreditProfile(
    features("kabir"),
    sda(50000, { confirmedLien: 17500 }),
    { onTime: 8, late: 0, missed: 0 },
    report("RETRIEVED_CLEAN"),
    { now },
  );
  assert.equal(kabirClean.recommendedLevel, 4);
});

test("adverse bureau data caps unsecured levels and requires review", () => {
  const result = assessCreditProfile(
    features("kabir"),
    sda(50000, { confirmedLien: 17500 }),
    { onTime: 8, late: 0, missed: 0 },
    report("RETRIEVED_ADVERSE"),
    { now },
  );
  assert.ok(result.recommendedLevel <= 2);
  assert.ok(result.riskFlags.some((flag) => flag.code === "BUREAU_ADVERSE"));
  assert.equal(result.manualReviewRequired, true);
});

test("repayment history unlocks levels only alongside affordability", () => {
  assert.equal(assessFixture("kabir", { onTime: 2 }).recommendedLevel, 2);
  assert.equal(assessFixture("kabir", { onTime: 4 }).recommendedLevel, 3);
  const apex = assessFixture("kabir", { onTime: 12 });
  assert.equal(apex.recommendedLevel, 5);
  assert.equal(apex.manualReviewRequired, true);
  assert.equal(apex.proposedLien, 0);
  assert.equal(assessFixture("kabir", { missed: 1 }).recommendedLevel, 2);
});

test("fast-track is an expedited review route, never an approval, and needs every check", () => {
  const kabir = assessFixture("kabir");
  assert.equal(kabir.fastTrack.eligible, true);
  assert.equal(kabir.status, "READY_FOR_LENDER_REVIEW");
  const aarav = assessFixture("aarav");
  assert.equal(aarav.fastTrack.eligible, false);
  assert.ok(aarav.fastTrack.checks.some((check) => !check.met));
});

test("the feature vector keeps missing inputs as null for the model", () => {
  const vector = toFeatureVector(null, { status: "FAILED" }, null, null);
  assert.equal(vector.freeCashFlow, null);
  assert.equal(vector.sdaBalance, null);
  assert.equal(vector.onTime, null);
  assert.equal(vector.bureauAdverse, null);
  assert.equal(vector.bureauUtilization, null);
  assert.equal(ENGINE.trainedModel, true);
});

test("malformed repayment counts are treated as missing, not as zero", () => {
  for (const history of [{ onTime: -1, late: 0, missed: 0 }, { onTime: NaN, late: 0, missed: 0 }, { onTime: 3, late: "x", missed: 0 }]) {
    const vector = toFeatureVector(null, null, history, null);
    assert.equal(vector.onTime, null);
    assert.equal(vector.missed, null);
  }
  assert.equal(toFeatureVector(null, null, { onTime: "4", late: 0, missed: 0 }, null).onTime, 4);
});

test("the risk model is replaceable behind the same interface", () => {
  const strict = { id: "test-model", riskCap: () => ({ cap: 1, binding: [{ level: 1, reason: "Test cap" }], caps: [], manualReview: false }) };
  const result = assessCreditProfile(features("kabir"), sda(50000, { confirmedLien: 17500 }), { onTime: 12, late: 0, missed: 0 }, null, { now, model: strict });
  assert.equal(result.recommendedLevel, 1);
  assert.equal(result.engine.modelId, "test-model");
  assert.ok(result.reasons.includes("Test cap"));
});
