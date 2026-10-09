/**
 * Replaceable integration adapters. Every adapter here is a DEMO mock: no network calls,
 * no live AA, bank, payment gateway, credit bureau or lender. Production adapters must
 * implement the same methods against an authenticated backend; secrets never live in the browser.
 */
import {
  STATEMENT_AS_OF,
  demoBureauPayload,
  effectiveBureauScenario,
  generateStatement,
} from "../data/creditProfiles.js";

export const DEMO_FIPS = Object.freeze([
  { id: "demo-bank", name: "Ascend Partner Bank · Savings ••4821" },
  { id: "sample-coop", name: "Partner Co-operative Bank · Savings ••0937" },
]);
export const DEMO_NETBANKING_BANKS = Object.freeze([
  { id: "demo-bank", name: "Ascend Partner Bank" },
  { id: "sample-national", name: "Partner National Bank" },
  { id: "example-coop", name: "Partner Co-operative Bank" },
]);
export const PAYMENT_PURPOSES = Object.freeze({
  SDA_DEPOSIT: "Add money to my SDA",
  BILL_PAYMENT: "Pay my Ascend credit bill",
});
export const PAYMENT_METHODS = Object.freeze({ UPI: "UPI", NETBANKING: "Net banking" });
export const UPI_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{2,63}$/i;
export const MAX_PAYMENT = 100000;

const pause = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function counterId(prefix) {
  let count = 0;
  return () => `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(++count).padStart(3, "0")}`;
}

/** AA: consent → one-time FI data fetch → revoke. */
export function createDemoAAProvider({ latencyMs = 0 } = {}) {
  const nextId = counterId("ASC-CONSENT");
  return {
    mode: "DEMO",
    async createConsent({ fipId, purpose }) {
      await pause(latencyMs);
      if (!DEMO_FIPS.some((fip) => fip.id === fipId)) throw new Error("Choose a bank account to link.");
      const createdAt = new Date().toISOString();
      return { consentId: nextId(), status: "ACTIVE", createdAt, purpose, fetchType: "ONETIME" };
    },
    async fetchFIData({ consentId, profileId, settings }) {
      await pause(latencyMs);
      if (!consentId) throw new Error("No active consent.");
      return {
        source: "DEMO_FIXTURE",
        asOf: STATEMENT_AS_OF,
        transactions: generateStatement(profileId, settings),
      };
    },
    async revokeConsent() {
      await pause(latencyMs / 2);
      return { status: "REVOKED", revokedAt: new Date().toISOString() };
    },
  };
}

/** SDA: balance verification and deposit confirmation. Verification never marks a lien. */
export function createDemoSDAProvider({ latencyMs = 0 } = {}) {
  const nextRef = counterId("ASC-SDA");
  return {
    mode: "DEMO",
    async verifyBalance({ bankBalance, otherRestrictions, confirmedLien, outcome = "SUCCESS" }) {
      await pause(latencyMs);
      const reference = nextRef();
      if (outcome === "PENDING")
        return { status: "PENDING", reference, message: "The bank has received the request and has not responded yet." };
      if (outcome === "TIMEOUT")
        return { status: "TIMEOUT", reference, message: "The bank did not respond in time. Nothing was verified." };
      if (outcome === "FAILURE")
        return { status: "FAILED", reference, message: "The bank could not verify this account. Nothing was verified." };
      return {
        status: "VERIFIED",
        reference,
        balance: bankBalance,
        otherRestrictions,
        confirmedLien,
        checkedAt: new Date().toISOString(),
      };
    },
    async confirmDeposit({ transactionId, amount }) {
      await pause(latencyMs / 2);
      return { status: "CREDITED", transactionId, amount, creditedAt: new Date().toISOString(), reference: nextRef() };
    },
  };
}

/**
 * Payments: hosted-checkout pattern. The provider's own record is the only source of truth;
 * whatever status the browser claims on return is ignored.
 */
