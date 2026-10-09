import {
  DEFAULT_SCENARIO,
  normalizeScenario,
  validateScenario,
} from "../domain/cashflow.js";
import { defaultLender, sanitizeLender } from "./lender.js";
export const STORE_KEY = "ascend:apply-lab:v1";
export const CONSENT_VERSION = "demo-consent-v1";
export const PROFILES = Object.freeze([
  {
    id: "aarav",
    name: "Aarav Sharma",
    initials: "AS",
    age: 21,
    city: "Mumbai",
    campus: "Sample Institute · Mumbai",
    email: "aarav@example.test",
    parentPan: "DEMO-PARENT-001",
    ownPan: "DEMO-SELF-001",
    aadhaar: "DEMO-AADHAAR-001",
  },
  {
    id: "mira",
    name: "Mira Rao",
    initials: "MR",
    age: 23,
    city: "Pune",
    campus: "Sample Institute · Pune",
    email: "mira@example.test",
    parentPan: "DEMO-PARENT-002",
    ownPan: "DEMO-SELF-002",
    aadhaar: "DEMO-AADHAAR-002",
  },
]);
export const LENDER = Object.freeze({
  name: "Campus Finance · Demo",
  email: "reviewer@example.test",
  id: "DEMO-LENDER-001",
});
export const PURPOSES = [
  "Laptop repair",
  "Course materials",
  "Skills certification",
];
export const emptyConsents = () => ({
  evidence: false,
  cashflow: false,
  bureau: false,
});
export function defaultSession() {
  return {
    version: 1,
    role: "applicant",
    profileId: "aarav",
    history: "first",
    purpose: PURPOSES[0],
    scenario: { ...DEFAULT_SCENARIO },
    inputDraft: { ...DEFAULT_SCENARIO },
    consentChoices: emptyConsents(),
    consent: null,
    mode: "reference",
    lenderRegistered: false,
    lender: defaultLender(),
  };
}
function cleanConsent(value) {
  if (
    !value ||
    value.version !== CONSENT_VERSION ||
    typeof value.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(value.recordedAt))
  )
    return null;
  const scopes = Object.fromEntries(
    Object.keys(emptyConsents()).map((key) => [
      key,
      value.scopes?.[key] === true,
    ]),
  );
  return {
    version: CONSENT_VERSION,
    recordedAt: value.recordedAt,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : null,
    scopes,
  };
}
export function hasConsent(session) {
  return (
    session.mode === "consented" &&
    !!session.consent &&
    !session.consent.revokedAt &&
    session.consent.scopes.evidence &&
    session.consent.scopes.cashflow
  );
}
export function sanitizeSession(raw) {
  if (!raw || raw.version !== 1) throw new Error("Unsupported demo version.");
  const session = defaultSession();
  session.role = raw.role === "lender" ? "lender" : "applicant";
  session.profileId = PROFILES.some((item) => item.id === raw.profileId)
    ? raw.profileId
    : session.profileId;
  session.history = raw.history === "existing" ? "existing" : "first";
  session.purpose = PURPOSES.includes(raw.purpose) ? raw.purpose : PURPOSES[0];
  session.scenario = normalizeScenario(raw.scenario);
  session.inputDraft = Object.fromEntries(
    Object.keys(DEFAULT_SCENARIO).map((key) => {
      const value = raw.inputDraft?.[key] ?? session.scenario[key];
      return [
        key,
        typeof value === "number" && Number.isFinite(value)
          ? value
          : typeof value === "string" &&
              value.length <= 32 &&
              /^[\d.eE+\-]*$/.test(value)
            ? value
            : "",
      ];
    }),
  );
  // A valid draft is authoritative; invalid drafts never enter the engine.
  if (!Object.keys(validateScenario(session.inputDraft)).length)
    session.scenario = normalizeScenario(session.inputDraft);
  if (Number(session.inputDraft.existingDebt) > 0) session.history = "existing";
  session.consent = cleanConsent(raw.consent);
  session.mode = ["manual", "consented", "reference"].includes(raw.mode)
    ? raw.mode
    : "reference";
  if (
    session.mode === "consented" &&
    !(
      session.consent?.scopes.evidence &&
      session.consent?.scopes.cashflow &&
      !session.consent?.revokedAt
    )
  )
    session.mode = "reference";
  session.lenderRegistered = raw.lenderRegistered === true;
  session.lender = sanitizeLender(raw.lender);
  session.lenderRegistered ||= session.lender.status === "verified";
  const choices =
    raw.consentChoices ??
    (hasConsent(session) ? session.consent.scopes : emptyConsents());
  session.consentChoices = Object.fromEntries(
    Object.keys(emptyConsents()).map((key) => [key, choices[key] === true]),
  );
  if (
    hasConsent(session) &&
    Object.keys(emptyConsents()).some(
      (key) => session.consentChoices[key] !== session.consent.scopes[key],
    )
  )
    return {
      ...withdrawConsent(session),
      consentChoices: session.consentChoices,
    };
  return session;
}
/** Shared editable values survive route changes, including a temporarily empty field. */
export function updateScenarioInputs(session, changes) {
  const inputDraft = {
    ...(session.inputDraft ?? session.scenario),
    ...changes,
  };
  const valid = !Object.keys(validateScenario(inputDraft)).length;
  return {
    ...session,
    inputDraft,
    scenario: valid ? normalizeScenario(inputDraft) : session.scenario,
    history: Number(inputDraft.existingDebt) > 0 ? "existing" : session.history,
  };
}
export function setConsentChoice(session, key, checked) {
  if (!(key in emptyConsents())) throw new Error("Unknown consent scope.");
  const consentChoices = { ...session.consentChoices, [key]: checked === true };
  return {
    ...(hasConsent(session) ? withdrawConsent(session) : session),
    consentChoices,
  };
}
/** Swap this adapter with an authenticated API later. Identity is always an allowlisted fixture. */
export function createDemoStore(storage) {
  return {
    load() {
      try {
        const raw = storage?.getItem(STORE_KEY);
        return {
          session: raw ? sanitizeSession(JSON.parse(raw)) : defaultSession(),
          warning: storage
            ? ""
            : "Browser storage is unavailable. This demo will last for this session only.",
        };
      } catch {
        return {
          session: defaultSession(),
          warning:
            "Saved demo data could not be read. A fresh reference scenario is open.",
        };
      }
    },
    save(session) {
      try {
        if (!storage) throw new Error("No storage");
        storage.setItem(STORE_KEY, JSON.stringify(sanitizeSession(session)));
        return { ok: true };
      } catch {
        return {
          ok: false,
          warning:
            "Browser storage is unavailable. Your changes are active for this session only.",
        };
      }
    },
    clear() {
      try {
        if (!storage) throw new Error("No storage");
        storage.removeItem(STORE_KEY);
        return { ok: true };
      } catch {
        return {
          ok: false,
          warning:
            "Local storage could not be cleared. Clear this site’s data in your browser settings.",
        };
      }
    },
  };
}
export function browserStore() {
  try {
    return createDemoStore(globalThis.localStorage);
  } catch {
    return createDemoStore(null);
  }
}
export function recordConsent(session, scopes, now = new Date().toISOString()) {
  if (!(scopes.evidence && scopes.cashflow))
    throw new Error(
      "Select both required permissions or choose the manual path.",
    );
  return {
    ...session,
    mode: "consented",
    consentChoices: {
      evidence: true,
      cashflow: true,
      bureau: scopes.bureau === true,
    },
    consent: {
      version: CONSENT_VERSION,
      scopes: {
        evidence: true,
        cashflow: true,
        bureau: scopes.bureau === true,
      },
      recordedAt: now,
      revokedAt: null,
    },
  };
}
export function withdrawConsent(session, now = new Date().toISOString()) {
  return {
    ...session,
    mode: "manual",
    consentChoices: emptyConsents(),
    consent: session.consent
      ? { ...session.consent, scopes: emptyConsents(), revokedAt: now }
      : null,
  };
}
