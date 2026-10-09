import { defaultLender, sanitizeLender } from "./lender.js";
import { DEFAULT_SCENARIO, normalizeScenario, validateScenario } from "../domain/cashflow.js";
import { defaultCredit, sanitizeCredit } from "./creditState.js";
export const STORE_KEY = "ascend:apply-lab:v1";
export const CONSENT_VERSION = "demo-consent-v1";
export const PROFILES = Object.freeze([
  {
    id: "aarav",
    name: "Aarav Sharma",
    initials: "AS",
    age: 21,
    city: "Mumbai",
    campus: "Undergraduate · Mumbai",
    email: "aarav@mail.ascend.test",
    parentPan: "XXXXX4821K",
    ownPan: "XXXXX7310A",
    aadhaar: "XXXX XXXX 4821",
  },
  {
    id: "mira",
    name: "Mira Rao",
    initials: "MR",
    age: 23,
    city: "Pune",
    campus: "Postgraduate · Pune",
    email: "mira@mail.ascend.test",
    parentPan: "XXXXX0937P",
    ownPan: "XXXXX5162B",
    aadhaar: "XXXX XXXX 0937",
  },
  {
    id: "riya",
    name: "Riya Verma",
    initials: "RV",
    age: 20,
    city: "Delhi",
    campus: "Undergraduate · Delhi",
    email: "riya@mail.ascend.test",
    parentPan: "XXXXX2284M",
    ownPan: "XXXXX8845C",
    aadhaar: "XXXX XXXX 2284",
  },
  {
    id: "kabir",
    name: "Kabir Mehta",
    initials: "KM",
    age: 29,
    city: "Bengaluru",
    campus: "Salaried · Technology",
    email: "kabir@mail.ascend.test",
    parentPan: "XXXXX6601R",
    ownPan: "XXXXX3329D",
    aadhaar: "XXXX XXXX 6601",
  },
  {
    id: "dev",
    name: "Dev Rathore",
    initials: "DR",
    age: 22,
    city: "Jaipur",
    campus: "Undergraduate · Jaipur",
    email: "dev@mail.ascend.test",
    parentPan: "XXXXX1457T",
    ownPan: "XXXXX9073E",
    aadhaar: "XXXX XXXX 1457",
  },
  {
    id: "neha",
    name: "Neha Singh",
    initials: "NS",
    age: 26,
    city: "Lucknow",
    campus: "Salaried · Retail",
    email: "neha@mail.ascend.test",
    parentPan: "XXXXX5590S",
    ownPan: "XXXXX4418F",
    aadhaar: "XXXX XXXX 5590",
  },
]);
export const LENDER = Object.freeze({
  name: "Campus Finance",
  email: "reviewer@mail.ascend.test",
  id: "ASC-PARTNER-001",
});
export const PURPOSES = [
  "Laptop repair",
  "Course materials",
  "Skills certification",
  "Material purchase",
  "Coaching",
  "Expenses",
  "Miscellaneous",
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
    credit: defaultCredit("aarav"),
  };
}
/** A different applicant never inherits another applicant's consent or financial data. */
export function switchProfile(session, profileId) {
  return {
    ...withdrawConsent(session),
    profileId,
    mode: "reference",
    credit: defaultCredit(profileId),
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
  if (!raw || raw.version !== 1) throw new Error("Unsupported saved data version.");
  const session = defaultSession();
  session.role = raw.role === "lender" ? "lender" : "applicant";
  session.profileId = PROFILES.some((item) => item.id === raw.profileId)
    ? raw.profileId
    : session.profileId;
  session.history = raw.history === "existing" ? "existing" : "first";
  session.purpose = PURPOSES.includes(raw.purpose) ? raw.purpose : PURPOSES[0];
  session.scenario = normalizeScenario(raw.scenario);
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
  session.credit = sanitizeCredit(raw.credit, session.profileId);
  session.lender = sanitizeLender(raw.lender);
  session.lenderRegistered ||= session.lender.status === "verified";
  session.inputDraft = Object.fromEntries(Object.keys(DEFAULT_SCENARIO).map((key) => {
    const value = raw.inputDraft?.[key] ?? session.scenario[key];
    return [key, (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.length <= 32 && /^[\d.eE+\-]*$/.test(value))
      ? value : session.scenario[key]];
  }));
  if (!Object.keys(validateScenario(session.inputDraft)).length)
    session.scenario = normalizeScenario(session.inputDraft);
  const choices = raw.consentChoices ?? (hasConsent(session) ? session.consent.scopes : emptyConsents());
  session.consentChoices = Object.fromEntries(Object.keys(emptyConsents()).map(key => [key, choices[key] === true]));
  if (hasConsent(session) && Object.keys(emptyConsents()).some(key => session.consentChoices[key] !== session.consent.scopes[key]))
    return { ...withdrawConsent(session), consentChoices: session.consentChoices };
  return session;
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
            : "Browser storage is unavailable. Your progress will last for this session only.",
        };
      } catch {
        return {
          session: defaultSession(),
          warning:
            "Saved data could not be read. A fresh reference scenario is open.",
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
    consentChoices: { evidence: true, cashflow: true, bureau: scopes.bureau === true },
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
