import test from "node:test";
import assert from "node:assert/strict";
import { categorize, cleanTransactions, extractFeatures, windowMonths } from "../src/features/ascend/domain/aaFeatures.js";
import { STATEMENT_AS_OF, defaultDemoSettings, generateStatement } from "../src/features/ascend/data/creditProfiles.js";

const asOf = STATEMENT_AS_OF;
const txn = (date, amount, narration, balance) => ({ id: `${date}-${narration}`, date, amount, narration, balance });

test("narration rules categorise UPI and NACH entries without false EMI matches", () => {
  assert.equal(categorize({ amount: 85000, narration: "NEFT/CR/SAMPLE TECH/SALARY" }), "salary");
  assert.equal(categorize({ amount: 6000, narration: "UPI/CR/PARENT/MONTHLY SUPPORT" }), "family");
  assert.equal(categorize({ amount: -129, narration: "UPI/DR/YOUTUBE PREMIUM/SUBSCRIPTION" }), "subscription");
  assert.equal(categorize({ amount: -2200, narration: "NACH/DR/LIC/INSURANCE PREMIUM" }), "essential");
  assert.equal(categorize({ amount: -9500, narration: "NACH/DR/BANK/CAR LOAN EMI" }), "emi");
  assert.equal(categorize({ amount: -5000, narration: "UPI/DR/SELF/TO SDA SAVINGS" }), "self_transfer");
  assert.equal(categorize({ amount: -590, narration: "NACH RETURN CHG/INSUFFICIENT FUNDS" }), "bounce_charge");
  assert.equal(categorize({ amount: -450, narration: "UPI/DR/ZOMATO" }), "discretionary");
});

test("window covers the 12 months ending at the statement date", () => {
  const months = windowMonths(asOf);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2025-10");
  assert.equal(months[11], "2026-09");
  assert.deepEqual(windowMonths("2026-02-28", 3), ["2025-12", "2026-01", "2026-02"]);
});

test("steady student fixture: observed and estimated values are separated and reconcile", () => {
  const features = extractFeatures(generateStatement("aarav"), { asOf });
  assert.equal(features.coverageMonths, 12);
  assert.equal(features.confidence, "HIGH");
  assert.equal(features.observed.medianIncome, 6000);
  assert.equal(features.estimated.incomeCV, 0);
  assert.equal(features.estimated.incomeRegularity, "REGULAR");
  assert.equal(features.estimated.incomeDay, 5);
  assert.equal(features.estimated.primaryIncome, "family");
  assert.ok("freeCashFlow" in features.estimated && !("freeCashFlow" in features.observed));
  assert.ok(features.monthly.every((row) => Math.abs(row.income - row.outflow - row.net) < 0.01));
});

test("self-transfers to savings are excluded from spending", () => {
  const rows = [];
  for (const month of ["2026-07", "2026-08", "2026-09"]) {
    rows.push(txn(`${month}-01`, 10000, "NEFT/CR/EMPLOYER/SALARY", 10000));
    rows.push(txn(`${month}-03`, -2000, "UPI/DR/LANDLORD/RENT", 8000));
    rows.push(txn(`${month}-28`, -8000, "UPI/DR/SELF/TO SDA SAVINGS", 0));
  }
  const features = extractFeatures(rows, { asOf });
  assert.equal(features.observed.medianOutflow, 2000);
  assert.equal(features.estimated.freeCashFlow, 8000);
});

test("missing or short data stays null instead of becoming zero", () => {
  const empty = extractFeatures([], { asOf });
  assert.equal(empty.confidence, "INSUFFICIENT");
  assert.equal(empty.coverageMonths, 0);
  assert.equal(empty.observed.medianIncome, null);
  assert.equal(empty.estimated.freeCashFlow, null);
  assert.equal(empty.estimated.incomeCV, null);
  const short = extractFeatures(generateStatement("dev"), { asOf });
  assert.equal(short.coverageMonths, 4);
  assert.equal(short.confidence, "LOW");
  assert.ok(short.flags.some((flag) => flag.code === "SHORT_HISTORY"));
  const noBalances = extractFeatures(
    generateStatement("aarav").map(({ balance, ...rest }) => rest),
    { asOf },
  );
  assert.equal(noBalances.balanceReliable, false);
  assert.equal(noBalances.observed.endOfMonthLiquidity, null);
  assert.equal(noBalances.observed.lowBalanceMonths, null);
  assert.notEqual(noBalances.confidence, "HIGH");
});

