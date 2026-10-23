/**
 * Human-readable, deterministic explanation of an illustrative cash-flow result.
 * No credit approval, eligibility decision or real-world financial advice.
 */
import { POLICY } from "./cashflow.js";

export function explainDecision(result) {
  if (!result || !["REVIEWABLE", "PAUSE"].includes(result.status))
    throw new TypeError("A simulated cash-flow result is required.");
  const monthlyGap = Math.max(0, -result.recurringMargin);
  const bufferGap = Math.max(0, result.requiredTopUp);
  const reasons = [];

  if (!result.structuralPass)
    reasons.push({
      code: "MONTHLY_DEFICIT",
      heading: "Recurring costs exceed recurring income",
      detail: `The illustrative monthly budget is short by ₹${monthlyGap.toLocaleString("en-IN")}. Changing repayment dates alone cannot resolve this gap.`,
      amount: monthlyGap,
    });

  if (!result.timingPass)
    reasons.push({
      code: "BUFFER_BREACH",
      heading: "Cash falls below the protected balance",
      detail: `The lowest modeled balance is ₹${result.lowestBalance.toLocaleString("en-IN")}, which is ₹${bufferGap.toLocaleString("en-IN")} below the ₹${POLICY.buffer.toLocaleString("en-IN")} protected buffer.`,
      amount: bufferGap,
      day: result.lowestDay,
    });

  if (reasons.length === 0)
    reasons.push({
      code: "FLOW_ALIGNED",
      heading: "Both illustrative cash-flow checks pass",
      detail: "Recurring income covers modeled costs and the dated ledger stays at or above the protected balance. This is not a loan approval.",
      amount: 0,
    });

  return {
    status: result.status,
    reasons,
    disclaimer: "Synthetic cash-flow illustration only. Not a credit score, approval, or lending offer.",
  };
}