export function createDemoPaymentProvider({ latencyMs = 0 } = {}) {
  const nextId = counterId("ASC-TXN");
  const nextUtr = counterId("UTR");
  const ledger = new Map();
  const byKey = new Map();
  async function getPaymentStatus(transactionId) {
    await pause(latencyMs);
    const record = ledger.get(transactionId);
    if (!record) return { transactionId, status: "UNKNOWN", reference: null, updatedAt: null };
    const { checkout, ...rest } = record;
    return { ...rest };
  }
  return {
    mode: "DEMO",
    async createPayment({ amount, currency = "INR", method, purpose, idempotencyKey, upiId, bankId }) {
      await pause(latencyMs / 2);
      if (byKey.has(idempotencyKey)) return { ...ledger.get(byKey.get(idempotencyKey)), duplicate: true };
      if (currency !== "INR") throw new Error("Only INR is supported.");
      if (!Number.isFinite(amount) || amount < 1 || amount > MAX_PAYMENT)
        throw new Error(`Amount must be between ₹1 and ₹${MAX_PAYMENT.toLocaleString("en-IN")}.`);
      if (!PAYMENT_METHODS[method]) throw new Error("Choose UPI or net banking.");
      if (!PAYMENT_PURPOSES[purpose]) throw new Error("Choose what this payment is for.");
      if (method === "UPI" && !UPI_ID_PATTERN.test(upiId ?? "")) throw new Error("Enter a valid UPI ID.");
      if (method === "NETBANKING" && !DEMO_NETBANKING_BANKS.some((bank) => bank.id === bankId))
        throw new Error("Choose your bank.");
      const now = new Date().toISOString();
      const record = {
        transactionId: nextId(),
        amount,
        currency,
        method,
        purpose,
        status: "AWAITING_USER_ACTION",
        reference: null,
        createdAt: now,
        updatedAt: now,
        checkout: { kind: "SIMULATED_HOSTED_CHECKOUT" },
      };
      ledger.set(record.transactionId, record);
      byKey.set(idempotencyKey, record.transactionId);
      return { ...record, duplicate: false };
    },
    /** DEMO ONLY: stands in for the user finishing (or abandoning) the provider's own checkout page. */
    simulateCheckout(transactionId, outcome) {
      const record = ledger.get(transactionId);
      if (!record || record.status !== "AWAITING_USER_ACTION") return null;
      const status = { SUCCESS: "SUCCESS", PENDING: "PENDING", FAILED: "FAILED", CANCELLED: "CANCELLED" }[outcome];
      Object.assign(record, {
        status,
        reference: status === "SUCCESS" ? nextUtr() : null,
        updatedAt: new Date().toISOString(),
      });
      return { transactionId, status: outcome };
    },
    /** DEMO ONLY: stands in for a provider webhook settling a pending payment. */
    simulateSettlement(transactionId, finalStatus) {
      const record = ledger.get(transactionId);
      if (!record || record.status !== "PENDING") return false;
      Object.assign(record, {
        status: finalStatus === "SUCCESS" ? "SUCCESS" : "FAILED",
        reference: finalStatus === "SUCCESS" ? nextUtr() : null,
        updatedAt: new Date().toISOString(),
      });
      return true;
    },
    getPaymentStatus,
    async handlePaymentReturn(providerResponse) {
      const verified = await getPaymentStatus(providerResponse?.transactionId);
      return {
        ...verified,
        verified: verified.status === "SUCCESS",
        claimedStatus: providerResponse?.status ?? null,
        mismatch: !!providerResponse?.status && providerResponse.status !== verified.status,
      };
    },
  };
}

function utilisation(accounts) {
  const cards = accounts.filter((account) => account.type === "Credit card" && account.status === "Active");
  const limit = cards.reduce((sum, card) => sum + card.limit, 0);
  return limit ? Math.round((cards.reduce((sum, card) => sum + card.balance, 0) / limit) * 100) / 100 : null;
}

/** Normalizes a provider payload. Uses only fields the provider returned. */
export function normalizeCreditReport(payload, { requestId, retrievedAt }) {
  const base = {
    requestId,
    retrievedAt,
    bureau: payload.bureau,
    provider: payload.provider,
    simulated: payload.simulated === true,
    verified: payload.simulated !== true && payload.verified === true,
  };
  switch (payload.outcome) {
    case "SUCCESS": {
      const accounts = payload.accounts ?? [];
      return {
        ...base,
        status: "RETRIEVED",
        score: Number.isFinite(payload.score) ? payload.score : null,
        scoreRange: [300, 900],
        historyMonths: payload.historyMonths ?? null,
        accounts,
        utilization: utilisation(accounts),
        enquiries6m: payload.enquiries6m ?? null,
        factors: payload.factors ?? [],
        adverse: accounts.some((account) => account.maxDpd >= 60 || account.status === "Written off"),
      };
    }
    case "NO_HIT":
      return { ...base, status: "NO_HISTORY" };
    case "IDENTITY_MISMATCH":
      return { ...base, status: "IDENTITY_REQUIRED" };
    case "SERVICE_DOWN":
      return { ...base, status: "PROVIDER_UNAVAILABLE" };
    default:
      return { ...base, status: "FAILED" };
  }
}

/** Bureau: consented report request → status → normalized report. */
export function createDemoBureauProvider({ latencyMs = 0 } = {}) {
  const nextId = counterId("ASC-BUREAU");
  const requests = new Map();
  return {
    mode: "DEMO",
    async requestCreditReport({ userId, consentReference, scenario, identityVerified = false }) {
      await pause(latencyMs / 2);
      if (!userId || !consentReference) throw new Error("Consent is required before requesting a report.");
      const requestId = nextId();
      requests.set(requestId, demoBureauPayload(effectiveBureauScenario(scenario, identityVerified)));
      return { requestId, status: "IN_PROGRESS" };
    },
    async getCreditReportStatus(requestId) {
      await pause(latencyMs);
      const payload = requests.get(requestId);
      if (!payload) return { requestId, state: "NOT_FOUND" };
      return { requestId, state: "COMPLETED", payload };
    },
    normalizeCreditReport,
  };
}

/** Lender: shares an assessment for review. It never approves anything. */
export function createDemoLenderProvider({ latencyMs = 0 } = {}) {
  const nextRef = counterId("ASC-REVIEW");
  return {
    mode: "DEMO",
    async submitForReview({ level, baseLimit }) {
      await pause(latencyMs);
      if (!level || !baseLimit) throw new Error("There is no recommendation to share.");
      return { reference: nextRef(), status: "RECEIVED_FOR_REVIEW", receivedAt: new Date().toISOString() };
    },
  };
}

export function createDemoServices({ latencyMs = 650 } = {}) {
  return {
    mode: "DEMO",
    aa: createDemoAAProvider({ latencyMs }),
    sda: createDemoSDAProvider({ latencyMs }),
    payments: createDemoPaymentProvider({ latencyMs }),
    bureau: createDemoBureauProvider({ latencyMs }),
    lender: createDemoLenderProvider({ latencyMs }),
  };
}