test("payment returns and round-tripping are flagged for verification", () => {
  const settings = { ...defaultDemoSettings("riya"), existingEmi: 9000 };
  const bounced = extractFeatures(generateStatement("riya", settings), { asOf });
  assert.ok(bounced.observed.bounces >= 2);
  assert.equal(bounced.flags.find((flag) => flag.code === "BOUNCED_PAYMENTS").severity, "high");
  const rows = [
    txn("2026-07-01", 20000, "NEFT/CR/EMPLOYER/SALARY", 20000),
    txn("2026-07-05", -3000, "UPI/DR/LANDLORD/RENT", 17000),
    txn("2026-07-10", -500, "UPI/DR/ZOMATO", 16500),
    txn("2026-08-01", 20000, "NEFT/CR/EMPLOYER/SALARY", 36500),
    txn("2026-08-12", 50000, "IMPS/CR/UNKNOWN PARTY", 86500),
    txn("2026-08-13", -50000, "IMPS/DR/UNKNOWN PARTY", 36500),
    txn("2026-08-20", -500, "UPI/DR/ZOMATO", 36000),
    txn("2026-09-01", 20000, "NEFT/CR/EMPLOYER/SALARY", 56000),
    txn("2026-09-05", -3000, "UPI/DR/LANDLORD/RENT", 53000),
    txn("2026-09-10", -500, "UPI/DR/ZOMATO", 52500),
  ];
  const codes = extractFeatures(rows, { asOf }).flags.map((flag) => flag.code);
  assert.ok(codes.includes("ROUND_TRIP"));
  assert.ok(codes.includes("LARGE_UNEXPLAINED_CREDIT"));
});

test("demo fixtures are deterministic", () => {
  assert.deepEqual(generateStatement("mira"), generateStatement("mira"));
});

test("corrupt rows are dropped, never coerced to zero, and the drop is reported", () => {
  const good = generateStatement("aarav");
  const baseline = extractFeatures(good, { asOf });
  const corrupt = [
    ...good,
    { id: "x1", date: "2026-13-45", amount: 5000, narration: "BAD DATE", balance: 1 },
    { id: "x2", amount: 5000, narration: "NO DATE" },
    { id: "x3", date: "2026-09-02", amount: Number.NaN, narration: "NAN AMOUNT", balance: 1 },
    { id: "x4", date: "2026-09-02", amount: "abc", narration: "TEXT AMOUNT", balance: 1 },
    { id: "x5", date: "2026-09-02", amount: 1e12, narration: "ABSURD AMOUNT", balance: 1 },
    null,
  ];
  const result = extractFeatures(corrupt, { asOf });
  assert.equal(result.dataQuality.invalidDate, 3);
  assert.equal(result.dataQuality.invalidAmount, 3);
  assert.equal(result.observed.medianIncome, baseline.observed.medianIncome);
  assert.equal(result.estimated.freeCashFlow, baseline.estimated.freeCashFlow);
  assert.equal(result.flags.find((flag) => flag.code === "DATA_QUALITY").severity, "watch");
  const mostlyBad = extractFeatures([...good.slice(0, 20), ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, date: "oops", amount: 1 }))], { asOf });
  assert.equal(mostlyBad.flags.find((flag) => flag.code === "DATA_QUALITY").severity, "high");
  assert.doesNotThrow(() => extractFeatures(undefined, { asOf }));
});

test("repeated AA rows are counted once, so income is not inflated", () => {
  const good = generateStatement("aarav");
  const doubled = extractFeatures([...good, ...good], { asOf });
  const baseline = extractFeatures(good, { asOf });
  assert.equal(doubled.dataQuality.duplicates, good.length);
  assert.equal(doubled.observed.medianIncome, baseline.observed.medianIncome);
  assert.equal(doubled.transactionCount, baseline.transactionCount);
  assert.ok(doubled.flags.some((flag) => flag.code === "DUPLICATE_TRANSACTIONS"));
});

test("shuffled input gives identical features, and bad balances switch balance features off", () => {
  const good = generateStatement("aarav");
  const shuffled = [...good].reverse();
  const pick = (f) => [f.observed.medianIncome, f.observed.medianOutflow, f.estimated.freeCashFlow, f.estimated.incomeCV, f.coverageMonths];
  assert.deepEqual(pick(extractFeatures(shuffled, { asOf })), pick(extractFeatures(good, { asOf })));
  const badBalance = good.map((row, i) => (i === 3 ? { ...row, balance: "n/a" } : row));
  const result = extractFeatures(badBalance, { asOf });
  assert.equal(result.balanceReliable, false);
  assert.equal(result.dataQuality.invalidBalance, 1);
  assert.equal(cleanTransactions("not a list").rows.length, 0);
});