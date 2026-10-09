import test from "node:test";
import assert from "node:assert/strict";
import { defaultSession } from "../src/features/ascend/data/demoStore.js";
import { deriveCredit } from "../src/features/ascend/data/creditState.js";
import { REPORT_VERSION, buildAssessmentReport, reportFileName } from "../src/features/ascend/data/report.js";

const now = "2026-10-09T10:00:00.000Z";
function analysedSession() {
  const session = defaultSession();
  return {
    ...session,
    credit: {
      ...session.credit,
      aa: { ...session.credit.aa, status: "ANALYZED", fipId: "demo-bank", consentId: "C-1", consentedAt: now, analyzedAt: now },
      sda: { status: "VERIFIED", balance: 10000, otherRestrictions: 0, confirmedLien: 0, checkedAt: "2026-10-09T09:00:00.000Z", reference: "R-1", message: null },
    },
  };
}

test("the report carries every section and matches the assessment the page shows", () => {
  const session = analysedSession();
  const model = deriveCredit(session, now);
  const report = buildAssessmentReport(session, model, now);
  assert.equal(report.reportVersion, REPORT_VERSION);
  for (const key of ["applicant", "application", "accountAggregator", "sda", "bureau", "repaymentHistory", "assessment", "riskModel", "payments"])
    assert.ok(key in report, `missing ${key}`);
  assert.equal(report.assessment.recommendedLevel, model.assessment.recommendedLevel);
  assert.equal(report.assessment.baseLimit, model.assessment.baseLimit);
  assert.equal(report.accountAggregator.analysis.monthly.length, 12);
  assert.equal(report.accountAggregator.account, "Ascend Partner Bank · Savings ••4821");
  assert.equal(report.sda.balance, 10000);
  assert.ok(report.riskModel.model.id);
  assert.match(report.applicant.aadhaar, /^XXXX XXXX \d{4}$/, "identity numbers stay masked");
  assert.ok(!JSON.stringify(report).includes("narration"), "raw statement lines are not exported");
});

test("an empty session still produces a valid report with nulls, never fabricated values", () => {
  const session = defaultSession();
  const report = buildAssessmentReport(session, deriveCredit(session, now), now);
  assert.equal(report.accountAggregator.analysis, null);
  assert.equal(report.sda.balance, null);
  assert.equal(report.bureau, null);
  assert.equal(report.assessment.recommendedLevel, null);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(report)));
  assert.equal(reportFileName(session, now), "ascend-assessment-report-aarav-2026-10-09.json");
});
