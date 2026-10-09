import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBureauProvider,
  createDemoPaymentProvider,
  createDemoSDAProvider,
  createDemoAAProvider,
} from "../src/features/ascend/integrations/demoServices.js";

const upi = { amount: 1500, currency: "INR", method: "UPI", purpose: "SDA_DEPOSIT", upiId: "aarav@demo" };

test("UPI and net-banking payments are created only with valid details", async () => {
  const provider = createDemoPaymentProvider();
  await assert.rejects(provider.createPayment({ ...upi, idempotencyKey: "a", upiId: "not-an-id" }), /UPI ID/);
  await assert.rejects(provider.createPayment({ ...upi, idempotencyKey: "b", amount: 0 }), /Amount/);
  await assert.rejects(provider.createPayment({ ...upi, idempotencyKey: "c", method: "NETBANKING", bankId: "real-bank" }), /bank/);
  await assert.rejects(provider.createPayment({ ...upi, idempotencyKey: "d", purpose: "LOAN_DISBURSAL" }), /for/);
  const nb = await provider.createPayment({ ...upi, idempotencyKey: "e", method: "NETBANKING", bankId: "sample-national" });
  assert.equal(nb.status, "AWAITING_USER_ACTION");
  assert.equal(nb.checkout.kind, "SIMULATED_HOSTED_CHECKOUT");
});

test("a verified success comes from the provider record, not the browser", async () => {
  const provider = createDemoPaymentProvider();
  const created = await provider.createPayment({ ...upi, idempotencyKey: "k1" });
  const claim = provider.simulateCheckout(created.transactionId, "SUCCESS");
  const result = await provider.handlePaymentReturn(claim);
  assert.equal(result.verified, true);
  assert.equal(result.status, "SUCCESS");
  assert.match(result.reference, /^UTR-/);
});

test("a forged success claim after a failed payment is not trusted", async () => {
  const provider = createDemoPaymentProvider();
  const created = await provider.createPayment({ ...upi, idempotencyKey: "k2" });
  provider.simulateCheckout(created.transactionId, "FAILED");
  const result = await provider.handlePaymentReturn({ transactionId: created.transactionId, status: "SUCCESS" });
  assert.equal(result.verified, false);
  assert.equal(result.status, "FAILED");
  assert.equal(result.mismatch, true);
  const unknown = await provider.handlePaymentReturn({ transactionId: "DEMO-TXN-FAKE", status: "SUCCESS" });
  assert.equal(unknown.verified, false);
  assert.equal(unknown.status, "UNKNOWN");
});

test("pending payments stay unverified until the provider settles them", async () => {
  const provider = createDemoPaymentProvider();
  const created = await provider.createPayment({ ...upi, idempotencyKey: "k3" });
  provider.simulateCheckout(created.transactionId, "PENDING");
  assert.equal((await provider.getPaymentStatus(created.transactionId)).status, "PENDING");
  assert.equal(provider.simulateSettlement(created.transactionId, "SUCCESS"), true);
  assert.equal((await provider.getPaymentStatus(created.transactionId)).status, "SUCCESS");
  assert.equal(provider.simulateSettlement(created.transactionId, "FAILED"), false);
});

test("cancelled payments are final and cannot be re-completed", async () => {
  const provider = createDemoPaymentProvider();
  const created = await provider.createPayment({ ...upi, idempotencyKey: "k4" });
  provider.simulateCheckout(created.transactionId, "CANCELLED");
  assert.equal(provider.simulateCheckout(created.transactionId, "SUCCESS"), null);
  assert.equal((await provider.getPaymentStatus(created.transactionId)).status, "CANCELLED");
});

test("the same idempotency key never creates a second payment", async () => {
  const provider = createDemoPaymentProvider();
  const first = await provider.createPayment({ ...upi, idempotencyKey: "same" });
  provider.simulateCheckout(first.transactionId, "SUCCESS");
  const retry = await provider.createPayment({ ...upi, idempotencyKey: "same" });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.transactionId, first.transactionId);
  assert.equal(retry.status, "SUCCESS");
});

test("SDA verification reports every outcome honestly and never marks a lien", async () => {
  const provider = createDemoSDAProvider();
  const ok = await provider.verifyBalance({ bankBalance: 10000, otherRestrictions: 0, confirmedLien: 0 });
  assert.equal(ok.status, "VERIFIED");
  assert.equal(ok.balance, 10000);
  assert.equal(ok.confirmedLien, 0);
  for (const [outcome, status] of [["PENDING", "PENDING"], ["TIMEOUT", "TIMEOUT"], ["FAILURE", "FAILED"]]) {
    const result = await provider.verifyBalance({ bankBalance: 10000, otherRestrictions: 0, confirmedLien: 0, outcome });
    assert.equal(result.status, status);
    assert.equal(result.balance, undefined);
    assert.equal(result.checkedAt, undefined);
  }
});

test("bureau requests need consent and normalize only returned fields", async () => {
  const bureau = createDemoBureauProvider();
  await assert.rejects(bureau.requestCreditReport({ userId: "aarav", scenario: "NO_HISTORY" }), /Consent/);
  const fetch = async (scenario, identityVerified = false) => {
    const { requestId } = await bureau.requestCreditReport({ userId: "u", consentReference: "c", scenario, identityVerified });
    const { payload } = await bureau.getCreditReportStatus(requestId);
    return bureau.normalizeCreditReport(payload, { requestId, retrievedAt: "2026-10-09T00:00:00Z" });
  };
  const clean = await fetch("RETRIEVED_CLEAN");
  assert.equal(clean.status, "RETRIEVED");
  assert.equal(clean.simulated, true);
  assert.equal(clean.verified, false);
  assert.equal(clean.adverse, false);
  assert.equal(clean.utilization, 0.14);
  const adverse = await fetch("RETRIEVED_ADVERSE");
  assert.equal(adverse.adverse, true);
  const none = await fetch("NO_HISTORY");
  assert.equal(none.status, "NO_HISTORY");
  assert.equal(none.score, undefined);
  assert.equal((await fetch("IDENTITY_REQUIRED")).status, "IDENTITY_REQUIRED");
  assert.equal((await fetch("IDENTITY_REQUIRED", true)).status, "NO_HISTORY");
  assert.equal((await fetch("PROVIDER_UNAVAILABLE")).status, "PROVIDER_UNAVAILABLE");
  assert.equal((await fetch("TIMEOUT")).status, "FAILED");
});

test("a simulated payload can never be normalized as verified", () => {
  const bureau = createDemoBureauProvider();
  const forged = bureau.normalizeCreditReport(
    { outcome: "SUCCESS", simulated: true, verified: true, score: 800, accounts: [] },
    { requestId: "x", retrievedAt: "2026-10-09T00:00:00Z" },
  );
  assert.equal(forged.verified, false);
});

test("AA consent requires a known account and data fetch requires consent", async () => {
  const aa = createDemoAAProvider();
  await assert.rejects(aa.createConsent({ fipId: "unknown" }), /bank account/);
  const consent = await aa.createConsent({ fipId: "demo-bank", purpose: "test" });
  assert.equal(consent.status, "ACTIVE");
  await assert.rejects(aa.fetchFIData({ consentId: null, profileId: "aarav" }), /consent/);
  const data = await aa.fetchFIData({ consentId: consent.consentId, profileId: "aarav" });
  assert.equal(data.source, "DEMO_FIXTURE");
  assert.ok(data.transactions.length > 100);
});
