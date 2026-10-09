/**
 * Shared credit state: allowlisted persistence shape plus one derivation used by every page.
 * Only synthetic demo state is persisted. Bureau reports are regenerated from the demo
 * scenario rather than stored; live integrations must keep reports server-side.
 */
import {
  BUREAU_SCENARIOS,
  STATEMENT_AS_OF,
  defaultDemoSettings,
  demoBureauPayload,
  effectiveBureauScenario,
  fixtureFor,
  generateStatement,
} from "./creditProfiles.js";
import { extractFeatures } from "../domain/aaFeatures.js";
import { assessCreditProfile } from "../domain/riskEngine.js";
import { amountError } from "../domain/creditLadder.js";
import { normalizeScenario } from "../domain/cashflow.js";
import {
  DEMO_FIPS,
  MAX_PAYMENT,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  normalizeCreditReport,
} from "../integrations/demoServices.js";

export const SCALE_OPTIONS = Object.freeze([50, 75, 100, 125, 150]);
export const COVERAGE_OPTIONS = Object.freeze([0, 2, 4, 6, 9, 12]);
export const SDA_OUTCOMES = Object.freeze(["SUCCESS", "PENDING", "TIMEOUT", "FAILURE"]);
const SDA_STATUSES = ["NOT_STARTED", "VERIFIED", "PENDING", "TIMEOUT", "FAILED"];
const PAYMENT_STATUSES = ["AWAITING_USER_ACTION", "PROCESSING", "SUCCESS", "PENDING", "FAILED", "CANCELLED", "UNKNOWN"];
const APPLICATION_STATUSES = ["DRAFT", "ASSESSED", "SUBMITTED_FOR_REVIEW"];
const MAX_PAYMENTS = 20;

const iso = (value) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null);
const text = (value, max = 64) => (typeof value === "string" && value.length > 0 && value.length <= max ? value : null);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const count = (value, fallback) => (Number.isInteger(value) && value >= 0 && value <= 60 ? value : fallback);
const amount = (value, fallback, options) => (amountError(value, "Amount", options) ? fallback : Number(value));

export function minimumBankBalance(profileId) {
  const fixture = fixtureFor(profileId);
  return fixture.otherRestrictions + (fixture.facility?.confirmedLien ?? 0);
}

function cleanDemo(raw, profileId) {
  const d = defaultDemoSettings(profileId);
  return {
    bankBalance: amount(raw?.bankBalance, d.bankBalance, { min: minimumBankBalance(profileId) }),
    incomeScale: oneOf(raw?.incomeScale, SCALE_OPTIONS, d.incomeScale),
    expenseScale: oneOf(raw?.expenseScale, SCALE_OPTIONS, d.expenseScale),
    existingEmi: amount(raw?.existingEmi, d.existingEmi, { max: 100000 }),
    onTime: count(raw?.onTime, d.onTime),
    late: count(raw?.late, d.late),
    missed: count(raw?.missed, d.missed),
    coverageMonths: oneOf(raw?.coverageMonths, COVERAGE_OPTIONS, d.coverageMonths),
    bureauScenario: oneOf(raw?.bureauScenario, BUREAU_SCENARIOS.map((item) => item.id), d.bureauScenario),
    sdaOutcome: oneOf(raw?.sdaOutcome, SDA_OUTCOMES, d.sdaOutcome),
  };
}

function cleanAA(raw) {
  const analyzed =
    raw?.status === "ANALYZED" &&
    text(raw.consentId) &&
    DEMO_FIPS.some((fip) => fip.id === raw.fipId) &&
    iso(raw.consentedAt) &&
    iso(raw.analyzedAt);
  return {
    status: analyzed ? "ANALYZED" : raw?.status === "REVOKED" && iso(raw.revokedAt) ? "REVOKED" : "NOT_CONNECTED",
    consentId: analyzed ? raw.consentId : null,
    fipId: analyzed ? raw.fipId : null,
    consentedAt: analyzed ? raw.consentedAt : null,
    analyzedAt: analyzed ? raw.analyzedAt : null,
    revokedAt: !analyzed && raw?.status === "REVOKED" ? iso(raw.revokedAt) : null,
  };
}

const EMPTY_SDA = Object.freeze({
  status: "NOT_STARTED",
  balance: null,
  otherRestrictions: null,
  confirmedLien: null,
  checkedAt: null,
  reference: null,
  message: null,
});

