# Ascend — Assessment & Payments + CIBIL & Credit Ladder

Two pages added beside the original Apply & Consent and Decision Lab pages. The original pages, routes and styles are unchanged apart from a shared profile switch and an optional "loaded from AA" notice in the Lab.

| Route | Page |
| --- | --- |
| `/apply` | 01 Apply & Consent (original) |
| `/decision-lab` | 02 Cash-flow Decision Lab (original) |
| `/assessment` | 03 AA analysis, SDA verification, affordability preview, UPI / net-banking payments |
| `/credit` | 04 Bureau profile ("Fetch My CIBIL Score"), Ascend level, collateral breakdown, lender pathway |

## Everything external is simulated

| Integration | Demo adapter (`integrations/demoServices.js`) | Live status |
| --- | --- | --- |
| Account Aggregator | `createConsent`, `fetchFIData`, `revokeConsent` | Not connected |
| SDA / bank | `verifyBalance`, `confirmDeposit` (never marks a lien) | Not connected |
| Payments | `createPayment`, `getPaymentStatus`, `handlePaymentReturn` + demo-only `simulateCheckout` / `simulateSettlement` | Not connected |
| Credit bureau | `requestCreditReport`, `getCreditReportStatus`, `normalizeCreditReport` | Not connected |
| Lender | `submitForReview` (receipt only, never an approval) | Not connected |

`App` accepts a `services` prop. To go live, implement the same methods in adapters that call **your own backend**. That backend holds every credential and talks to the authorised AA (FIU), bank / partner, payment gateway, bureau access partner and regulated lender. Payment success must be confirmed server-side (gateway status API or signed webhook). The browser-reported status is ignored even in the demo. No secret belongs in frontend code.

Simulated bureau reports are labelled "SIMULATED EXAMPLE · NOT A CIBIL REPORT". The verified-score slot stays "No verified CIBIL score available yet." unless a live adapter returns `verified: true`.

## Single source of truth

- `domain/creditLadder.js`: ladder rules and arithmetic (integer paise). Base limit = SDA × level %. Proposed lien = base limit × collateral %. Available savings = SDA − other holds − confirmed lien. Available credit = approved limit − outstanding.
- `domain/aaFeatures.js`: 12-month feature engineering, with `observed` and `estimated` values separated. Missing data stays `null`.
- `domain/riskEngine.js`: `assessCreditProfile(aaFeatures, sdaData, repaymentHistory, existingCreditData, { model })`. The default `hybridModel` applies the explainable rules, then a trained default-risk model as a one-way guardrail. Any other `model.riskCap(featureVector)` can still be passed in.
- `domain/defaultModel.js` + generated `domain/riskModelWeights.js`: the trained model (see below).

## Trained risk model

`npm run train:model` downloads the UCI *Default of Credit Card Clients* dataset (30,000 accounts, CC0) from the public OpenML API ([data id 42477](https://www.openml.org/d/42477)). No API key is needed. The script caches the download in `scripts/.cache/` (`-- --offline` reuses it), trains, and regenerates `riskModelWeights.js`. The browser never calls the API. It scores locally from the committed weights.

- **Inputs**: Ascend repayment outcomes (count, share late, share missed, any missed) and bureau card utilisation when a report is retrieved. Dataset months map to installments: paid duly or revolving counts as on time, 1 month overdue as late, and 2+ months overdue as missed. Sex, education, marital status and age are excluded.
- **Model**: L2-regularised logistic regression, with standardised inputs, fitted by IRLS. The penalty is chosen by stratified 5-fold cross-validation, and results are reported on a 20% holdout. There are two variants: one for history only, and one for history plus utilisation when a bureau report exists.
- **The training script fails, and writes nothing, if** the holdout AUC is under 0.65, the CV/holdout AUC gap is over 0.03, the calibration error (ECE) is over 0.03, or a risk factor (late, missed, utilisation) changes sign in any of 30 bootstrap refits. The current fit has a holdout AUC of 0.75–0.76 and an ECE of about 0.01.
- **Safeguards at scoring time**:
  - Applicants with no repayment history are not scored, so a first application is never penalised.
  - Inputs outside the training range are clipped.
  - Malformed counts are treated as missing.
  - Invalid or missing weights fall back to rules-only.
- **Policy**: an estimated chance of a missed payment of 30% or more caps the level at L3, and 50% or more caps it at L2. Both raise `MODEL_ELEVATED_RISK` and require lender review. The model never raises a level. On the holdout, those bands defaulted at about 38% and 65%, against 12% for the low band.
- **Caveat**: the data comes from Taiwanese credit cards in 2005, standing in for Ascend installments. Estimates are indicative only. Re-fit the model on Ascend's own repayment outcomes before relying on it.
- `data/creditState.js`: `deriveCredit(session)` is called by both pages; `sanitizeCredit` validates persisted state.

The ladder levels are proposed prototype rules, not lender policy or RBI-approved terms.

## Level assignment, in order

1. A verified, fresh (≤24 h) SDA balance of at least ₹1,000 is required. Otherwise the result is `INCOMPLETE`.
2. Data confidence: under 6 months of AA data caps the level at L1 (provisional); 6–9 months caps it at L2.
3. Income variation over 60% caps at L1; 35–60% caps at L2. Integrity flags cap at L2 and need review. Two or more payment returns cap at L1.
4. Ascend repayment history: under 3 on-time repayments caps at L2 (not treated as negative). 3+ allows L3, 6+ with ≤1 late allows L4, 12+ allows L5. Any missed repayment caps at L2. Adverse bureau data caps at L2. A clean bureau file of 24+ months adds at most one step, never to L5.
5. Affordability: the full-use installment (3 months, 4% flat, as in the Lab) must be ≤50% of estimated free cash flow and survive the stress scenarios (delayed income, essential shock, +25% discretionary spending, 50% lower balance). If even L1 fails, the result is `PAUSE`.
6. Trained model guardrail: when there is repayment history, an elevated estimated chance of a missed payment caps the level at L3, and a high one caps it at L2 (see above).
7. L3+ (unsecured exposure), provisional, tight or flagged cases require manual lender review. Fast-track means expedited review only.

## Demo profiles

Open **Demo controls** on either new page. Aarav → L2. Mira (volatile freelancer) → L1 with tight affordability. Riya → L1. Kabir → L4 with an active L2 demo facility, upgrade path and fast-track. Dev (4 months of data) → provisional L1. Neha → pause. Balance, income and expense levels, EMI, repayment history, coverage, bureau response and SDA outcome are all adjustable.

## Running on Windows with Smart App Control

Rollup's native binary is blocked by Windows Application Control on some machines. `package.json` therefore overrides `rollup` with the official WebAssembly build `@rollup/wasm-node` (same version). It is slower but behaves identically.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # domain, state, model and adapter unit tests
npm run train:model  # re-train the risk model from the OpenML public API
npm run test:ui    # original flow + credit flow (jsdom)
npm run build
```
