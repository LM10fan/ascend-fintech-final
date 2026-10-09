# Ascend — Apply & Consent + Cash-flow Decision Lab

Implemented on `feature/apply-decision-lab`. The original `README.md` is unchanged. No other pages are included.

## Run on your Mac

Use Node.js 22.12+ (Node 22 LTS recommended). In a **new folder**, run:

```bash
git clone --branch feature/apply-decision-lab --single-branch https://github.com/LM10fan/caseblitz-project-ascend.git ascend-apply-lab
cd ascend-apply-lab
npm ci
npm run dev
```

Open the localhost URL printed by Vite, normally `http://127.0.0.1:5173`.

- `/apply`: applicant and lender demo registration, financial inputs, consent.
- `/decision-lab`: live simulation, chart, exact ledger, schedule explorer.
- `/`: forwards to `/apply`.

A new clone avoids switching or overwriting a teammate's worktree. The repository is private, so Git may ask you to authenticate. Dependencies are downloaded on the first `npm ci`. After that, the app runs without internet; it uses no remote fonts, images, APIs or database.

```bash
npm test
npm run test:ui
npm run build
npm run preview
```

`npm run preview` serves the built app on the localhost URL printed by Vite, normally port 4173. Refresh/deep links are supported by Vite's SPA fallback. A future static host must rewrite `/apply` and `/decision-lab` to `index.html`.

## Architecture and ownership

At inspection, `main` contained only the 72-byte README and no app code, package configuration, or `AGENTS.md`. Its base commit was `6eba75bfab85cfd936bc53f9558396fd85956928`.

| Path                                            | Responsibility                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `src/features/ascend/pages/ApplyPage.jsx`       | Apply, consent and demo reviewer registration                               |
| `src/features/ascend/pages/DecisionLabPage.jsx` | Lab controls and explainable advisory presentation                          |
| `src/features/ascend/domain/cashflow.js`        | Pure financial engine; no React, storage or network                         |
| `src/features/ascend/data/demoStore.js`         | Allowlisted synthetic fixtures, consent state and versioned storage adapter |
| `src/features/ascend/components/`               | SVG chart and feature UI components                                         |
| `src/features/ascend/ascend.css`                | Feature styles scoped to `.ascend-app`                                      |
| `src/features/ascend/index.jsx`                 | Public feature exports                                                      |
| `src/App.jsx`, `src/main.jsx`, `index.html`     | Thin standalone harness for these two pages                                 |
| `tests/`, `scripts/test-ui.mjs`                 | Domain, storage and DOM interaction checks                                  |

Root scaffolding is for the standalone prototype. If a teammate creates the final app shell in another branch, integrate the feature folder, **keep their shell**, and reconcile the package dependencies. There is no need to replace another developer's router or layout.

Each page receives `{ session, update, navigate, notify }`. `update(nextSession, persist)` changes shared state and optionally calls the storage adapter. `navigate(path)` can delegate to React Router or the final routing system; `notify(message)` renders a status message. Wrap the feature in `.ascend-app` and import its CSS. Only the two routes above are in scope.

## Financial contract

This is an illustrative deterministic cash-flow model, not an underwriting or credit scoring model.

- Principal ₹1,000–₹10,000; three installments; a **4% total-term flat charge**. This is not an APR. The ₹9,000 reference principal implies ₹360 in total charges and ₹3,120 per installment.
- Integer paise arithmetic: the first two installments round down to paise; the last reconciles the exact total. The recurring margin conservatively uses the largest installment.
- Opening balance ₹3,000. Declared stipend ₹6,000. Essentials: ₹1,500 on day 2, ₹400 on day 4, ₹450 on day 12. Existing debt, if declared, is due on day 8. Protected balance floor ₹1,000.
- Every monthly cycle has 30 days. This is an explicit modeling simplification, not calendar-date amortization.
- All same-day outflows happen before inflows. Intermediate intraday troughs count toward buffer checks. Opening cash is also checked.
- A one-off shock happens only in the first cycle. Recurring expenses, debt and income repeat. Full-term validation spans all three cycles.
- The purchase is assumed to be financed directly; loan proceeds never inflate available cash. Purchase principal is not subtracted again as a cash expense.
- The buffer is a balance floor, not a monthly expense. Negative balances are funding gaps, not an available overdraft.
- **Monthly affordability gate:** recurring income − essentials − existing debt − largest installment ≥ 0. Opening cash never rescues a recurring deficit.
- **Timing gate:** every event balance across the three cycles must be ≥ the protected buffer.
- `REVIEWABLE` requires both gates. Otherwise `PAUSE`, with `MONTHLY_DEFICIT` or `BUFFER_BREACH`. `FLOW_ALIGNED` is never an approval.
- The chart/ledger can show one cycle or the full term. The advisory result and date explorer always check the full term. All use the same engine.
- Date exploration does not change the fixed illustrative charge. A real lender must re-price and disclose changed terms.

