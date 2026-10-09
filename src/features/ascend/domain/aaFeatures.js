/**
 * Cash-flow feature engineering over Account Aggregator deposit-account transactions.
 * Pure: no React, storage or network. Amounts in rupees (+ credit, − debit), arithmetic in paise.
 */
export const FEATURES_VERSION = "ascend-aa-features-v1";
export const LOW_BALANCE_THRESHOLD = 500;
const INCOME = ["salary", "family", "freelance", "gig"];

const CREDIT_RULES = [
  [/SELF|OWN A\/C|SWEEP|FROM SDA/, "self_transfer"],
  [/REFUND|REVERSAL|CASHBACK/, "refund"],
  [/SALARY|PAYROLL|SAL CR/, "salary"],
  [/SUPPORT|ALLOWANCE|POCKET MONEY|FAMILY/, "family"],
  [/INVOICE|CLIENT|UPWORK|FIVERR|FREELANCE/, "freelance"],
  [/PAYOUT|TUITION|TUTORING|STIPEND|GIG/, "gig"],
];
const DEBIT_RULES = [
  [/SELF|OWN A\/C|SWEEP|TO SDA/, "self_transfer"],
  [/RETURN CHG|BOUNCE|INSUFFICIENT/, "bounce_charge"],
  [/INSURANCE/, "essential"],
  [/\bNACH\b|\bECS\b|\bEMI\b|\bLOAN\b/, "emi"],
  [/CC PAYMENT|CREDIT CARD/, "card_payment"],
  [/NETFLIX|SPOTIFY|PRIME VIDEO|HOTSTAR|YOUTUBE PREMIUM/, "subscription"],
  [/RENT|HOSTEL|MESS|GROCER|BIGBASKET|DMART|ELECTRICITY|METRO|BUS PASS|RECHARGE|PHARMA|MEDIC|COLLEGE FEE|INSURANCE|TIFFIN/, "essential"],
];

export function categorize(txn) {
  const text = String(txn.narration ?? "").toUpperCase();
  const rules = txn.amount >= 0 ? CREDIT_RULES : DEBIT_RULES;
  for (const [pattern, category] of rules) if (pattern.test(text)) return category;
  return txn.amount >= 0 ? "other_credit" : "discretionary";
}

const paise = (value) => Math.round(value * 100);
const rupees = (value) => Math.round(value) / 100;
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
function monthKey(date) {
  return date.slice(0, 7);
}
export function windowMonths(asOf, count = 12) {
  const [year, month] = asOf.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const offset = month - 1 - (count - 1 - index);
    const y = year + Math.floor(offset / 12);
    const m = ((offset % 12) + 12) % 12;
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  });
}

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Larger single movements are treated as corrupt input rather than as income or spending. */
export const MAX_TXN_AMOUNT = 100000000;

/**
 * Validates and de-duplicates raw transactions before any analytics run. Rows with a bad date
 * or amount are dropped (never coerced to zero); repeated rows, which AA feeds can return, are
 * counted once. A balance that isn't a finite number becomes null so balance features turn off
 * instead of using garbage. Returns the clean rows in date order plus what was removed.
 */
export function cleanTransactions(transactions) {
  const quality = { received: 0, invalidDate: 0, invalidAmount: 0, duplicates: 0, invalidBalance: 0 };
  if (!Array.isArray(transactions)) return { rows: [], quality };
  quality.received = transactions.length;
  const seen = new Set();
  const rows = [];
  for (const txn of transactions) {
    const date = typeof txn?.date === "string" ? txn.date.slice(0, 10) : "";
    if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
      quality.invalidDate++;
      continue;
    }
    const amount = typeof txn.amount === "string" && txn.amount.trim() !== "" ? Number(txn.amount) : txn.amount;
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_TXN_AMOUNT) {
      quality.invalidAmount++;
      continue;
    }
    const balance = txn.balance == null ? txn.balance : Number(txn.balance);
    if (txn.balance != null && !Number.isFinite(balance)) quality.invalidBalance++;
    const narration = String(txn.narration ?? "");
    const key = txn.id != null ? `id:${txn.id}` : `${date}|${amount}|${narration}|${txn.balance ?? ""}`;
    if (seen.has(key)) {
      quality.duplicates++;
      continue;
    }
    seen.add(key);
    rows.push({ ...txn, date, amount, narration, balance: Number.isFinite(balance) ? balance : null });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rows, quality };
}

