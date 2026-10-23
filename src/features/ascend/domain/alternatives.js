import { POLICY, simulate } from "./cashflow.js";

/**
 * Deterministic, illustrative alternatives—not offers or approvals.
 * Never mutate the supplied scenario. All candidates use the same 3-cycle horizon.
 */
export function suggestAlternatives(scenario) {
  const baseline = simulate(scenario, { months: 3 });
  const candidates = [];
  for (let day = 1; day <= 30; day++) {
    if (day === scenario.emiDay) continue;
    const result = simulate({ ...scenario, emiDay: day }, { months: 3 });
    candidates.push({
      kind: "date",
      label: `Move EMI to day ${day}`,
      changes: { emiDay: day },
      result,
    });
  }
  for (let amount = Math.floor((scenario.principal - 1) / 500) * 500;
    amount >= POLICY.minPrincipal; amount -= 500) {
    const result = simulate({ ...scenario, principal: amount }, { months: 3 });
    candidates.push({
      kind: "amount",
      label: `Reduce request to ₹${amount.toLocaleString("en-IN")}`,
      changes: { principal: amount },
      result,
    });
  }
  const improvements = candidates.filter(({ result }) => {
    // Preserve every passing affordability gate, not only the combined status.
    // A better cash balance must not conceal a new monthly-budget deficit.
    if (baseline.structuralPass && !result.structuralPass) return false;
    if (baseline.timingPass && !result.timingPass) return false;
    if (baseline.status === "REVIEWABLE" && result.status !== "REVIEWABLE") return false;
    const newlyReviewable = baseline.status !== "REVIEWABLE" && result.status === "REVIEWABLE";
    const strongerBuffer = result.lowestBalance > baseline.lowestBalance &&
      result.recurringMargin >= baseline.recurringMargin;
    return newlyReviewable || strongerBuffer;
  });
  improvements.sort((a, b) =>
    Number(b.result.status === "REVIEWABLE") - Number(a.result.status === "REVIEWABLE") ||
    (a.kind === "date" ? 0 : 1) - (b.kind === "date" ? 0 : 1) ||
    (a.kind === "date"
      ? Math.abs(a.changes.emiDay - scenario.emiDay) - Math.abs(b.changes.emiDay - scenario.emiDay)
      : scenario.principal - a.changes.principal - (scenario.principal - b.changes.principal)) ||
    b.result.lowestBalance - a.result.lowestBalance
  );
  const chosen = [];
  for (const kind of ["date", "amount"]) {
    const item = improvements.find((candidate) => candidate.kind === kind);
    if (item) chosen.push(item);
  }
  return { baseline, alternatives: chosen };
}
