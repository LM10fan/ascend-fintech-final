import React, { useMemo, useState } from "react";
import { Badge, Icon } from "../components/ui.jsx";
import {
  DemoNote,
  Formula,
  KeyValue,
  LevelLadder,
  StageList,
  dateTime,
  inr,
  percent,
} from "../components/creditUi.jsx";
import { DemoControls, DemoModeBar } from "../components/DemoControls.jsx";
import { LENDER, PROFILES } from "../data/demoStore.js";
import { deriveCredit } from "../data/creditState.js";
import { LEVELS } from "../domain/creditLadder.js";
import { BUREAU_STALE_DAYS } from "../domain/riskEngine.js";
import { creditRecommendations } from "../domain/recommendations.js";

const STATUS = {
  READY_FOR_LENDER_REVIEW: ["Ready for lender review", "green"],
  PROVISIONAL: ["Provisional", "amber"],
  PAUSE: ["Pause recommended", "amber"],
  INCOMPLETE: ["Incomplete", "neutral"],
};
const BUREAU_BADGE = {
  RETRIEVED: ["REPORT RETRIEVED", "green"],
  NO_HISTORY: ["NO BUREAU HISTORY", "neutral"],
  IDENTITY_REQUIRED: ["IDENTITY CHECK NEEDED", "amber"],
  PROVIDER_UNAVAILABLE: ["PROVIDER UNAVAILABLE", "red"],
  FAILED: ["REQUEST FAILED", "red"],
};
/** Ascend's own display bands for a 300–900 score. Not the bureau's interpretation. */
const BANDS = [
  [750, "Strong"],
  [650, "Good"],
  [550, "Fair"],
  [300, "Needs attention"],
];
const bandFor = (score) => BANDS.find(([min]) => score >= min)?.[1] ?? "—";
const BUREAU_STAGES = ["Consent recorded", "Identity matched with the provider", "Report requested from the bureau"];

