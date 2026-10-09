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
} from "../src/features/ascend/data/demoStore.js";
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
