import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLender,
  validateLender,
  editLender,
  verifyLender,
  sanitizeLender,
  ORGANIZATIONS,
  REVIEWER_ROLES,
  LENDING_FOCUSES,
} from "../src/features/ascend/data/lender.js";
const complete = () => ({
  ...defaultLender(),
  organizationId: ORGANIZATIONS[0].id,
  reviewerRole: REVIEWER_ROLES[0],
  focus: LENDING_FOCUSES[0],
  confirmed: true,
});
test("onboarding requires organization, role, focus and demo acknowledgement", () => {
  assert.equal(Object.keys(validateLender(defaultLender())).length, 4);
  assert.throws(() => verifyLender(defaultLender()));
  assert.deepEqual(validateLender(complete()), {});
});
test("simulated verification records status and time, edits require re-verification", () => {
  const verified = verifyLender(complete(), "2026-10-09T00:00:00Z");
  assert.equal(verified.status, "verified");
  assert.equal(verified.verifiedAt, "2026-10-09T00:00:00Z");
  assert.deepEqual(sanitizeLender(verified), verified);
  const edited = editLender(verified, { focus: LENDING_FOCUSES[1] });
  assert.equal(edited.status, "draft");
  assert.equal(edited.verifiedAt, null);
});
test("unknown identities and incomplete local verification flags are discarded", () => {
  const cleaned = sanitizeLender({
    organizationId: "real-company",
    email: "real@example.com",
    status: "verified",
    verifiedAt: "2026-10-09T00:00:00Z",
  });
  assert.deepEqual(cleaned, defaultLender());
  assert.equal(
    sanitizeLender({
      ...complete(),
      status: "verified",
      verifiedAt: "bad-date",
    }).status,
    "draft",
  );
});
test("every available lender identity is a deliberately synthetic fixture", () => {
  for (const organization of ORGANIZATIONS) {
    assert.match(organization.name, /Demo/);
    assert.match(organization.email, /\.example\.test$/);
    assert.match(organization.registration, /^DEMO-ORG-/);
  }
});