The reference screenshot had an inconsistent ₹350 margin tile. Its ledger gives **₹530** (₹6,000 − ₹2,350 − ₹3,120); this implementation reconciles all displays to ₹530.

| Scenario                                    | Monthly recurring margin | Lowest first-cycle balance | Result                 |
| ------------------------------------------- | -----------------------: | -------------------------: | ---------------------- |
| Stipend day 5, EMI day 10                   |                     ₹530 |              ₹1,100, day 4 | REVIEWABLE             |
| Stipend day 20, EMI day 10                  |                     ₹530 |            −₹2,470, day 12 | PAUSE: BUFFER_BREACH   |
| Stipend day 20, EMI day 24                  |                     ₹530 |               ₹650, day 12 | PAUSE: BUFFER_BREACH   |
| Stipend day 5, EMI day 10, ₹600 shock day 3 |                     ₹530 |                ₹500, day 4 | PAUSE: BUFFER_BREACH   |
| Income ₹4,000, opening cash ₹50,000         |                  −₹1,470 |               Above buffer | PAUSE: MONTHLY_DEFICIT |

The day-20/day-24 scenario cannot be fixed by EMI timing alone: essentials already bring cash below the buffer before income arrives. The explorer checks all 30 dates and explains when none passes. Future stipend dates remain declared assumptions, not guaranteed income.

## Identity, consent and local persistence

- There are no arbitrary name, PAN, Aadhaar, email, password or document upload fields. Identity is selected from fixed synthetic fixtures.
- PAN and Aadhaar placeholders deliberately do not resemble valid identifiers: `DEMO-PARENT-001`, `DEMO-SELF-001`, `DEMO-AADHAAR-001`.
- The proposed first-credit parent-PAN path is shown as a demo fixture, explicitly not as a legal KYC requirement or evidence of eligibility. An existing loan history shows the applicant's synthetic PAN.
- The lender path is simulated onboarding: select an allowlisted fictional organization, reviewer role and lending focus; acknowledge demo use; run local verification. Organization type, city, reserved `.test` email and non-valid registration ID are displayed. Required fields are validated. Editing organization choices invalidates the previous verification; completion and timestamp persist. No registry, regulator or identity service is contacted.
- The lender assessment preview requires completed simulated checks, both recorded applicant permissions and valid inputs. It is read-only and follows the same applicant scenario and 90-day engine. Decision Lab reviewer mode disables financial edits, reset and schedule application; horizon, chart inspection and uncommitted date previews remain available. These local UI gates are **not** authentication or production authorization.
- Two required scopes (fixture evidence, cash-flow assessment) start unchecked. The simulated bureau scope is separate and optional. Its snapshot is hidden unless recorded consent includes it.
- Recording saves the consent version, exact scopes and timestamp. Unchecking any choice withdraws the active record; record updated choices to reactivate. Withdrawal records a revocation timestamp and enables manual mode. Changing the synthetic applicant requires fresh consent.
- Declining consent opens a labeled manual calculator. Direct navigation opens a labeled reference scenario. Neither implies permission to fetch financial data.
- Only the `ascend:apply-lab:v1` key is used. Deleting demo records removes that key, resets the UI, and preserves other developers' storage keys.
- `inputDraft` and `consentChoices` are shared across both routes and saved locally as edits happen, even before consent recording. This persists only synthetic demo choices, not permission to fetch data. Empty/invalid financial drafts survive navigation and reload; calculations explicitly retain the last valid `scenario`, exports and mutation presets are disabled until correction, and lenders cannot preview stale results. Partial consent choices never grant consent. Recording stores exact choices; changing any recorded scope immediately revokes it.
- Existing v1 sessions migrate missing fields without losing financial inputs, consent records or the legacy registration flag. A legacy registration is not treated as a completed verification.
- Storage is browser-local, unencrypted demo state, not a database. The adapter reports blocked storage instead of claiming a successful save. Invalid or outdated state recovers to the default fixture.
- Export produces a synthetic JSON receipt with model version, assumptions, consent state, reason code and event ledger. It is not a loan agreement.