function cleanSDA(raw) {
  const status = oneOf(raw?.status, SDA_STATUSES, "NOT_STARTED");
  if (status === "VERIFIED") {
    const balance = amount(raw.balance, null);
    const other = amount(raw.otherRestrictions, null);
    const lien = amount(raw.confirmedLien, null);
    const valid =
      balance != null && other != null && lien != null && other + lien <= balance && iso(raw.checkedAt) && text(raw.reference);
    // An unverifiable record is discarded rather than shown as verified.
    return valid
      ? { status, balance, otherRestrictions: other, confirmedLien: lien, checkedAt: raw.checkedAt, reference: raw.reference, message: null }
      : { ...EMPTY_SDA };
  }
  if (status === "NOT_STARTED") return { ...EMPTY_SDA };
  return { ...EMPTY_SDA, status, reference: text(raw.reference), message: text(raw.message, 200) };
}

function cleanBureau(raw) {
  const requested = text(raw?.requestId) && iso(raw?.retrievedAt) && iso(raw?.consentAt);
  return {
    consentAt: requested ? raw.consentAt : null,
    requestId: requested ? raw.requestId : null,
    retrievedAt: requested ? raw.retrievedAt : null,
    scenario: requested ? oneOf(raw.scenario, BUREAU_SCENARIOS.map((item) => item.id), null) : null,
    identityVerified: raw?.identityVerified === true,
  };
}

function cleanPayment(raw) {
  if (!raw || !text(raw.transactionId) || !iso(raw.createdAt)) return null;
  const paid = amount(raw.amount, null, { min: 1, max: MAX_PAYMENT });
  if (paid == null || !PAYMENT_METHODS[raw.method] || !PAYMENT_PURPOSES[raw.purpose]) return null;
  return {
    transactionId: raw.transactionId,
    amount: paid,
    method: raw.method,
    purpose: raw.purpose,
    status: oneOf(raw.status, PAYMENT_STATUSES, "UNKNOWN"),
    reference: text(raw.reference),
    createdAt: raw.createdAt,
    updatedAt: iso(raw.updatedAt) ?? raw.createdAt,
    applied: raw.applied === true && raw.status === "SUCCESS",
  };
}

function cleanLab(raw) {
  if (!raw?.scenario) return null;
  try {
    return { scenario: normalizeScenario(raw.scenario), level: count(raw.level, null), at: iso(raw.at) };
  } catch {
    return null;
  }
}

export function sanitizeCredit(raw, profileId) {
  const source = raw?.profileId === profileId ? raw : null;
  const fixture = fixtureFor(profileId);
  const facilityLimit = fixture.facility?.approvedLimit ?? 0;
  const application = source?.application;
  const appStatus = oneOf(application?.status, APPLICATION_STATUSES, "DRAFT");
  return {
    profileId,
    demo: cleanDemo(source?.demo, profileId),
    aa: cleanAA(source?.aa),
    sda: cleanSDA(source?.sda),
    bureau: cleanBureau(source?.bureau),
    payments: Array.isArray(source?.payments)
      ? source.payments.slice(0, MAX_PAYMENTS).map(cleanPayment).filter(Boolean)
      : [],
    outstanding: fixture.facility
      ? amount(source?.outstanding, fixture.facility.outstanding, { max: facilityLimit })
      : 0,
    application: {
      status: appStatus,
      assessedAt: appStatus === "DRAFT" ? null : iso(application?.assessedAt),
      assessedLevel: appStatus === "DRAFT" ? null : (count(application?.assessedLevel, null) || null),
      submittedAt: appStatus === "SUBMITTED_FOR_REVIEW" ? iso(application?.submittedAt) : null,
      reference: appStatus === "SUBMITTED_FOR_REVIEW" ? text(application?.reference) : null,
    },
    labLinked: cleanLab(source?.labLinked),
  };
}

export const defaultCredit = (profileId) => sanitizeCredit(null, profileId);

export function bureauReport(bureau) {
  if (!bureau.requestId) return null;
  return normalizeCreditReport(
    demoBureauPayload(effectiveBureauScenario(bureau.scenario, bureau.identityVerified)),
    { requestId: bureau.requestId, retrievedAt: bureau.retrievedAt },
  );
}

export function analyzeStatement(profileId, demo) {
  return extractFeatures(generateStatement(profileId, demo), { asOf: STATEMENT_AS_OF });
}

/** The single derivation both pages render from. */
export function deriveCredit(session, now = new Date().toISOString()) {
  const credit = session.credit;
  const fixture = fixtureFor(session.profileId);
  const features = credit.aa.status === "ANALYZED" ? analyzeStatement(session.profileId, credit.demo) : null;
  const report = bureauReport(credit.bureau);
  const facility = fixture.facility
    ? { ...fixture.facility, outstanding: credit.outstanding }
    : null;
  const history = { onTime: credit.demo.onTime, late: credit.demo.late, missed: credit.demo.missed };
  const assessment = assessCreditProfile(features, credit.sda, history, report, { now, facility });
  return { mode: "DEMO", fixture, features, report, facility, history, assessment, now };
}
