# EnCyCloPedic Fintech · Project Ascend

CaseBlitz 2026 fintech prototype: a savings-backed credit ladder for students and first-time borrowers.

## Pages

| Route | Page |
| --- | --- |
| `/apply` | 01 Apply & Consent: applicant profile and consent; lender onboarding with a read-only assessment preview |
| `/decision-lab` | 02 Cash-flow Decision Lab: day-by-day balance projection, stress tests, EMI date explorer |
| `/assessment` | 03 Assessment & Payments: Account Aggregator analysis, SDA verification, Ascend Pay (UPI / net banking), downloadable JSON report |
| `/credit` | 04 CIBIL & Credit Ladder: bureau report, Ascend level (L1–L5), LIEN and collateral breakdown, lender review |

## Run it

Requires Node.js 22.12 or later.

```bash
npm ci              # install dependencies
npm run dev         # http://127.0.0.1:5173
npm test            # unit tests (logic, risk model, data cleaning, report)
npm run test:ui     # end-to-end UI flows (jsdom)
npm run build       # production build in dist/
npm run train:model # re-train the risk model from the OpenML public API
```

## Risk model

Explainable rules set each applicant's level cap. A logistic-regression model trained on the public UCI *Default of Credit Card Clients* dataset (fetched from the OpenML API) can only lower that cap, never raise it. Details, safeguards and limitations are in [docs/CREDIT-ASSESSMENT.md](docs/CREDIT-ASSESSMENT.md).

## Data

All applicant data lives in the browser (localStorage). There is no backend or database. Account Aggregator, bank, payment, bureau and lender connections are adapters in `src/features/ascend/integrations/` with the same interface a live backend would implement. Ascend is a technology platform, not a bank or NBFC.

More detail: [docs/APPLY-LAB.md](docs/APPLY-LAB.md), [docs/CREDIT-ASSESSMENT.md](docs/CREDIT-ASSESSMENT.md).