For a later database: implement an authenticated API behind the adapter; validate the same input schema on the server; store application, consent and scenario versions separately; derive identity only from authorized data sources; enforce lender access on the server. Client-side consent checks and local reviewer flags are not security controls.

## Verification

- `npm test`: 30 domain, storage and lender tests passed, covering dated event totals, intraday ordering, 3-cycle projection, installment rounding, validation, buffer boundaries, consent lifecycle, shared drafts, legacy migration, corruption recovery, namespaced deletion, organization validation and verification invalidation.
- `npm run test:ui`: the expanded DOM interaction flow passed for applicant identity paths, valid/invalid input synchronization, partial consent reload, both stipend comparisons, identical chart overlay shock assumptions, one-off shock on/off over 90 days, schedule application, reset, refresh, manual path, withdrawal, deletion, organization validation, re-verification, read-only review, optional bureau revocation and profile switching.
- `npm run build`: production bundle built successfully.
- Browser visual QA was unavailable in the managed execution environment because its required browser-control capability was not exposed. DOM tests do not verify CSS layout, real browser rendering, downloaded files or touch gestures. Test the two pages on your Mac browser at desktop and mobile widths before the final presentation.
- No real KYC, bank, bureau, payment, lender or database integration is included.

## Targeted review update · 9 October 2026

- Same two routes, app shell, cream/forest palette, deterministic engine and storage namespace. No new dependency or database. Desktop shell width grows from 1440px to 1720px, with 40px side gutters; form labels are 14px, inputs 16px and supporting text 13px. Cards have larger gaps and padding. Lab columns stack below 1200px, Apply below 960px, paired comparison cards below 600px. The wide layout and mobile breakpoints require a real browser visual check before the pitch.
- Side-by-side Day 5/Day 20 cards share principal, income, opening cash, existing debt, EMI date, shock amount/day and selected horizon. Only stipend arrival changes. Both display recurring affordability, dated minimum, first buffer breach, closing cash and reason code. Changing the stipend preset no longer clears a selected shock. The optional chart comparison also retains the shock.
- The ₹600 shock is a single first-cycle event, never part of recurring essentials, and is never subtracted twice. With it on, baseline 90-day closing cash is ₹3,990; with it off it is ₹4,590. Both stipend dates have the same closing cash and ₹530 recurring margin under default amounts, but different interim liquidity.
- Shared-input helpers (`updateScenarioInputs`, `setConsentChoice`) live in `data/demoStore.js`. Use them when integrating these pages into the final app shell; do not keep additional per-page financial copies. `data/lender.js` owns synthetic organization validation/status. New presentation components are `LenderOnboarding.jsx` and `StipendComparison.jsx`.

Changed files in this update:

```text
src/features/ascend/ascend.css
src/features/ascend/components/LenderOnboarding.jsx
src/features/ascend/components/StipendComparison.jsx
src/features/ascend/data/demoStore.js
src/features/ascend/data/lender.js
src/features/ascend/domain/cashflow.js
src/features/ascend/pages/ApplyPage.jsx
src/features/ascend/pages/DecisionLabPage.jsx
tests/cashflow.test.mjs
tests/lender.test.mjs
tests/store.test.mjs
tests/ui.flow.jsx
docs/APPLY-LAB.md
```

The Mac localhost copy is independent of this checkout. To receive this update without overwriting local work, download the latest feature branch ZIP or clone that branch into a **new folder**, then run `npm ci` and `npm run dev`. Use the URL printed by that Vite instance. Keep any local customizations until they can be compared and merged. Do not replace a teammate's app shell.
