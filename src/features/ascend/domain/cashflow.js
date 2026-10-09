/** Deterministic illustrative model. All monetary arithmetic uses integer paise. */
export const MODEL_VERSION = "ascend-cashflow-v1";
export const POLICY = Object.freeze({
  minPrincipal: 1000,
  maxPrincipal: 10000,
  months: 3,
  totalFeeRate: 0.04,
  buffer: 1000,
  cycleDays: 30,
});
export const ESSENTIALS = Object.freeze([
  { id: "mess", label: "Hostel mess & tiffin", day: 2, amount: 1500 },
  { id: "travel", label: "Local train & bus pass", day: 4, amount: 400 },
  { id: "data", label: "Mobile data & cloud pack", day: 12, amount: 450 },
]);
export const DEFAULT_SCENARIO = Object.freeze({
  principal: 9000,
  income: 6000,
  openingBalance: 3000,
  stipendDay: 5,
  emiDay: 10,
  existingDebt: 0,
  shock: 0,
  shockDay: 3,
});
export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
const paise = (value) => Math.round(value * 100);
const rupees = (value) => value / 100;
const RULES = {
  principal: [1000, 10000, false, "Purchase amount"],
  income: [0, 100000, false, "Monthly stipend"],
  openingBalance: [0, 1000000, false, "Opening balance"],
  stipendDay: [1, 30, true, "Stipend arrival day"],
  emiDay: [1, 30, true, "EMI due day"],
  existingDebt: [0, 100000, false, "Existing monthly repayment"],
  shock: [0, 100000, false, "Expense shock"],
  shockDay: [1, 30, true, "Shock day"],
};
export function validateScenario(input) {
  const errors = {};
  for (const [key, [min, max, integer, label]] of Object.entries(RULES)) {
    const value = input[key];
    if (value === "" || value == null || !Number.isFinite(Number(value)))
      errors[key] = `${label} is required.`;
    else if (Number(value) < min || Number(value) > max)
      errors[key] =
        `${label} must be between ${min.toLocaleString("en-IN")} and ${max.toLocaleString("en-IN")}.`;
    else if (integer && !Number.isInteger(Number(value)))
      errors[key] = `${label} must be a whole day.`;
    else if (
      !integer &&
      Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) > 0.00001
    )
      errors[key] = `${label} supports up to two decimal places.`;
  }
  return errors;
}
export function normalizeScenario(input) {
  const errors = validateScenario(input);
  if (Object.keys(errors).length)
    throw new RangeError(Object.values(errors).join(" "));
  return Object.fromEntries(
    Object.keys(RULES).map((key) => [key, Number(input[key])]),
  );
}
export function loanTerms(principal) {
  if (
    !Number.isFinite(principal) ||
    principal < POLICY.minPrincipal ||
    principal > POLICY.maxPrincipal ||
    Math.abs(principal * 100 - Math.round(principal * 100)) > 0.00001
  )
    throw new RangeError("Invalid principal.");
  const principalP = paise(principal);
  const feeP = Math.round(principalP * POLICY.totalFeeRate);
  const totalP = principalP + feeP;
  const regularP = Math.floor(totalP / POLICY.months);
  const paymentsP = [regularP, regularP, totalP - regularP * 2];
  return {
    principal,
    fee: rupees(feeP),
    total: rupees(totalP),
    installments: paymentsP.map(rupees),
    emi: rupees(regularP),
    maxEmi: rupees(Math.max(...paymentsP)),
  };
}
export function simulate(input, { months = 1 } = {}) {
  const scenario = normalizeScenario(input);
  if (![1, 3].includes(months))
    throw new RangeError("Use a one- or three-cycle horizon.");
  const terms = loanTerms(scenario.principal);
  const essentialP = ESSENTIALS.reduce(
    (sum, expense) => sum + paise(expense.amount),
    0,
  );
  const recurringMarginP =
    paise(scenario.income) -
    essentialP -
    paise(scenario.existingDebt) -
    paise(terms.maxEmi);
  const openingP = paise(scenario.openingBalance);
  const bufferP = paise(POLICY.buffer);
  const events = [];
  for (let month = 0; month < months; month++) {
    const offset = month * POLICY.cycleDays;
    for (const expense of ESSENTIALS)
      events.push({
        id: `${month}-${expense.id}`,
        day: offset + expense.day,
        label: expense.label,
        deltaP: -paise(expense.amount),
        kind: "essential",
        order: 0,
      });
    if (scenario.existingDebt > 0)
      events.push({
        id: `${month}-existing`,
        day: offset + 8,
        label: "Existing debt repayment",
        deltaP: -paise(scenario.existingDebt),
        kind: "debt",
        order: 1,
      });
    events.push({
      id: `${month}-emi`,
      day: offset + scenario.emiDay,
      label: "Proposed EMI",
      deltaP: -paise(terms.installments[month]),
      kind: "emi",
      order: 2,
    });
    if (month === 0 && scenario.shock > 0)
      events.push({
        id: "shock",
        day: scenario.shockDay,
        label: "One-off expense shock",
        deltaP: -paise(scenario.shock),
        kind: "shock",
        order: 3,
      });
    events.push({
      id: `${month}-stipend`,
      day: offset + scenario.stipendDay,
      label: "Stipend · declared arrival",
      deltaP: paise(scenario.income),
      kind: "income",
      order: 4,
    });
  }
  // Conservative intraday convention: all outflows settle before any same-day stipend.
  events.sort((a, b) => a.day - b.day || a.order - b.order);
  let balanceP = openingP;
  let lowestP = openingP;
  let lowestDay = 0;
  let firstBreach =
    openingP < bufferP
      ? { day: 0, label: "Opening balance", balance: rupees(openingP) }
      : null;
  const ledger = events.map(({ deltaP, order, ...event }) => {
    balanceP += deltaP;
    if (balanceP < lowestP) {
      lowestP = balanceP;
      lowestDay = event.day;
    }
    const row = {
      ...event,
      change: rupees(deltaP),
      balance: rupees(balanceP),
      belowBuffer: balanceP < bufferP,
    };
    if (!firstBreach && row.belowBuffer) firstBreach = row;
    return row;
  });
  const points = [
    { day: 0, balance: scenario.openingBalance },
    ...ledger.map(({ day, balance }) => ({ day, balance })),
    { day: months * 30, balance: rupees(balanceP) },
  ];
  const structuralPass = recurringMarginP >= 0;
  const timingPass = lowestP >= bufferP;
  const reason = !structuralPass
    ? "MONTHLY_DEFICIT"
    : !timingPass
      ? "BUFFER_BREACH"
      : "FLOW_ALIGNED";
  const title = !structuralPass
    ? "The monthly budget needs room."
    : !timingPass
      ? "The dates need another look."
      : "Your cash-flow timing lines up.";
  return {
    scenario,
    terms,
    ledger,
    points,
    months,
    horizon: months * 30,
    lowestBalance: rupees(lowestP),
    lowestDay,
    firstBreach,
    closingBalance: rupees(balanceP),
    recurringMargin: rupees(recurringMarginP),
    monthOneMargin: rupees(
      paise(scenario.income) -
        essentialP -
        paise(scenario.existingDebt) -
        paise(terms.emi) -
        paise(scenario.shock),
    ),
    requiredTopUp: rupees(Math.max(0, bufferP - lowestP)),
    structuralPass,
    timingPass,
    status: structuralPass && timingPass ? "REVIEWABLE" : "PAUSE",
    reason,
    title,
  };
}
/** Generic dated projection with the same conventions as simulate(): paise, outflows before same-day inflows, buffer floor. */
export function projectCashflow({ openingBalance, events, buffer = POLICY.buffer }) {
  const openingP = paise(openingBalance);
  const bufferP = paise(buffer);
  const sorted = events
    .map((event, index) => ({ ...event, deltaP: paise(event.amount), index }))
    .sort(
      (a, b) =>
        a.day - b.day ||
        (a.deltaP < 0 ? 0 : 1) - (b.deltaP < 0 ? 0 : 1) ||
        a.index - b.index,
    );
  let balanceP = openingP;
  let lowestP = openingP;
  let lowestDay = 0;
  const ledger = sorted.map(({ deltaP, index, ...event }) => {
    balanceP += deltaP;
    if (balanceP < lowestP) {
      lowestP = balanceP;
      lowestDay = event.day;
    }
    return { ...event, balance: rupees(balanceP) };
  });
  return {
    ledger,
    lowestBalance: rupees(lowestP),
    lowestDay,
    closingBalance: rupees(balanceP),
    breachesBuffer: lowestP < bufferP,
    shortfall: lowestP < 0,
  };
}
export function exploreSchedule(scenario) {
  const options = Array.from({ length: 30 }, (_, index) => {
    const result = simulate({ ...scenario, emiDay: index + 1 }, { months: 3 });
    return {
      day: index + 1,
      lowestBalance: result.lowestBalance,
      status: result.status,
      requiredTopUp: result.requiredTopUp,
    };
  });
  const feasible = options.filter((option) => option.status === "REVIEWABLE");
  // Prefer the earliest feasible date after income has settled; never claim this is a lender offer.
  const suggested =
    feasible.find((option) => option.day > Number(scenario.stipendDay)) ??
    feasible[0] ??
    null;
  const best = options.reduce((a, b) =>
    b.lowestBalance > a.lowestBalance ? b : a,
  );
  return { options, feasible, suggested, best };
}
