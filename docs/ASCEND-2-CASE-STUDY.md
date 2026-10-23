# ASCEND 2.0 — Product case study (working draft)

## Product thesis
Students and other stipend-dependent first-time borrowers can have a positive monthly margin yet face an inability to make a payment on its due date. ASCEND explores **cash-flow timing**, not merely aggregate monthly income. It is an educational, synthetic prototype—not a loan offer, underwriting decision, licensed lender, or live financial-data integration.

## Problem and user
**User:** A stipend-dependent borrower evaluating a small essential purchase, and a lender reviewer trying to understand the same cash-flow evidence.

**Job to be done:** “Before I commit to a repayment schedule, help me understand whether I can afford the installments *on their actual dates*, and what single change could make the schedule safer.”

**Design constraint:** An apparently better projected minimum balance must never be marketed as an improvement if it downgrades the overall advisory outcome from REVIEWABLE to PAUSE.

## Product evolution
| Version | Capability | Product rationale |
| --- | --- | --- |
| CaseBlitz hackathon prototype | Apply & Consent and Cash-flow Decision Lab, integrated with Assessment & Payments and Credit Ladder | Demonstrate consent-first exploration and an end-to-end synthetic journey |
| ASCEND 2.0 | Separate structural-margin and dated-liquidity explanations | Explain *why* a scenario is paused rather than showing only a status |
| ASCEND 2.0 | “What can I change?” repayment date / amount alternatives | Turn a diagnostic result into an actionable simulation |
| ASCEND 2.0 | Explicit projected minimum-balance delta and financial mechanism | Make alternative recommendations understandable and comparable |
| ASCEND 2.0 | Prevent REVIEWABLE → PAUSE recommendation downgrade | Preserve advisory safety rather than optimizing a single metric |
| ASCEND 2.0 | Responsive alternative cards and descriptive button names | Improve mobile and assistive-technology usability |

## How the simulation works
The model uses a deterministic, synthetic cash-flow ledger over three 30-day cycles. It computes an illustrative recurring margin and the lowest dated cash balance; the timing gate compares that balance with a protected buffer. The engine tests alternative EMI dates (days 1–30) and lower principal amounts in ₹500 steps, and offers at most one alternative of each type. Results are simulations, not approvals. See `src/features/ascend/domain/cashflow.js` and `alternatives.js` for the exact implementation and policy constants.

## Example (synthetic, not a real customer)
A ₹9,000 purchase scenario has a recurring margin of ₹530. Moving the stipend from day 5 to day 20 changes the projected lowest balance from ₹1,100 to −₹2,470 in the original scenario. The monthly margin alone would conceal this liquidity risk.

## Engineering evidence
- Automated CI executes `npm ci`, `npm test`, `npm run test:ui`, and `npm run build`.
- Tests cover simulation consistency, consent and storage behavior, multi-page flows, recommendation interactions, and a no-status-downgrade invariant.
- CI passing validates these checks; it does **not** establish real-device usability, security certification, financial-model validity, or regulatory compliance.

## Ownership and collaboration
- **Individually built during the hackathon:** Apply & Consent and Cash-flow Decision Lab.
- **Built by teammates during the hackathon:** Assessment & Payments and Credit Ladder.
- **Subsequent development:** ASCEND 2.0 improvements to decision explanations, alternatives, automated checks, and usability are being developed on a separate feature branch. Do not claim sole authorship of the full four-page product.

## What we still need to learn
1. **Comprehension:** Can a new user explain the difference between monthly affordability and dated liquidity after one scenario?
2. **Decision quality:** Can they identify which suggested alternative changes timing versus total debt burden?
3. **Trust:** Do users understand that REVIEWABLE is *not* loan approval?
4. **Usability:** Can a user complete the flow on a small phone with keyboard and screen-reader support?
5. **Real-world feasibility:** Legal, lending-policy, privacy, data-consent, and partner-integration review are prerequisites to any real financial deployment.

## Suggested usability protocol
Recruit 5–7 people who have not seen the product. Ask them to run the synthetic late-stipend case, interpret the status without coaching, choose an alternative, and explain its tradeoff. Record task completion, misinterpretations, time to decision, and confidence. Do not enter real PAN, Aadhaar, banking, or credit data.

## Portfolio evidence boundaries
**Supported:** interactive four-page synthetic prototype, deterministic cash-flow simulation, explanation layer, alternative explorer, regression tests, and CI pipeline.

**Not supported:** real bank/account-aggregator integrations, actual loan origination, production credit underwriting, regulatory approval, measured customer outcomes, or product-market fit.
