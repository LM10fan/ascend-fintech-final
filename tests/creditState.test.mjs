import test from "node:test";
import assert from "node:assert/strict";
import { defaultCredit, deriveCredit, sanitizeCredit } from "../src/features/ascend/data/creditState.js";
import { defaultSession, sanitizeSession, switchProfile } from "../src/features/ascend/data/demoStore.js";

const roundTrip = (value) => JSON.parse(JSON.stringify(value));

test("default credit state survives a storage round trip unchanged", () => {
  for (const id of ["aarav", "mira", "riya", "kabir", "dev", "neha"])
    assert.deepEqual(sanitizeCredit(roundTrip(defaultCredit(id)), id), defaultCredit(id));
  assert.deepEqual(sanitizeSession(roundTrip(defaultSession())), defaultSession());
});

test("tampered verification records are discarded instead of shown as verified", () => {
  const base = defaultCredit("aarav");
  const forged = sanitizeCredit({ ...base, sda: { status: "VERIFIED", balance: 999999 } }, "aarav");
  assert.equal(forged.sda.status, "NOT_STARTED");
  const overRestricted = sanitizeCredit(
    { ...base, sda: { status: "VERIFIED", balance: 100, otherRestrictions: 80, confirmedLien: 50, checkedAt: "2026-10-09T00:00:00Z", reference: "R" } },
    "aarav",
  );
  assert.equal(overRestricted.sda.status, "NOT_STARTED");
  const fakeAA = sanitizeCredit({ ...base, aa: { status: "ANALYZED" } }, "aarav");
  assert.equal(fakeAA.aa.status, "NOT_CONNECTED");
  const negative = sanitizeCredit({ ...base, demo: { ...base.demo, bankBalance: -5 } }, "aarav");
  assert.equal(negative.demo.bankBalance, 10000);
  const belowLien = sanitizeCredit({ ...defaultCredit("kabir"), demo: { ...defaultCredit("kabir").demo, bankBalance: 1000 } }, "kabir");
  assert.equal(belowLien.demo.bankBalance, 50000);
});

test("another applicant's credit data is never loaded under a different profile", () => {
  const kabir = { ...defaultCredit("kabir"), outstanding: 100 };
  const loaded = sanitizeCredit(kabir, "aarav");
  assert.equal(loaded.profileId, "aarav");
  assert.equal(loaded.outstanding, 0);
  const switched = switchProfile({ ...defaultSession(), credit: kabir, profileId: "kabir" }, "neha");
  assert.equal(switched.credit.profileId, "neha");
  assert.equal(switched.credit.sda.status, "NOT_STARTED");
});

test("invalid payments are dropped and success effects can't be claimed without success", () => {
  const credit = sanitizeCredit(
    {
      ...defaultCredit("aarav"),
      payments: [
        { transactionId: "T1", amount: 500, method: "UPI", purpose: "SDA_DEPOSIT", status: "PENDING", createdAt: "2026-10-09T00:00:00Z", applied: true },
        { transactionId: "T2", amount: -1, method: "UPI", purpose: "SDA_DEPOSIT", status: "SUCCESS", createdAt: "2026-10-09T00:00:00Z" },
        { transactionId: "T3", amount: 100, method: "CARD", purpose: "SDA_DEPOSIT", status: "SUCCESS", createdAt: "2026-10-09T00:00:00Z" },
      ],
    },
    "aarav",
  );
  assert.equal(credit.payments.length, 1);
  assert.equal(credit.payments[0].applied, false);
});

test("both pages derive identical numbers from one session", () => {
  const session = {
    ...defaultSession(),
    credit: {
      ...defaultCredit("aarav"),
      sda: { status: "VERIFIED", balance: 10000, otherRestrictions: 0, confirmedLien: 0, checkedAt: new Date().toISOString(), reference: "R", message: null },
    },
  };
  const first = deriveCredit(session);
  const second = deriveCredit(session);
  assert.equal(first.assessment.baseLimit, second.assessment.baseLimit);
  assert.equal(first.assessment.status, "PROVISIONAL");
  assert.equal(first.assessment.baseLimit, 2000);
  assert.equal(first.report, null);
  const bureau = { consentAt: "2026-10-09T00:00:00Z", requestId: "R1", retrievedAt: "2026-10-09T00:00:00Z", scenario: "RETRIEVED_THIN", identityVerified: false };
  const withReport = deriveCredit({ ...session, credit: { ...session.credit, bureau } });
  assert.equal(withReport.report.status, "RETRIEVED");
  assert.equal(withReport.report.simulated, true);
  assert.equal(withReport.report.verified, false);
});