/**
 * Returns observed facts and estimated features separately. Missing data stays null — never zero.
 */
export function extractFeatures(transactions, { asOf, months = 12, source = "DEMO_FIXTURE" }) {
  const keys = windowMonths(asOf, months);
  const { rows: clean, quality } = cleanTransactions(transactions);
  const inWindow = clean
    .filter((txn) => keys.includes(monthKey(txn.date)))
    .map((txn) => ({ ...txn, category: categorize(txn) }));
  const balanceReliable =
    inWindow.length > 0 && inWindow.every((txn) => Number.isFinite(txn.balance));
  const monthly = keys.map((key) => {
    const rows = inWindow.filter((txn) => monthKey(txn.date) === key);
    const sum = (filter) =>
      rows.filter(filter).reduce((total, txn) => total + paise(Math.abs(txn.amount)), 0);
    const byCategory = (...categories) => sum((txn) => categories.includes(txn.category));
    const incomeRows = rows.filter((txn) => INCOME.includes(txn.category));
    const largestIncome = incomeRows.reduce(
      (best, txn) => (!best || txn.amount > best.amount ? txn : best),
      null,
    );
    const balances = balanceReliable ? rows.map((txn) => paise(txn.balance)) : [];
    return {
      month: key,
      transactions: rows.length,
      hasData: rows.length >= 3,
      incomeP: byCategory(...INCOME),
      inflowP: sum((txn) => txn.amount > 0 && txn.category !== "self_transfer"),
      outflowP: sum((txn) => txn.amount < 0 && txn.category !== "self_transfer"),
      essentialP: byCategory("essential"),
      discretionaryP: byCategory("discretionary"),
      subscriptionP: byCategory("subscription"),
      obligationsP: byCategory("emi", "card_payment"),
      bounces: rows.filter((txn) => txn.category === "bounce_charge").length,
      incomeDay: largestIncome ? Number(largestIncome.date.slice(8, 10)) : null,
      incomeTypes: [...new Set(incomeRows.map((txn) => txn.category))],
      closingP: balances.length ? balances[balances.length - 1] : null,
      minP: balances.length ? Math.min(...balances) : null,
      averageP: balances.length ? Math.round(mean(balances)) : null,
    };
  });
  const data = monthly.filter((row) => row.hasData);
  const coverageMonths = data.length;
  const confidence =
    coverageMonths >= 10 && balanceReliable
      ? "HIGH"
      : coverageMonths >= 6
        ? "MEDIUM"
        : coverageMonths >= 3
          ? "LOW"
          : "INSUFFICIENT";
  const pick = (field) => data.map((row) => row[field]);
  const incomes = pick("incomeP");
  const meanIncome = mean(incomes);
  const sd =
    meanIncome == null
      ? null
      : Math.sqrt(mean(incomes.map((value) => (value - meanIncome) ** 2)));
  const enough = coverageMonths >= 3;
  const medianIncomeP = enough ? median(incomes) : null;
  const totalIncomeP = incomes.reduce((a, b) => a + b, 0);
  const obligationsP = enough ? median(pick("obligationsP")) : null;
  const incomeDays = data.map((row) => row.incomeDay).filter((day) => day != null);
  const incomeDay = incomeDays.length ? median(incomeDays) : null;
  const regularMonths =
    incomeDay == null
      ? 0
      : data.filter((row) => row.incomeDay != null && Math.abs(row.incomeDay - incomeDay) <= 3).length;
  const typeCounts = {};
  for (const row of data)
    for (const type of row.incomeTypes) typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  const primaryIncome =
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const closings = data.map((row) => row.closingP).filter((value) => value != null);
  const averages = data.map((row) => row.averageP).filter((value) => value != null);
  const lowBalanceMonths = balanceReliable
    ? data.filter((row) => row.minP < paise(LOW_BALANCE_THRESHOLD)).length
    : null;
  const bounces = data.reduce((total, row) => total + row.bounces, 0);
  const flags = [];
  const invalidRows = quality.invalidDate + quality.invalidAmount;
  if (invalidRows > 0)
    flags.push({
      code: "DATA_QUALITY",
      // Too much unreadable data means the remaining figures can't be trusted for unsecured credit.
      severity: invalidRows / Math.max(1, quality.received) > 0.1 ? "high" : "watch",
      message: `${invalidRows} of ${quality.received} transactions could not be read and were left out of the analysis.`,
    });
  if (quality.duplicates > 0)
    flags.push({
      code: "DUPLICATE_TRANSACTIONS",
      severity: "info",
      message: `${quality.duplicates} repeated transaction${quality.duplicates > 1 ? "s were" : " was"} counted once.`,
    });
  if (coverageMonths < 6)
    flags.push({
      code: "SHORT_HISTORY",
      severity: "info",
      message: `Only ${coverageMonths} of ${months} months have enough transactions to analyse.`,
    });
  if (bounces > 0)
    flags.push({
      code: "BOUNCED_PAYMENTS",
      severity: bounces >= 2 ? "high" : "watch",
      message: `${bounces} payment-return charge${bounces > 1 ? "s" : ""} observed.`,
    });
  if (lowBalanceMonths != null && lowBalanceMonths >= 3)
    flags.push({
      code: "LOW_BALANCE_EPISODES",
      severity: "watch",
      message: `Balance fell below ₹${LOW_BALANCE_THRESHOLD} in ${lowBalanceMonths} months.`,
    });
  const unexplained = inWindow.filter(
    (txn) =>
      txn.category === "other_credit" &&
      medianIncomeP != null &&
      paise(txn.amount) > Math.max(2 * medianIncomeP, 1000000),
  );
  if (unexplained.length)
    flags.push({
      code: "LARGE_UNEXPLAINED_CREDIT",
      severity: "high",
      message: "A large credit from an unidentified source needs verification.",
    });
  const roundTrip = inWindow.some(
    (credit) =>
      credit.amount >= 5000 &&
      credit.category === "other_credit" &&
      inWindow.some(
        (debit) =>
          debit.amount < 0 &&
          Math.abs(Math.abs(debit.amount) - credit.amount) <= credit.amount * 0.01 &&
          (Date.parse(debit.date) - Date.parse(credit.date)) / 86400000 >= 0 &&
          (Date.parse(debit.date) - Date.parse(credit.date)) / 86400000 <= 3,
      ),
  );
  if (roundTrip)
    flags.push({
      code: "ROUND_TRIP",
      severity: "high",
      message: "Money received and sent back out within three days. It needs verification.",
    });
  const nets = data.map((row) => row.incomeP - row.outflowP);
  return {
    version: FEATURES_VERSION,
    source,
    period: { from: keys[0], to: keys[keys.length - 1], months },
    transactionCount: inWindow.length,
    dataQuality: quality,
    coverageMonths,
    confidence,
    balanceReliable,
    monthly: monthly.map((row) => ({
      month: row.month,
      transactions: row.transactions,
      hasData: row.hasData,
      income: rupees(row.incomeP),
      outflow: rupees(row.outflowP),
      net: rupees(row.incomeP - row.outflowP),
      closingBalance: row.closingP == null ? null : rupees(row.closingP),
    })),
    observed: {
      medianInflow: enough ? rupees(median(pick("inflowP"))) : null,
      medianOutflow: enough ? rupees(median(pick("outflowP"))) : null,
      medianIncome: medianIncomeP == null ? null : rupees(medianIncomeP),
      medianEssential: enough ? rupees(median(pick("essentialP"))) : null,
      medianDiscretionary: enough ? rupees(median(pick("discretionaryP"))) : null,
      medianSubscriptions: enough ? rupees(median(pick("subscriptionP"))) : null,
      existingObligations: obligationsP == null ? null : rupees(obligationsP),
      averageMonthlyBalance: averages.length ? rupees(Math.round(mean(averages))) : null,
      endOfMonthLiquidity: closings.length >= 3 ? rupees(median(closings)) : null,
      lowBalanceMonths,
      bounces,
    },
    estimated: {
      freeCashFlow: enough ? rupees(median(nets)) : null,
      incomeCV: enough && meanIncome > 0 ? Math.round((sd / meanIncome) * 100) / 100 : null,
      essentialRatio:
        enough && totalIncomeP > 0
          ? Math.round((pick("essentialP").reduce((a, b) => a + b, 0) / totalIncomeP) * 100) / 100
          : null,
      debtServiceRatio:
        enough && medianIncomeP > 0 ? Math.round((obligationsP / medianIncomeP) * 100) / 100 : null,
      incomeDay,
      incomeRegularity:
        incomeDay == null || !coverageMonths
          ? null
          : regularMonths / coverageMonths >= 0.8
            ? "REGULAR"
            : "IRREGULAR",
      primaryIncome,
    },
    flags,
  };
}
