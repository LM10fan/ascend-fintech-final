/**
 * Deterministic applicant credit profiles.
 * Identities live in demoStore.PROFILES; this file holds only their financial behaviour.
 */
export const STATEMENT_AS_OF = "2026-09-30";
export const BOUNCE_CHARGE = 590;

const essentials = (...rows) => rows.map(([day, amount, narration]) => ({ day, amount, narration }));

export const CREDIT_FIXTURES = Object.freeze({
  aarav: {
    persona: "Student · regular family support, low expenses",
    sdaBalance: 10000,
    otherRestrictions: 0,
    history: { onTime: 0, late: 0, missed: 0 },
    coverageMonths: 12,
    bureauScenario: "NO_HISTORY",
    facility: null,
    statement: {
      opening: 3000,
      keepBalance: 3200,
      income: () => [{ day: 5, amount: 6000, narration: "UPI/CR/RAMESH SHARMA/MONTHLY SUPPORT" }],
      essentials: essentials(
        [2, 1500, "UPI/DR/HOSTEL MESS/TIFFIN"],
        [4, 400, "UPI/DR/MUMBAI METRO/BUS PASS"],
        [12, 450, "UPI/DR/JIO/RECHARGE"],
      ),
      discretionary: { monthly: 900, merchants: ["SWIGGY/FOOD", "CAMPUS CAFE", "BOOKMYSHOW", "AMAZON"] },
      subscriptions: [{ day: 7, amount: 119, narration: "UPI/DR/SPOTIFY/SUBSCRIPTION" }],
      emi: null,
    },
  },
  mira: {
    persona: "Freelance designer · volatile monthly income",
    sdaBalance: 25000,
    otherRestrictions: 3000,
    history: { onTime: 0, late: 0, missed: 0 },
    coverageMonths: 12,
    bureauScenario: "RETRIEVED_THIN",
    facility: null,
    statement: {
      opening: 15000,
      keepBalance: 12000,
      income: (month) => {
        const amounts = [38000, 9000, 26000, 3000, 52000, 15000, 0, 31000, 22000, 4000, 41000, 12000];
        return amounts[month]
          ? [{ day: 6 + (month % 4) * 5, amount: amounts[month], narration: `NEFT/CR/ACME DESIGN STUDIO/INVOICE ${1040 + month}` }]
          : [];
      },
      essentials: essentials(
        [3, 9000, "UPI/DR/LANDLORD/RENT"],
        [10, 2500, "UPI/DR/BIGBASKET/GROCERIES"],
        [15, 900, "BILLPAY/DR/MSEDCL ELECTRICITY"],
        [12, 599, "UPI/DR/AIRTEL/RECHARGE"],
      ),
      discretionary: { monthly: 4000, merchants: ["ZOMATO", "CAFE", "MYNTRA", "UBER", "DECATHLON", "BOOKMYSHOW"] },
      subscriptions: [
        { day: 7, amount: 199, narration: "CARD/DR/NETFLIX/SUBSCRIPTION" },
        { day: 9, amount: 119, narration: "UPI/DR/SPOTIFY/SUBSCRIPTION" },
      ],
      emi: null,
    },
  },
  riya: {
    persona: "Student · irregular tutoring income, no credit history",
    sdaBalance: 6000,
    otherRestrictions: 0,
    history: { onTime: 0, late: 0, missed: 0 },
    coverageMonths: 12,
    bureauScenario: "NO_HISTORY",
    facility: null,
    statement: {
      opening: 2500,
      keepBalance: null,
      income: (month) => {
        const tutoring = [3500, 0, 5200, 2500, 6000, 1500, 0, 4800, 3000, 7000, 2000, 4500];
        const rows = [];
        if (tutoring[month])
          rows.push({ day: 8 + (month % 3) * 6, amount: tutoring[month], narration: "UPI/CR/PARENT OF STUDENT/TUITION FEES" });
        if ([1, 6, 10].includes(month))
          rows.push({ day: 3, amount: 2000, narration: "UPI/CR/SUNITA VERMA/POCKET MONEY" });
        return rows;
      },
      essentials: essentials(
        [3, 600, "UPI/DR/DTC/BUS PASS"],
        [10, 299, "UPI/DR/JIO/RECHARGE"],
      ),
      discretionary: { monthly: 1500, merchants: ["SWIGGY", "CAFE", "MEESHO", "PVR"] },
      subscriptions: [{ day: 14, amount: 129, narration: "UPI/DR/YOUTUBE PREMIUM/SUBSCRIPTION" }],
      emi: null,
    },
  },
  kabir: {
    persona: "Salaried engineer · stable income, existing car loan",
    sdaBalance: 50000,
    otherRestrictions: 0,
    history: { onTime: 8, late: 0, missed: 0 },
    coverageMonths: 12,
    bureauScenario: "RETRIEVED_CLEAN",
    facility: { level: 2, approvedLimit: 17500, outstanding: 4200, confirmedLien: 17500 },
    statement: {
      opening: 55000,
      keepBalance: 55000,
      income: () => [{ day: 1, amount: 85000, narration: "NEFT/CR/EMPLOYER PAYROLL/SALARY" }],
      essentials: essentials(
        [3, 22000, "UPI/DR/LANDLORD/RENT"],
        [2, 1200, "UPI/DR/NAMMA METRO/BUS PASS"],
        [5, 2200, "NACH/DR/LIC/INSURANCE PREMIUM"],
        [9, 4500, "UPI/DR/BIGBASKET/GROCERIES"],
        [11, 799, "UPI/DR/AIRTEL/RECHARGE"],
        [14, 1800, "BILLPAY/DR/BESCOM ELECTRICITY"],
        [22, 2500, "UPI/DR/DMART/GROCERIES"],
      ),
      discretionary: { monthly: 12000, merchants: ["ZOMATO", "AMAZON", "UBER", "BOOKMYSHOW", "CROMA", "STARBUCKS", "MYNTRA", "INDIGO"] },
      subscriptions: [
        { day: 7, amount: 649, narration: "CARD/DR/NETFLIX/SUBSCRIPTION" },
        { day: 7, amount: 299, narration: "CARD/DR/PRIME VIDEO/SUBSCRIPTION" },
        { day: 9, amount: 119, narration: "UPI/DR/SPOTIFY/SUBSCRIPTION" },
      ],
      emi: { day: 8, amount: 9500, narration: "NACH/DR/AUTO FINANCE/CAR LOAN EMI" },
    },
  },
  dev: {
    persona: "Intern · new bank account, short transaction history",
    sdaBalance: 15000,
    otherRestrictions: 0,
    history: { onTime: 0, late: 0, missed: 0 },
    coverageMonths: 4,
    bureauScenario: "IDENTITY_REQUIRED",
    facility: null,
    statement: {
      opening: 5000,
      keepBalance: 6000,
      income: () => [{ day: 7, amount: 15000, narration: "NEFT/CR/INTERNSHIP STIPEND" }],
      essentials: essentials(
        [5, 6000, "UPI/DR/PG OWNER/PG RENT"],
        [9, 1500, "UPI/DR/DMART/GROCERIES"],
        [10, 299, "UPI/DR/JIO/RECHARGE"],
        [3, 500, "UPI/DR/RSRTC/BUS PASS"],
      ),
      discretionary: { monthly: 3000, merchants: ["ZOMATO", "AMAZON", "CAFE", "PVR"] },
      subscriptions: [],
      emi: null,
    },
  },
  neha: {
    persona: "Salaried · expenses and loan repayments exceed income",
    sdaBalance: 12000,
    otherRestrictions: 0,
    history: { onTime: 2, late: 2, missed: 1 },
    coverageMonths: 12,
    bureauScenario: "RETRIEVED_ADVERSE",
    facility: null,
    statement: {
      opening: 4000,
      keepBalance: null,
      income: () => [{ day: 1, amount: 24000, narration: "NEFT/CR/EMPLOYER PAYROLL/SALARY" }],
      essentials: essentials(
        [3, 11000, "UPI/DR/LANDLORD/RENT"],
        [8, 3500, "UPI/DR/BIGBASKET/GROCERIES"],
        [14, 1200, "BILLPAY/DR/UPPCL ELECTRICITY"],
        [10, 399, "UPI/DR/JIO/RECHARGE"],
        [2, 800, "UPI/DR/LUCKNOW METRO/BUS PASS"],
        [20, 1500, "UPI/DR/APOLLO PHARMACY/MEDICINES"],
      ),
      discretionary: { monthly: 3500, merchants: ["SWIGGY", "MYNTRA", "AMAZON", "PVR"] },
      subscriptions: [{ day: 7, amount: 199, narration: "CARD/DR/NETFLIX/SUBSCRIPTION" }],
      emi: { day: 5, amount: 4500, narration: "NACH/DR/QUICKCASH NBFC/PERSONAL LOAN EMI" },
    },
  },
});

