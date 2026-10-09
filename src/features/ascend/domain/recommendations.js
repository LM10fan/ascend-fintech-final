/** Data-driven credit-health suggestions. Never promises a score change, approval or timeframe. */
export function creditRecommendations({ assessment, features, report, history }) {
  const tips = [];
  const add = (id, title, body) => tips.push({ id, title, body });
  const aff = assessment?.affordability;
  if (!features || features.confidence === "LOW" || features.confidence === "INSUFFICIENT")
    add(
      "data",
      "Complete your financial picture",
      "Linking an account with 6 or more months of statements makes the assessment more reliable and less provisional.",
    );
  if (aff && (aff.status === "TIGHT" || aff.status === "FAIL"))
    add(
      "afford",
      "Keep repayments comfortably affordable",
      "Aim for repayments that use no more than half of your monthly free cash flow. A smaller amount, or waiting until income steadies, protects your essentials.",
    );
  if (report?.status === "RETRIEVED" && report.utilization != null && report.utilization > 0.3)
    add(
      "util",
      "Bring card utilisation down",
      `Your reported card balances are about ${Math.round(report.utilization * 100)}% of your limits. Lenders generally view lower utilisation more favourably.`,
    );
  if (report?.status === "RETRIEVED" && (report.enquiries6m ?? 0) >= 3)
    add(
      "enquiries",
      "Avoid unnecessary credit applications",
      "Several recent enquiries are on your report. Apply only for credit you actually need.",
    );
  if (history && history.missed > 0)
    add(
      "missed",
      "Talk to your lender early",
      "If a payment might be late, contacting the lender before the due date gives you more options.",
    );
  else if (!history || history.onTime < 3)
    add(
      "history",
      "Build a verified repayment history",
      "Repaying each installment on or before its due date is what moves you up the Ascend ladder. Borrowing more does not.",
    );
  if (features?.estimated.incomeCV != null && features.estimated.incomeCV > 0.35)
    add(
      "buffer",
      "Keep a cushion for uneven months",
      "Your income varies month to month. Setting aside one month of essentials helps you cover repayments in a low month.",
    );
  if ((features?.observed.lowBalanceMonths ?? 0) >= 3)
    add(
      "timing",
      "Line up payments with your income",
      "Your balance dipped very low in several months. Check that due dates fall after your income usually arrives.",
    );
  if (!report)
    add(
      "bureau",
      "Check your bureau report when you're ready",
      "Fetching your report lets you confirm that what lenders see about you is accurate.",
    );
  add(
    "spend",
    "Spending more does not build credit",
    "Using credit only for planned, necessary purchases and repaying on time is what counts.",
  );
  return tips.slice(0, 5);
}
