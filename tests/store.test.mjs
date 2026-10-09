import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE_KEY,
  createDemoStore,
  defaultSession,
  hasConsent,
  recordConsent,
  withdrawConsent,
  sanitizeSession,
  updateScenarioInputs,
  setConsentChoice,
} from "../src/features/ascend/data/demoStore.js";

test("shared financial drafts survive reload without calculating invalid values", () => {
  const store = createDemoStore(memoryStorage());
  let session = updateScenarioInputs(defaultSession(), {
    income: "6200",
    existingDebt: "100",
  });
  assert.equal(session.scenario.income, 6200);
  assert.equal(session.scenario.existingDebt, 100);
  assert.equal(session.history, "existing");
  session = updateScenarioInputs(session, { income: "" });
  store.save(session);
  session = store.load().session;
  assert.equal(session.inputDraft.income, "");
  assert.equal(session.scenario.income, 6200);
  session = updateScenarioInputs(session, { income: "7000" });
  assert.equal(session.scenario.income, 7000);
  assert.equal(session.scenario.existingDebt, 100);
});
test("partial consent choices persist but do not activate a record", () => {
  const store = createDemoStore(memoryStorage());
  const session = setConsentChoice(defaultSession(), "evidence", true);
  store.save(session);
  const loaded = store.load().session;
  assert.equal(loaded.consentChoices.evidence, true);
  assert.equal(loaded.consentChoices.cashflow, false);
  assert.equal(hasConsent(loaded), false);
  assert.equal(loaded.consent, null);
});
test("editing a recorded consent scope revokes the record while retaining draft choices", () => {
  const initial = recordConsent(defaultSession(), {
    evidence: true,
    cashflow: true,
    bureau: false,
  });
  const edited = setConsentChoice(initial, "bureau", true);
  assert.equal(hasConsent(edited), false);
  assert.ok(edited.consent.revokedAt);
  assert.deepEqual(edited.consentChoices, {
    evidence: true,
    cashflow: true,
    bureau: true,
  });
  assert.equal(hasConsent(recordConsent(edited, edited.consentChoices)), true);
  assert.deepEqual(withdrawConsent(edited).consentChoices, {
    evidence: false,
    cashflow: false,
    bureau: false,
  });
});
test("legacy v1 sessions migrate without losing finance, consent or registration", () => {
  const legacy = recordConsent(defaultSession(), {
    evidence: true,
    cashflow: true,
    bureau: true,
  });
  delete legacy.inputDraft;
  delete legacy.consentChoices;
  delete legacy.lender;
  legacy.scenario.income = 7200;
  legacy.lenderRegistered = true;
  const restored = sanitizeSession(legacy);
  assert.equal(restored.scenario.income, 7200);
  assert.equal(restored.inputDraft.income, 7200);
  assert.deepEqual(restored.consentChoices, legacy.consent.scopes);
  assert.equal(hasConsent(restored), true);
  assert.equal(restored.lenderRegistered, true);
  assert.equal(restored.lender.status, "draft"); // No invented verification.
});
test("draft storage is allowlisted and mismatched choices cannot keep consent active", () => {
  const input = recordConsent(defaultSession(), {
    evidence: true,
    cashflow: true,
    bureau: true,
  });
  const restored = sanitizeSession({
    ...input,
    consentChoices: { evidence: false },
    inputDraft: {
      ...input.inputDraft,
      income: "personal@example.com",
      pan: "personal",
    },
  });
  assert.equal(restored.inputDraft.income, "");
  assert.equal("pan" in restored.inputDraft, false);
  assert.equal(hasConsent(restored), false);
  assert.equal(restored.scenario.income, 6000);
});
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    data,
  };
}
test("consent starts unchecked, needs both required scopes and records the exact choices", () => {
  const initial = defaultSession();
  assert.equal(hasConsent(initial), false);
  assert.throws(() =>
    recordConsent(initial, { evidence: true, cashflow: false }),
  );
  const recorded = recordConsent(
    initial,
    { evidence: true, cashflow: true, bureau: false },
    "2026-10-09T00:00:00Z",
  );
  assert.equal(hasConsent(recorded), true);
  assert.equal(recorded.consent.scopes.bureau, false);
  assert.equal(recorded.consent.recordedAt, "2026-10-09T00:00:00Z");
  const withdrawn = withdrawConsent(recorded, "2026-10-09T00:05:00Z");
  assert.equal(hasConsent(withdrawn), false);
  assert.equal(withdrawn.mode, "manual");
  assert.equal(withdrawn.consent.revokedAt, "2026-10-09T00:05:00Z");
});
test("save/load restores a valid session and filters identity fields", () => {
  const storage = memoryStorage();
  const store = createDemoStore(storage);
  const session = recordConsent(defaultSession(), {
    evidence: true,
    cashflow: true,
    bureau: true,
  });
  assert.equal(
    store.save({ ...session, pan: "untrusted-input", name: "untrusted-input" })
      .ok,
    true,
  );
  assert.deepEqual(store.load().session, session);
  assert.equal(storage.getItem(STORE_KEY).includes("untrusted-input"), false);
});
test("deletion removes only this feature’s namespace", () => {
  const storage = memoryStorage();
  const store = createDemoStore(storage);
  storage.setItem("teammate:page", "preserve-me");
  store.save(defaultSession());
  assert.equal(store.clear().ok, true);
  assert.equal(storage.getItem(STORE_KEY), null);
  assert.equal(storage.getItem("teammate:page"), "preserve-me");
});
test("corrupt, blocked and missing storage recover without pretending persistence", () => {
  const storage = memoryStorage();
  storage.setItem(STORE_KEY, "{broken");
  assert.ok(createDemoStore(storage).load().warning);
  const blocked = createDemoStore({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  });
  assert.ok(blocked.load().warning);
  assert.equal(blocked.save(defaultSession()).ok, false);
  assert.equal(blocked.clear().ok, false);
  assert.equal(createDemoStore(null).save(defaultSession()).ok, false);
});
test("tampered values cannot activate consent or load invalid finance", () => {
  assert.equal(
    sanitizeSession({ ...defaultSession(), mode: "consented" }).mode,
    "reference",
  );
  assert.equal(
    sanitizeSession({
      ...defaultSession(),
      profileId: "injected",
      purpose: "injected",
    }).profileId,
    "aarav",
  );
  assert.throws(() =>
    sanitizeSession({ ...defaultSession(), scenario: { income: -1 } }),
  );
});