export const BUREAU_SCENARIOS = Object.freeze([
  { id: "NO_HISTORY", label: "No bureau history" },
  { id: "RETRIEVED_THIN", label: "Thin file" },
  { id: "RETRIEVED_CLEAN", label: "Established, clean history" },
  { id: "RETRIEVED_ADVERSE", label: "Adverse history" },
  { id: "IDENTITY_REQUIRED", label: "Identity verification required" },
  { id: "PROVIDER_UNAVAILABLE", label: "Provider unavailable" },
  { id: "TIMEOUT", label: "Request times out" },
]);

export function fixtureFor(profileId) {
  return CREDIT_FIXTURES[profileId] ?? CREDIT_FIXTURES.aarav;
}

export function defaultDemoSettings(profileId) {
  const fixture = fixtureFor(profileId);
  return {
    bankBalance: fixture.sdaBalance,
    incomeScale: 100,
    expenseScale: 100,
    existingEmi: fixture.statement.emi?.amount ?? 0,
    onTime: fixture.history.onTime,
    late: fixture.history.late,
    missed: fixture.history.missed,
    coverageMonths: fixture.coverageMonths,
    bureauScenario: fixture.bureauScenario,
    sdaOutcome: "SUCCESS",
  };
}

function seeded(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value) => Math.round(value * 100) / 100;

