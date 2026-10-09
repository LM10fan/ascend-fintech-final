// Allowlisted organizations only. These are not real lender identities or licences.
export const ORGANIZATIONS = Object.freeze([
  {
    id: "campus",
    name: "Campus Finance · Demo",
    type: "Illustrative NBFC",
    city: "Mumbai",
    email: "reviewer@campus.example.test",
    registration: "DEMO-ORG-001",
  },
  {
    id: "learning",
    name: "Learning Credit · Demo",
    type: "Illustrative cooperative",
    city: "Pune",
    email: "reviewer@learning.example.test",
    registration: "DEMO-ORG-002",
  },
]);
export const REVIEWER_ROLES = ["Credit analyst · Demo", "Risk reviewer · Demo"];
export const LENDING_FOCUSES = ["Education essentials", "Productive purchases"];
export const defaultLender = () => ({
  organizationId: "",
  reviewerRole: "",
  focus: "",
  confirmed: false,
  status: "draft",
  verifiedAt: null,
});
export function validateLender(value) {
  const errors = {};
  if (!ORGANIZATIONS.some((org) => org.id === value.organizationId))
    errors.organizationId = "Choose a synthetic organization.";
  if (!REVIEWER_ROLES.includes(value.reviewerRole))
    errors.reviewerRole = "Choose a demo reviewer role.";
  if (!LENDING_FOCUSES.includes(value.focus))
    errors.focus = "Choose a lending focus.";
  if (value.confirmed !== true)
    errors.confirmed = "Confirm that this is a synthetic reviewer profile.";
  return errors;
}
export function editLender(value, changes) {
  return { ...value, ...changes, status: "draft", verifiedAt: null };
}
export function verifyLender(value, now = new Date().toISOString()) {
  if (Object.keys(validateLender(value)).length)
    throw new Error("Complete the demo organization information.");
  return { ...value, status: "verified", verifiedAt: now };
}
export function sanitizeLender(raw) {
  const value = defaultLender();
  if (!raw) return value;
  if (ORGANIZATIONS.some((org) => org.id === raw.organizationId))
    value.organizationId = raw.organizationId;
  if (REVIEWER_ROLES.includes(raw.reviewerRole))
    value.reviewerRole = raw.reviewerRole;
  if (LENDING_FOCUSES.includes(raw.focus)) value.focus = raw.focus;
  value.confirmed = raw.confirmed === true;
  if (
    raw.status === "verified" &&
    !Object.keys(validateLender(value)).length &&
    typeof raw.verifiedAt === "string" &&
    Number.isFinite(Date.parse(raw.verifiedAt))
  ) {
    value.status = "verified";
    value.verifiedAt = raw.verifiedAt;
  }
  return value;
}
