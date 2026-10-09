// Allowlisted partner organizations.
export const ORGANIZATIONS = Object.freeze([
  {
    id: "campus",
    name: "Campus Finance",
    type: "NBFC",
    city: "Mumbai",
    email: "reviewer@campusfinance.test",
    registration: "ASC-PARTNER-001",
  },
  {
    id: "learning",
    name: "Learning Credit",
    type: "Co-operative",
    city: "Pune",
    email: "reviewer@learningcredit.test",
    registration: "ASC-PARTNER-002",
  },
]);
export const REVIEWER_ROLES = ["Credit analyst", "Risk reviewer"];
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
    errors.organizationId = "Choose your organization.";
  if (!REVIEWER_ROLES.includes(value.reviewerRole))
    errors.reviewerRole = "Choose your reviewer role.";
  if (!LENDING_FOCUSES.includes(value.focus))
    errors.focus = "Choose a lending focus.";
  if (value.confirmed !== true)
    errors.confirmed = "Confirm that these reviewer details are correct.";
  return errors;
}
export function editLender(value, changes) {
  return { ...value, ...changes, status: "draft", verifiedAt: null };
}
export function verifyLender(value, now = new Date().toISOString()) {
  if (Object.keys(validateLender(value)).length)
    throw new Error("Complete the organization information.");
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
