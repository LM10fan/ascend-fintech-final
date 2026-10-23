# ASCEND 2.0 — First usability session runbook

**Before starting:** Open the latest *full-project* ASCEND 2.0 preview link from the development branch's Vercel deployment. Do not use the original CaseBlitz production site or the older two-page preview. Verify the four routes /apply, /decision-lab, /assessment and /credit, including direct reload.

**Research artifacts:** Use `docs/ASCEND-2-USABILITY-TEST-KIT.md` for the six tasks, and duplicate `research/usability-observations-template.csv` locally for each research round. The CSV intentionally has no participant data.

**Suggested 20–25-minute session**
- 2 minutes: explain synthetic-only prototype, consent to notes, think-aloud instructions.
- 15–18 minutes: run T1–T6 without showing the participant how to complete each task.
- 3–5 minutes: ask the five post-test questions and record exact quotations.

**Device coverage**
- At least one session on a real Android or iOS device.
- At least one desktop session using keyboard navigation (Tab, Shift+Tab, Enter/Space).
- Manually inspect 320px, 375px, 390px, 430px and desktop viewports for clipping. A responsive CSS rule alone is not evidence that these passed.

**Do not contaminate the findings**
- Never explain the difference between recurring margin and dated liquidity before T2.
- Never tell participants which alternative to choose in T4.
- Do not ask for real financial, identity, banking or credit data.
- Record failed tasks and uncomfortable interpretations as carefully as successful ones.

**After each session**
1. Save anonymous task rows with success, help, duration, misinterpretation and severity.
2. Note the first three usability issues and exact steps to reproduce.
3. If a participant thinks REVIEWABLE means loan approval, treat as a high-priority trust issue.
4. Do not modify the scorecard to make outcomes appear stronger.
5. Only summarize results after actual observations exist; include sample size and limitations.

**Release decision:** CI green is necessary but insufficient. Public portfolio claims about user testing require completed sessions and a documented findings summary.
