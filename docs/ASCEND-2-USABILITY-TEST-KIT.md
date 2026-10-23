# ASCEND 2.0 — Moderated usability test kit (v0.1)

**Purpose:** Evaluate comprehension, task success, and trust for a synthetic cash-flow and repayment exploration product. This is a research protocol, not evidence that testing has happened.

## Recruitment and safety
- Recruit 5–7 adults unfamiliar with ASCEND; include at least two mobile users if possible.
- Use **only built-in synthetic identities and scenarios**. Never request real PAN/Aadhaar, bank credentials, credit reports, or personal financial information.
- Ask permission before recording; prefer anonymous notes. Participants can stop at any time.
- Introduce ASCEND as an educational prototype with no real lending, credit check, or loan approval.

## Moderator introduction (read verbatim)
“Thanks for helping test a prototype. We are evaluating the interface, not your financial knowledge. Please think aloud as you explore. There are no wrong answers. All numbers and identities are fictional. We will not collect real financial information. You may stop at any time.”

## Tasks (do not teach participants where to click)
| ID | Task | Success criteria | Capture |
| --- | --- | --- | --- |
| T1 | Start on Apply & Consent. Explain what data access you are agreeing to, then continue with the demo. | Identifies consent choice and enters Decision Lab without help | Completion, errors, confusion |
| T2 | Find the monthly margin and lowest projected cash balance. Explain why they can tell different stories. | Correctly distinguishes monthly budget from dated liquidity | Comprehension quote |
| T3 | Switch to the late-stipend scenario (day 20). Explain the advisory status and why it changed. | Recognizes timing/buffer risk; does not interpret PAUSE as denial | Status interpretation |
| T4 | Use “What can I change?” to try one alternative. Explain what changed and whether it is an approval. | Activates a recommendation, interprets balance change, knows it is not approval | Click path, time, confidence |
| T5 | Visit Assessment & Payments and Credit Ladder. Describe what appears simulated versus real. | Recognizes simulated partner, bureau, and payment flows | Trust/misinterpretations |
| T6 | Return to Apply & Consent and locate withdrawal/deletion controls. | Can find privacy controls without coaching | Completion and time |

## Observer scorecard
Record one row per participant/task, with no identifying information.

| Participant code | Device/viewport | Task | Success (0/1) | Help needed (0/1) | Seconds | Misinterpretation | Quote | Severity (0–3) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Mobile 390px | T1 | | | | | | |

**Severity:** 0 none, 1 cosmetic, 2 blocks understanding or adds friction, 3 blocks task or creates misleading financial meaning.

## Post-test questions
1. In one sentence, what does ASCEND do?
2. What is the difference between a positive monthly margin and a safe payment date?
3. Did “REVIEWABLE” feel like an approval? Why?
4. Which part felt least trustworthy or most confusing?
5. What would you change before recommending the demo to someone else?

## Analysis plan
- **Task success rate:** completed tasks / attempted tasks; report numerator and denominator.
- **Unaided completion:** tasks completed without moderator hints / attempted tasks.
- **Critical misinterpretation rate:** participants who mistake advisory for actual approval, or cannot distinguish simulated from real.
- **Time to first useful alternative:** seconds from T4 start to correct interpretation.
- Report individual observations and limitations; with 5–7 participants, do not claim population-level statistical significance.
- Prioritize severity-3 issues before cosmetic changes. Re-test the affected task after fixing.

## Release gates before any public portfolio case-study claims
- No critical misleading credit-approval language observed in the final tested flow.
- All visible recommendation buttons are keyboard reachable and their labels distinguish alternatives.
- No horizontal clipping at common phone widths (320px, 375px, 390px, 430px) and at desktop.
- All four routes work on direct reload.
- Automated CI passes after final edits.
- Clearly disclose that real bank, AA, payment, lender, and bureau integrations are not present.

## Test results — not yet collected
Do not fill this section with fabricated interviews, metrics, or outcomes. Add dated anonymous results and exact issues only after sessions occur.