export function CreditPage({ session, update, navigate, notify, services }) {
  const model = useMemo(() => deriveCredit(session), [session]);
  const { assessment: a, report, features, facility, history } = model;
  const credit = session.credit;
  const profile = PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  const [demoOpen, setDemoOpen] = useState(false);
  const [bureauStep, setBureauStep] = useState(null);
  const [bureauAgree, setBureauAgree] = useState(false);
  const [bureauError, setBureauError] = useState("");
  const [lenderBusy, setLenderBusy] = useState(false);
  const recommendations = useMemo(
    () => creditRecommendations({ assessment: a, features, report, history }),
    [a, features, report, history],
  );
  const sdaVerified = credit.sda.status === "VERIFIED";
  const position = a.position;
  const [statusLabel, statusTone] = STATUS[a.status];
  const reportStale =
    report && (Date.parse(model.now) - Date.parse(report.retrievedAt)) / 86400000 > BUREAU_STALE_DAYS;
  const application = credit.application;
  const submitted = application.status === "SUBMITTED_FOR_REVIEW";
  const changedSinceSubmit = submitted && application.assessedLevel !== a.recommendedLevel;
  const upgrade =
    facility && a.recommendedLevel && a.recommendedLevel > facility.level && a.eligibleToProceed
      ? a.levels[a.recommendedLevel - 1]
      : null;
  const levelSpec = a.recommendedLevel ? LEVELS[a.recommendedLevel - 1] : null;

  function patchFor(profileId, fn) {
    update((current) => (current.profileId === profileId ? { ...current, credit: fn(current.credit) } : current), true);
  }

  async function requestReport(identityVerified = credit.bureau.identityVerified) {
    const profileId = session.profileId;
    const scenario = credit.demo.bureauScenario;
    const consentAt = new Date().toISOString();
    setBureauStep("fetching");
    setBureauError("");
    try {
      const request = await services.bureau.requestCreditReport({
        userId: profileId,
        consentReference: `CONSENT-${profileId}-${Date.parse(consentAt)}`,
        scenario,
        identityVerified,
      });
      const result = await services.bureau.getCreditReportStatus(request.requestId);
      if (result.state !== "COMPLETED") throw new Error("The bureau did not return a report. Nothing was retrieved.");
      const retrievedAt = new Date().toISOString();
      const normalized = services.bureau.normalizeCreditReport(result.payload, { requestId: request.requestId, retrievedAt });
      patchFor(profileId, (current) => ({
        ...current,
        bureau: { consentAt, requestId: request.requestId, retrievedAt, scenario, identityVerified },
      }));
      setBureauAgree(false);
      notify(
        {
          RETRIEVED: "Bureau report retrieved. Your assessment has been recalculated.",
          NO_HISTORY: "No bureau history found. That is not treated as negative.",
          IDENTITY_REQUIRED: "The provider needs an identity check before it can return a report.",
          PROVIDER_UNAVAILABLE: "The bureau provider is unavailable. Nothing was retrieved.",
          FAILED: "The bureau request timed out. Nothing was retrieved.",
        }[normalized.status],
      );
    } catch (error) {
      setBureauError(error.message || "The request failed. Nothing was retrieved.");
    } finally {
      setBureauStep(null);
    }
  }
  function withdrawBureau() {
    patchFor(session.profileId, (current) => ({
      ...current,
      bureau: { consentAt: null, requestId: null, retrievedAt: null, scenario: null, identityVerified: false },
    }));
    notify("Bureau consent withdrawn. The report was removed from your profile and your assessment.");
  }
  async function shareForReview() {
    const profileId = session.profileId;
    setLenderBusy(true);
    try {
      const result = await services.lender.submitForReview({ level: a.recommendedLevel, baseLimit: a.baseLimit });
      patchFor(profileId, (current) => ({
        ...current,
        application: {
          status: "SUBMITTED_FOR_REVIEW",
          assessedAt: current.application.assessedAt ?? new Date().toISOString(),
          assessedLevel: a.recommendedLevel,
          submittedAt: result.receivedAt,
          reference: result.reference,
        },
      }));
      notify(`Shared with ${LENDER.name} for review. This is not an approval yet.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setLenderBusy(false);
    }
  }

  const stages = [
    {
      label: "Ascend internal assessment",
      state: sdaVerified ? "done" : "todo",
      detail: sdaVerified
        ? a.recommendedLevel
          ? `Level ${a.recommendedLevel} recommended · explainable rules`
          : "Completed · pause recommended"
        : "Needs a verified SDA balance",
    },
    {
      label: "Preliminary eligibility",
      state: a.eligibleToProceed ? "done" : a.status === "PAUSE" ? "blocked" : "todo",
      detail: a.eligibleToProceed
        ? a.status === "PROVISIONAL"
          ? "Provisional: more data is needed"
          : "Meets Ascend's internal checks"
        : a.status === "PAUSE"
          ? "Repayments don't fit current cash flow"
          : "Waiting on missing information",
    },
    {
      label: "Lender-specific underwriting",
      state: submitted ? "active" : "todo",
      detail: submitted
        ? `Shared with ${LENDER.name} · ${application.reference}`
        : a.eligibleToProceed
          ? "Your profile is ready for lender review."
          : "Not started",
    },
    { label: "Final lender approval", state: "todo", detail: "Only the lender decides." },
    {
      label: "Credit facility activation",
      state: facility ? "done" : "todo",
      detail: facility ? `Level ${facility.level} facility active` : "Not active",
    },
  ];

  return (
    <>
      <header className="asc-page-heading lab">
        <div>
          <div className="asc-eyebrow">
            <span>04</span> CIBIL & CREDIT LADDER
          </div>
          <h1>
            Credit that grows <em>with your habits.</em>
          </h1>
          <p>
            Your bureau profile, your Ascend level and exactly what is secured. On-time repayment moves you up.
            Spending more never does.
          </p>
        </div>
        <div className="asc-lab-profile">
          <div className="asc-avatar">{profile.initials}</div>
          <div>
            <strong>{profile.name}</strong>
            <span>{a.recommendedLevel ? `Level ${a.recommendedLevel} recommended` : statusLabel}</span>
          </div>
        </div>
      </header>
      <DemoModeBar open={demoOpen} onToggle={() => setDemoOpen(!demoOpen)} />
      {demoOpen && <DemoControls session={session} update={update} notify={notify} />}
      {!sdaVerified ? (
        <div className="asc-notice">
          <Icon name="info" />
          <p>Verify your SDA balance on the Assessment page to see your level, limit and collateral. AA data makes the result more reliable.</p>
          <button className="asc-text-button" onClick={() => navigate("/assessment")}>
            Go to Assessment <Icon size={15} />
          </button>
        </div>
      ) : application.status === "DRAFT" ? (
        <div className="asc-notice">
          <Icon name="info" />
          <p>This view updates live. Use "Analyze My Credit Profile" on the Assessment page to record your assessment.</p>
          <button className="asc-text-button" onClick={() => navigate("/assessment")}>
            Go to Assessment <Icon size={15} />
          </button>
        </div>
      ) : null}

      <section className="asc-card asc-ladder-card">
        <div className="asc-card-title">
          <div>
            <div className="asc-eyebrow">THE ASCEND LADDER</div>
            <h2>Five levels, one honest step at a time.</h2>
          </div>
          <span className="asc-caption">Ascend product rules. Final terms are set by the partner lender.</span>
        </div>
        <LevelLadder levels={a.levels.length ? a.levels : LEVELS} recommended={a.recommendedLevel} facilityLevel={facility?.level} />
      </section>

      <div className="asc-lab-grid">
        <div className="asc-lab-main">
          <section className="asc-card asc-panel" aria-labelledby="bureau-title">
            <div className="asc-card-title">
              <h3 id="bureau-title">Credit bureau profile</h3>
              {report ? (
                <Badge tone={reportStale ? "amber" : BUREAU_BADGE[report.status][1]}>
                  {reportStale ? "OUT OF DATE" : BUREAU_BADGE[report.status][0]}
                </Badge>
              ) : (
                <Badge>NOT REQUESTED</Badge>
              )}
            </div>
            {report?.status !== "RETRIEVED" && (
              <div className="asc-score-empty">
                <strong data-testid="verified-score">No CIBIL score available yet.</strong>
                <p>
                  {report?.status === "NO_HISTORY"
                    ? "No CIBIL score is available yet. You can keep building a repayment history through eligible credit products. A missing score is not a score of zero."
                    : "Ascend has no bureau report for you yet. Repaying eligible credit responsibly can help build a credit history over time, but whether and how a score is generated depends on the bureau's data and methods."}
                </p>
              </div>
            )}
            {bureauStep === "fetching" ? (
              <div className="asc-progress" role="status" aria-live="polite">
                <StageList label="Bureau request progress" stages={BUREAU_STAGES.map((label, index) => ({ label, state: index < 2 ? "done" : "active" }))} />
              </div>
            ) : bureauStep === "consent" ? (
              <div className="asc-consent-panel">
                <strong>Before Ascend requests your report</strong>
                <div className="asc-fixture-list compact">
                  <KeyValue label="What is requested" value="Your credit report and score" />
                  <KeyValue label="Purpose" value="Ascend credit assessment" />
                  <KeyValue label="Identity used" value={profile.ownPan} />
                  <KeyValue label="Provider" value="Partner credit bureau" />
                </div>
                <label className="asc-consent-row">
                  <input type="checkbox" checked={bureauAgree} onChange={(event) => setBureauAgree(event.target.checked)} />
                  <span>
                    <strong>
                      I authorise Ascend to request my credit report for this assessment <b>Required</b>
                    </strong>
                    <small>Ascend never asks for your CIBIL login. You can withdraw this at any time.</small>
                  </span>
                </label>
                <div className="asc-actions">
                  <button className="asc-button primary" disabled={!bureauAgree} onClick={() => requestReport()}>
                    Request my report <Icon size={16} />
                  </button>
                  <button className="asc-button secondary" onClick={() => setBureauStep(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {report?.status === "RETRIEVED" && (
                  <div className="asc-score-sim" aria-label="Bureau report">
                    <div className="asc-status-line">
                      <Badge tone="green">BUREAU REPORT</Badge>
                      <span>Retrieved {dateTime(report.retrievedAt)}</span>
                    </div>
                    <div className="asc-score-row">
                      <div>
                        <strong className="asc-score-number" data-testid="simulated-score">{report.score}</strong>
                        <span>
                          of 300–900 · {bandFor(report.score)}
                          <small>Display band by Ascend, not the bureau</small>
                        </span>
                      </div>
                      <div className="asc-score-scale" aria-hidden="true">
                        <i style={{ left: `${((report.score - 300) / 600) * 100}%` }} />
                      </div>
                    </div>
                    <div className="asc-kv-list">
                      <KeyValue label="Source" value={`${report.bureau} · ${report.requestId}`} />
                      <KeyValue label="Credit history" value={report.historyMonths != null ? `${report.historyMonths} months` : "—"} />
                      <KeyValue label="Card utilisation" value={percent(report.utilization)} />
                      <KeyValue label="Enquiries in 6 months" value={report.enquiries6m ?? "—"} />
                    </div>
                    {report.factors.length > 0 && (
                      <ul className="asc-factor-list">
                        {report.factors.map((factor) => (
                          <li key={factor}>{factor}</li>
                        ))}
                      </ul>
                    )}
                    <details className="asc-adjust asc-findings">
                      <summary>
                        Reported accounts ({report.accounts.length}) <Icon name="chevron" size={15} />
                      </summary>
                      <div className="asc-kv-list">
                        {report.accounts.map((account) => (
                          <KeyValue
                            key={`${account.type}-${account.openedOn}`}
                            label={`${account.type} · ${account.status}`}
                            hint={`Opened ${account.openedOn} · most overdue ${account.maxDpd} days`}
                            value={`${inr(account.balance)} of ${inr(account.limit)}`}
                          />
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                {report?.status === "IDENTITY_REQUIRED" && (
                  <div className="asc-error" role="status">
                    The provider couldn't match your identity. Complete an identity check to continue.
                    <button className="asc-text-button" onClick={() => requestReport(true)}>
                      Complete identity check
                    </button>
                  </div>
                )}
                {report?.status === "PROVIDER_UNAVAILABLE" && (
                  <p className="asc-error" role="status">The bureau provider is unavailable right now. Nothing was retrieved. Try again later.</p>
                )}
                {report?.status === "FAILED" && (
                  <p className="asc-error" role="status">The request timed out or failed. Nothing was retrieved.</p>
                )}
                {bureauError && (
                  <p className="asc-error" role="alert">
                    {bureauError}
                  </p>
                )}
                <div className="asc-actions">
                  <button
                    className="asc-button primary"
                    onClick={() => {
                      setBureauStep("consent");
                      setBureauAgree(false);
                    }}
                  >
                    {report?.status === "RETRIEVED" ? "Refresh my report" : "Fetch My CIBIL Score"}
                    <Icon size={16} />
                  </button>
                  {report && (
                    <button className="asc-button secondary" onClick={withdrawBureau}>
                      Withdraw bureau consent
                    </button>
                  )}
                </div>
              </>
            )}
            <DemoNote>
              Reports are retrieved only through an authorised bureau partner, with identity verification and your consent.
            </DemoNote>
          </section>

          <section className="asc-card asc-panel" aria-labelledby="level-title">
            <div className="asc-card-title">
              <h3 id="level-title">Your Ascend level</h3>
              <Badge tone={statusTone}>{statusLabel.toUpperCase()}</Badge>
            </div>
            <div className="asc-level-hero">
              <span className="asc-level-num">{a.recommendedLevel ? `L${a.recommendedLevel}` : "—"}</span>
              <div>
                <strong data-testid="assigned-level">
                  {a.recommendedLevel
                    ? `Level ${a.recommendedLevel} · ${a.levelName}`
                    : a.status === "PAUSE"
                      ? "No level recommended right now"
                      : "Not assessed yet"}
                </strong>
                <small>
                  {levelSpec
                    ? `${levelSpec.role} · ${levelSpec.limitPct}% of SDA · ${levelSpec.collateralPct === 0 ? "subject to lender approval" : `${levelSpec.collateralPct}% of the limit secured`}`
                    : a.status === "PAUSE"
                      ? "Repayments wouldn't fit your current cash flow."
                      : "Complete the Assessment page first."}
                </small>
              </div>
            </div>
            {a.reasons.length > 0 && (
              <>
                <h4>Why this result</h4>
                <ul className="asc-reasons">
                  {a.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
            {a.progression.completed.length > 0 && (
              <div className="asc-milestones">
                {a.progression.completed.map((item) => (
                  <span key={item}>
                    <Icon name="check" size={12} />
                    {item}
                  </span>
                ))}
              </div>
            )}
            {a.progression.nextLevel && (
              <>
                <h4>To reach Level {a.progression.nextLevel}</h4>
                <ul className="asc-reqs">
                  {a.progression.requirements.map((req) => (
                    <li key={req.label} className={req.met === true ? "met" : req.met === false ? "unmet" : "pending"}>
                      <Icon name={req.met === true ? "check" : req.met === false ? "close" : "clock"} size={13} />
                      {req.label}
                      <span className="asc-sr-only">{req.met === true ? " (met)" : req.met === false ? " (not yet met)" : " (decided by the lender)"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {a.missing.length > 0 && (
              <>
                <h4>Missing information</h4>
                <ul className="asc-reqs">
                  {a.missing.map((item) => (
                    <li key={item} className="unmet">
                      <Icon name="info" size={13} />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="asc-caption">Status: {
              { DRAFT: "not recorded yet", ASSESSED: `assessed ${dateTime(application.assessedAt)}`, SUBMITTED_FOR_REVIEW: `shared for lender review ${dateTime(application.submittedAt)}` }[application.status]
            }. Levels reward on-time repayment and stability, never higher spending.</p>
          </section>

          <section className="asc-card asc-panel" aria-labelledby="breakdown-title">
            <div className="asc-card-title">
              <h3 id="breakdown-title">Credit & collateral breakdown</h3>
              <Icon name="layers" size={19} />
            </div>
            <div className="asc-power">
              <div>
                <span>Savings you can use</span>
                <strong data-testid="power-savings">{inr(position?.availableSavings)}</strong>
              </div>
              <div>
                <span>Credit you can use</span>
                <strong data-testid="power-credit">{position ? inr(position.availableCredit) : "—"}</strong>
              </div>
            </div>
            <p className="asc-caption">Shown separately. Savings and credit are never added together as one balance.</p>
            <div className="asc-kv-list numbered">
              <KeyValue label="1 · SDA balance" value={sdaVerified ? inr(credit.sda.balance) : "—"} hint={sdaVerified ? `Verified ${dateTime(credit.sda.checkedAt)}` : "Not verified"} testId="bd-sda" />
              <KeyValue label="2 · Confirmed LIEN" tag="Bank-confirmed" value={sdaVerified ? inr(credit.sda.confirmedLien) : "—"} hint="The only amount actually restricted for Ascend" testId="bd-confirmed" />
              <KeyValue
                label="3 · Proposed LIEN"
                tag="Proposed"
                value={inr(a.proposedLien)}
                hint={levelSpec ? `Base limit × ${levelSpec.collateralPct}%. Not marked until a lender approves and the bank confirms.` : "No level recommended"}
                testId="bd-proposed"
              />
              <KeyValue label="4 · Available savings" value={inr(position?.availableSavings)} hint="SDA balance − existing holds − confirmed LIEN" testId="bd-savings" />
              <KeyValue label="5 · Base credit limit" tag="Proposed" value={inr(a.baseLimit)} hint={levelSpec ? `SDA balance × ${levelSpec.limitPct}%. A proposal, not approved credit.` : "No level recommended"} testId="bd-limit" />
              <KeyValue label="6 · Outstanding balance" value={inr(position ? position.outstanding : 0)} hint={facility ? "Owed on your active facility" : "No active facility"} testId="bd-outstanding" />
              <KeyValue
                label="7 · Available credit"
                value={position ? inr(position.availableCredit) : "—"}
                hint={facility ? `Approved limit ${inr(facility.approvedLimit)} − outstanding` : "No credit is available until a lender activates a facility"}
                testId="bd-available-credit"
              />
              <KeyValue label="8 · Unsecured exposure" value={inr(a.unsecuredExposure)} hint="Base limit − proposed LIEN" testId="bd-unsecured" />
              <KeyValue
                label="9 · Potential upgrade"
                value={upgrade ? `Level ${facility.level} → ${upgrade.level}` : "Not available"}
                hint={upgrade ? `Limit would change from ${inr(facility.approvedLimit)} to ${inr(upgrade.baseLimit)} only if the lender approves` : facility ? "Your recommendation doesn't exceed your active level" : "Needs an active facility"}
                testId="bd-upgrade"
              />
            </div>
            <Formula summary="The formulas behind these numbers">
              Base limit = SDA balance × level limit %. Proposed LIEN = base limit × level collateral % (a share of the limit,
              never of the SDA). Unsecured exposure = base limit − proposed LIEN. Available savings = SDA balance − existing holds −
              confirmed LIEN. Available credit = approved limit − outstanding balance. Every figure comes from the same calculation
              module the Assessment page uses.
            </Formula>
          </section>
        </div>

        <aside className="asc-decision-aside">
          <section className={`asc-decision-card ${a.eligibleToProceed ? "" : "pause"}`} aria-label="Lender eligibility">
            <div className="asc-eyebrow light">LENDER PATHWAY</div>
            <h2 data-testid="lender-headline">
              {a.eligibleToProceed
                ? "Your profile is ready for lender review."
                : a.status === "PAUSE"
                  ? "Not ready for lender review yet."
                  : "A few steps remain."}
            </h2>
            <p>
              Ascend's assessment is an internal recommendation. Underwriting, approval, pricing and activation are decided by a
              regulated lender.
            </p>
            <div className="asc-gates">
              {stages.map((stage, index) => (
                <div key={stage.label}>
                  <span className={stage.state === "done" ? "pass" : stage.state === "blocked" ? "fail" : "wait"}>
                    <Icon name={stage.state === "done" ? "check" : stage.state === "blocked" ? "close" : "clock"} size={14} />
                  </span>
                  <div>
                    <strong>
                      0{index + 1} · {stage.label}
                    </strong>
                    <small>{stage.detail}</small>
                  </div>
                </div>
              ))}
            </div>
            {a.fastTrack.eligible && (
              <p className="asc-fast-track">
                <Badge tone="green">FAST-TRACK REVIEW</Badge>
                Verified salary, full data and stress-tested affordability qualify you for expedited review. This is not automatic approval.
              </p>
            )}
            {a.manualReviewRequired && (
              <p className="asc-next-step">A lender will review this manually because of unsecured exposure, limited data or tight affordability.</p>
            )}
            {changedSinceSubmit && (
              <p className="asc-next-step">Your recommendation changed after you shared it. Share again so the lender sees current data.</p>
            )}
            <button
              className="asc-button light"
              disabled={!a.eligibleToProceed || lenderBusy || (submitted && !changedSinceSubmit)}
              onClick={shareForReview}
            >
              {submitted && !changedSinceSubmit
                ? "Shared for lender review"
                : upgrade
                  ? `Request upgrade review to Level ${upgrade.level}`
                  : "Share profile for lender review"}
              <Icon size={17} />
            </button>
            {submitted && (
              <small className="asc-advisory-note">
                Received by {LENDER.name} · {application.reference}. The lender will complete underwriting before any approval.
              </small>
            )}
          </section>
          <section className="asc-card asc-schedule-card">
            <div className="asc-card-title">
              <h3>Ways to strengthen your profile</h3>
              <Icon name="spark" size={19} />
            </div>
            <ul className="asc-tips">
              {recommendations.map((tip) => (
                <li key={tip.id}>
                  <strong>{tip.title}</strong>
                  <small>{tip.body}</small>
                </li>
              ))}
            </ul>
            <p className="asc-caption">General guidance based on your data. No score change, approval or timeframe is promised.</p>
          </section>
          <details className="asc-disclosure">
            <summary>
              Your rights & support <Icon name="info" size={16} />
            </summary>
            <p>
              You can withdraw AA and bureau consent at any time from these pages. Repayments are never debited without a mandate
              you authorise. Credit costs, repayment terms and late-payment consequences are disclosed by the lender before you
              accept anything.
            </p>
            <p>
              Questions or complaints go to {LENDER.email}. Unresolved complaints can be escalated to the lender's grievance
              redressal officer.
            </p>
          </details>
        </aside>
      </div>
    </>
  );
}