/** 12-month window ending at STATEMENT_AS_OF; only the most recent `coverageMonths` contain data. */
export function generateStatement(profileId, settings = defaultDemoSettings(profileId)) {
  const fixture = fixtureFor(profileId);
  const spec = fixture.statement;
  const random = seeded(`${profileId}:statement`);
  const incomeScale = settings.incomeScale / 100;
  const expenseScale = settings.expenseScale / 100;
  const coverage = Math.max(0, Math.min(12, settings.coverageMonths));
  const [endYear, endMonth] = STATEMENT_AS_OF.split("-").map(Number);
  const transactions = [];
  let balance = spec.opening;
  for (let month = 0; month < 12; month++) {
    const offset = endMonth - 12 + month;
    const year = endYear + Math.floor(offset / 12);
    const mm = String((((offset % 12) + 12) % 12) + 1).padStart(2, "0");
    const drafts = [];
    for (const row of spec.income(month))
      drafts.push({ ...row, amount: round(row.amount * incomeScale), kind: "credit" });
    for (const row of spec.essentials)
      drafts.push({
        ...row,
        amount: -round(row.amount * expenseScale * (0.94 + random() * 0.12)),
        kind: "upi",
      });
    const merchants = spec.discretionary.merchants;
    merchants.forEach((merchant, index) => {
      const share = spec.discretionary.monthly / merchants.length;
      drafts.push({
        day: 4 + Math.floor((index * 24) / merchants.length) + Math.floor(random() * 3),
        amount: -round(share * expenseScale * (0.7 + random() * 0.6)),
        narration: `UPI/DR/${merchant}`,
        kind: "upi",
      });
    });
    for (const row of spec.subscriptions)
      drafts.push({ ...row, amount: -round(row.amount * expenseScale), kind: "upi" });
    if (settings.existingEmi > 0) {
      const emi = spec.emi ?? { day: 8, narration: "NACH/DR/PERSONAL FINANCE/LOAN EMI" };
      drafts.push({ day: emi.day, amount: -settings.existingEmi, narration: emi.narration, kind: "nach" });
    }
    if (month < 12 - coverage) continue;
    drafts.sort((a, b) => a.day - b.day || (a.amount < 0 ? 0 : 1) - (b.amount < 0 ? 0 : 1));
    let index = 0;
    const push = (day, amount, narration) => {
      balance = round(balance + amount);
      transactions.push({
        id: `${profileId}-${year}${mm}-${String(index++).padStart(2, "0")}`,
        date: `${year}-${mm}-${String(Math.min(28, day)).padStart(2, "0")}`,
        amount,
        narration,
        balance,
      });
    };
    for (const draft of drafts) {
      if (draft.amount < 0 && balance + draft.amount < 0) {
        // Declined UPI debits leave no ledger entry; failed mandates incur a return charge.
        if (draft.kind === "nach") push(draft.day, -BOUNCE_CHARGE, "NACH RETURN CHG/INSUFFICIENT FUNDS");
        continue;
      }
      push(draft.day, draft.amount, draft.narration);
    }
    if (spec.keepBalance != null && balance > spec.keepBalance + 500)
      push(28, -Math.floor((balance - spec.keepBalance) / 100) * 100, "UPI/DR/SELF/TO SDA SAVINGS");
  }
  return transactions;
}

export function effectiveBureauScenario(scenario, identityVerified) {
  return scenario === "IDENTITY_REQUIRED" && identityVerified ? "NO_HISTORY" : scenario;
}

/** Raw bureau payload for a scenario. Marked simulated so it is never normalized as a verified bureau record. */
export function demoBureauPayload(scenario) {
  const base = { provider: "DEMO_BUREAU_ADAPTER", bureau: "Partner credit bureau", simulated: true };
  switch (scenario) {
    case "RETRIEVED_THIN":
      return {
        ...base,
        outcome: "SUCCESS",
        score: 742,
        historyMonths: 14,
        accounts: [{ type: "Credit card", status: "Active", limit: 50000, balance: 19000, maxDpd: 0, openedOn: "2025-07" }],
        enquiries6m: 1,
        factors: ["Short credit history", "Moderate card utilisation (38%)"],
      };
    case "RETRIEVED_CLEAN":
      return {
        ...base,
        outcome: "SUCCESS",
        score: 781,
        historyMonths: 52,
        accounts: [
          { type: "Auto loan", status: "Active", limit: 450000, balance: 212000, maxDpd: 0, openedOn: "2023-04" },
          { type: "Credit card", status: "Active", limit: 150000, balance: 21000, maxDpd: 0, openedOn: "2022-05" },
          { type: "Consumer loan", status: "Closed", limit: 40000, balance: 0, maxDpd: 0, openedOn: "2022-06" },
        ],
        enquiries6m: 0,
        factors: ["All reported payments on time", "Low card utilisation (14%)", "Long account history"],
      };
    case "RETRIEVED_ADVERSE":
      return {
        ...base,
        outcome: "SUCCESS",
        score: 648,
        historyMonths: 30,
        accounts: [
          { type: "Personal loan", status: "Active", limit: 120000, balance: 74000, maxDpd: 62, openedOn: "2025-01" },
          { type: "Credit card", status: "Active", limit: 30000, balance: 27900, maxDpd: 35, openedOn: "2024-03" },
        ],
        enquiries6m: 4,
        factors: ["Payment overdue 60+ days on one account", "High card utilisation (93%)", "Several recent credit enquiries"],
      };
    case "NO_HISTORY":
      return { ...base, outcome: "NO_HIT" };
    case "IDENTITY_REQUIRED":
      return { ...base, outcome: "IDENTITY_MISMATCH" };
    case "PROVIDER_UNAVAILABLE":
      return { ...base, outcome: "SERVICE_DOWN" };
    default:
      return { ...base, outcome: "TIMEOUT" };
  }
}
