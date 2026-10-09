import React, { useMemo, useState } from "react";
import {
  Badge,
  EmptyConsentNote,
  Icon,
  NumberField,
} from "../components/ui.jsx";
import { CashflowChart } from "../components/CashflowChart.jsx";
import { StipendComparison } from "../components/StipendComparison.jsx";
import {
  DEFAULT_SCENARIO,
  MODEL_VERSION,
  POLICY,
  exploreSchedule,
  money,
  simulate,
  validateScenario,
} from "../domain/cashflow.js";
import {
  PROFILES,
  hasConsent,
  updateScenarioInputs,
} from "../data/demoStore.js";
function dayLabel(day) {
  return day === 0 ? "before day 1" : `on day ${day}`;
}
function downloadJson(data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "ascend-synthetic-decision.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DecisionLabPage({ session, update, navigate, notify }) {
  const scenario = session.scenario;
  const [months, setMonths] = useState(1);
  const [compare, setCompare] = useState(false);
  const [proposedDay, setProposedDay] = useState(24);
  const draft = session.inputDraft ?? scenario;
  const errors = validateScenario(draft);
  const readOnly = session.role === "lender";
  const [nextOpen, setNextOpen] = useState(false);
  const result = useMemo(
    () => simulate(scenario, { months }),
    [scenario, months],
  );
  const fullTerm = useMemo(() => simulate(scenario, { months: 3 }), [scenario]);
  const explored = useMemo(
    () => simulate({ ...scenario, emiDay: proposedDay }, { months: 3 }),
    [scenario, proposedDay],
  );
  const schedule = useMemo(() => exploreSchedule(scenario), [scenario]);
  const baseline = compare
    ? simulate({ ...scenario, stipendDay: 5 }, { months })
    : null;
  const invalid = Object.values(errors).some(Boolean);
  const active = hasConsent(session);
  const profile =
    PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  function commit(next) {
    if (readOnly) return;
    update(updateScenarioInputs(session, next), true);
  }
  function edit(key, value) {
    if (readOnly) return;
    update(updateScenarioInputs(session, { [key]: value }), true);
  }
  function exportDecision() {
    try {
      downloadJson({
        synthetic: true,
        modelVersion: MODEL_VERSION,
        generatedAt: new Date().toISOString(),
        purpose: session.purpose,
        profile: profile.id,
        mode: session.mode,
        consent: session.consent,
        scenario,
        policy: POLICY,
        horizonDays: result.horizon,
        result: { ...result, scenario: undefined, points: undefined },
        fullTermStatus: fullTerm.status,
        note: "Illustrative advisory only. Not a loan approval, KYC record or lender offer.",
      });
      notify("Synthetic decision receipt downloaded.");
    } catch {
      notify(
        "Download was unavailable in this browser. The complete event ledger is shown below.",
      );
    }
  }
  if (readOnly && (session.lender?.status !== "verified" || !active || invalid))
    return (
      <section className="asc-card asc-assessment">
        <div className="asc-eyebrow">LENDER REVIEW · SYNTHETIC ONLY</div>
        <h1>Complete the review prerequisites.</h1>
        <p>
          Simulated lender verification, active applicant consent and valid
          applicant inputs are required for the read-only assessment.
        </p>
        <button
          className="asc-button primary"
          onClick={() => navigate("/apply")}
        >
          Return to Apply & Consent <Icon />
        </button>
      </section>
    );
  return (
    <>
      <header className="asc-page-heading lab">
        <div>
          <div className="asc-eyebrow">
            <span>02</span> CASH-FLOW DECISION LAB
          </div>
          <h1>
            Timing changes <em>everything.</em>
          </h1>
          <p>
            A monthly total can hide a difficult day. Move a date, test a shock,
            and see the whole picture.
          </p>
        </div>
        <div className="asc-lab-profile">
          <div className="asc-avatar">{profile.initials}</div>
          <div>
            <strong>{profile.name}</strong>
            <span>
              {profile.city} ·{" "}
              {session.role === "lender" ? "Reviewer view" : "Demo applicant"}
            </span>
          </div>
          <Badge tone="green">SYNTHETIC</Badge>
        </div>
      </header>
      {readOnly && (
        <div className="asc-inline-note">
          <Icon name="lock" />
          <span>
            Read-only reviewer view. Applicant values cannot be changed here.
            Comparison horizons and uncommitted date previews remain explorable.
          </span>
        </div>
      )}
      {!active ? (
        <EmptyConsentNote
          manual={session.mode === "manual"}
          onApply={() => navigate("/apply")}
        />
      ) : (
        <div className="asc-consent-strip">
          <Icon name="shield" size={16} />
          <span>Consent active · synthetic cash-flow evidence</span>
          <button
            className="asc-text-button"
            onClick={() => navigate("/apply")}
          >
            Manage consent <Icon size={14} />
          </button>
        </div>
      )}
      <section className="asc-scenario-bar" aria-label="Stress test scenarios">
        <div className="asc-scenario-label">
          <Icon name="spark" size={18} />
          <span>STRESS TEST</span>
        </div>
        <div className="asc-scenario-buttons">
          <button
            disabled={readOnly || invalid}
            className={scenario.stipendDay === 5 ? "selected" : ""}
            aria-pressed={scenario.stipendDay === 5}
            onClick={() => commit({ ...scenario, stipendDay: 5 })}
          >
            <span className="asc-scenario-dot green" />
            Stipend on 5th
          </button>
          <button
            className={scenario.stipendDay === 20 ? "selected warm" : ""}
            disabled={readOnly || invalid}
            aria-pressed={scenario.stipendDay === 20}
            onClick={() => commit({ ...scenario, stipendDay: 20 })}
          >
            <Icon name="clock" size={15} />
            Delay to 20th
          </button>
          <button
            disabled={readOnly || invalid}
            className={scenario.shock === 600 ? "selected warm" : ""}
            aria-pressed={scenario.shock === 600}
            onClick={() =>
              commit({
                ...scenario,
                shock: scenario.shock === 600 ? 0 : 600,
                shockDay: 3,
              })
            }
          >
            + ₹600 expense shock
          </button>
        </div>
        <button
          className="asc-reset"
          disabled={readOnly}
          onClick={() => {
            commit({ ...DEFAULT_SCENARIO });
            setProposedDay(24);
            setMonths(1);
            setCompare(false);
            setNextOpen(false);
            notify("Default reference scenario restored.");
          }}
        >
          <Icon name="reset" size={16} />
          Reset scenario
        </button>
      </section>
      <p className="asc-shock-summary" role="status">
        {scenario.shock > 0
          ? `Expense shock active: ${money(scenario.shock)} on day ${scenario.shockDay}, once only—even in the 90-day view.`
          : "Expense shock off. No extra expense is included."}
      </p>
      <section className="asc-metrics" aria-label="Cash-flow metrics">
        <div className="asc-metric">
          <span>
            <Icon name="wallet" size={17} />
            Opening balance
          </span>
          <strong data-testid="opening-balance">
            {money(scenario.openingBalance)}
          </strong>
          <small>Available before day 1</small>
        </div>
        <div className={`asc-metric ${result.structuralPass ? "" : "risk"}`}>
          <span>
            <Icon name="chart" size={17} />
            Recurring monthly margin
          </span>
          <strong data-testid="monthly-margin">
            {money(result.recurringMargin)}
          </strong>
          <small>
            First cycle, including shock: {money(result.monthOneMargin)}
          </small>
        </div>
        <div className={`asc-metric ${result.timingPass ? "" : "risk"}`}>
          <span>
            <Icon name="calendar" size={17} />
            Lowest projected balance
          </span>
          <strong data-testid="lowest-balance">
            {money(result.lowestBalance)}
          </strong>
          <small>
            {result.lowestDay === 0
              ? "Before day 1"
              : `Day ${result.lowestDay}`}{" "}
            · {result.horizon}-day horizon
          </small>
        </div>
        <div className="asc-metric buffer">
          <span>
            <Icon name="shield" size={17} />
            Protected buffer
          </span>
          <strong>{money(POLICY.buffer)}</strong>
          <small>Always kept out of spendable cash</small>
        </div>
      </section>
      {invalid && (
        <p className="asc-error input-warning" role="alert">
          Correct the highlighted input to refresh the simulation. The results
          below show your last valid scenario.
        </p>
      )}
      <div className="asc-lab-grid">
        <div className="asc-lab-main">
          <StipendComparison
            scenario={scenario}
            months={months}
            invalid={invalid}
          />
          <section className="asc-card asc-chart-card">
            <div className="asc-chart-top">
              <div>
                <div className="asc-eyebrow">DATED BALANCE SIMULATION</div>
                <h2>Your cash, day by day.</h2>
              </div>
              <div className="asc-tabs small" aria-label="Simulation horizon">
                <button
                  className={months === 1 ? "is-active" : ""}
                  aria-pressed={months === 1}
                  onClick={() => setMonths(1)}
                >
                  30 days
                </button>
                <button
                  className={months === 3 ? "is-active" : ""}
                  aria-pressed={months === 3}
                  onClick={() => setMonths(3)}
                >
                  Full term
                </button>
              </div>
            </div>
            <CashflowChart result={result} comparison={baseline} />
            <div className="asc-chart-options">
              <label>
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                Compare with stipend on day 5
              </label>
              <span>Outflows before same-day inflows</span>
            </div>
            <div className="asc-date-controls">
              <div>
                <div className="asc-slider-heading">
                  <label htmlFor="lab-stipendDay">Stipend arrival</label>
                  <span>
                    Day <b>{scenario.stipendDay}</b>
                  </span>
                </div>
                <input
                  type="range"
                  id="lab-stipendDay"
                  disabled={readOnly || invalid}
                  min="1"
                  max="30"
                  value={scenario.stipendDay}
                  onChange={(event) =>
                    commit({
                      ...scenario,
                      stipendDay: Number(event.target.value),
                    })
                  }
                />
                <div className="asc-range-labels">
                  <span>Day 1</span>
                  <span>Day 30</span>
                </div>
              </div>
              <div>
                <div className="asc-slider-heading">
                  <label htmlFor="lab-emiDay">EMI due date</label>
                  <span>
                    Day <b>{scenario.emiDay}</b>
                  </span>
                </div>
                <input
                  type="range"
                  id="lab-emiDay"
                  disabled={readOnly || invalid}
                  min="1"
                  max="30"
                  value={scenario.emiDay}
                  onChange={(event) =>
                    commit({ ...scenario, emiDay: Number(event.target.value) })
                  }
                />
                <div className="asc-range-labels">
                  <span>Day 1</span>
                  <span>Day 30</span>
                </div>
              </div>
            </div>
            <details className="asc-adjust">
              <summary>
                Adjust amounts & assumptions <Icon name="chevron" size={15} />
              </summary>
              <fieldset
                className="asc-fields two asc-input-fieldset"
                disabled={readOnly}
              >
                <legend className="asc-sr-only">Financial assumptions</legend>
                <NumberField
                  id="lab-principal"
                  label="Purchase amount"
                  prefix="₹"
                  min={1000}
                  max={10000}
                  step={0.01}
                  value={draft.principal}
                  error={errors.principal}
                  onChange={(value) => edit("principal", value)}
                />
                <NumberField
                  id="lab-income"
                  label="Monthly stipend"
                  prefix="₹"
                  step={0.01}
                  value={draft.income}
                  error={errors.income}
                  onChange={(value) => edit("income", value)}
                />
                <NumberField
                  id="lab-openingBalance"
                  label="Opening balance"
                  prefix="₹"
                  max={1000000}
                  step={0.01}
                  value={draft.openingBalance}
                  error={errors.openingBalance}
                  onChange={(value) => edit("openingBalance", value)}
                />
                <NumberField
                  id="lab-existingDebt"
                  label="Existing repayment · day 8"
                  prefix="₹"
                  step={0.01}
                  value={draft.existingDebt}
                  error={errors.existingDebt}
                  onChange={(value) => edit("existingDebt", value)}
                />
                <NumberField
                  id="lab-shock"
                  label="One-off shock amount"
                  prefix="₹"
                  step={0.01}
                  value={draft.shock}
                  error={errors.shock}
                  onChange={(value) => edit("shock", value)}
                />
                <NumberField
                  id="lab-shockDay"
                  label="One-off shock day"
                  min={1}
                  max={30}
                  value={draft.shockDay}
                  error={errors.shockDay}
                  onChange={(value) => edit("shockDay", value)}
                />
                <NumberField
                  id="lab-arrivalInput"
                  label="Stipend arrival day"
                  min={1}
                  max={30}
                  value={draft.stipendDay}
                  error={errors.stipendDay}
                  onChange={(value) => edit("stipendDay", value)}
                />
                <NumberField
                  id="lab-dueInput"
                  label="EMI due day"
                  min={1}
                  max={30}
                  value={draft.emiDay}
                  error={errors.emiDay}
                  onChange={(value) => edit("emiDay", value)}
                />
              </fieldset>
            </details>
          </section>
          <section className="asc-card asc-ledger">
            <details open>
              <summary>
                <div>
                  <div className="asc-eyebrow">NOTHING HIDDEN IN THE TOTAL</div>
                  <h2>Exact event ledger</h2>
                </div>
                <Badge>{result.ledger.length} EVENTS</Badge>
              </summary>
              <div className="asc-table-wrap">
                <table>
                  <caption className="asc-sr-only">
                    All dated events and post-event balances over{" "}
                    {result.horizon} days
                  </caption>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Cash movement</th>
                      <th>Amount</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="asc-day-chip">00</span>
                      </td>
                      <td>
                        <span className="asc-event-name">
                          <Icon name="wallet" size={15} />
                          Opening cash balance
                        </span>
                      </td>
                      <td>—</td>
                      <td>{money(scenario.openingBalance)}</td>
                    </tr>
                    {result.ledger.map((row) => (
                      <tr
                        key={row.id}
                        className={row.belowBuffer ? "below-buffer" : ""}
                      >
                        <td>
                          <span className="asc-day-chip">
                            {String(row.day).padStart(2, "0")}
                          </span>
                        </td>
                        <td>
                          <span className="asc-event-name">
                            <Icon
                              name={
                                row.kind === "income"
                                  ? "arrow"
                                  : row.kind === "emi"
                                    ? "calendar"
                                    : row.kind === "shock"
                                      ? "alert"
                                      : "wallet"
                              }
                              size={15}
                            />
                            {row.label}
                          </span>
                          {row.belowBuffer && (
                            <small>Below protected buffer</small>
                          )}
                        </td>
                        <td className={row.change > 0 ? "positive" : ""}>
                          {row.change > 0 ? "+" : "−"}
                          {money(Math.abs(row.change))}
                        </td>
                        <td>{money(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3">
                        Closing balance · Day {result.horizon}
                      </td>
                      <td>{money(result.closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </section>
        </div>
        <aside className="asc-decision-aside">
          <section
            className={`asc-decision-card ${fullTerm.status === "PAUSE" ? "pause" : ""}`}
            aria-label="Advisory result"
          >
            <div className="asc-eyebrow light">PROTOTYPE ADVISORY</div>
            <div className="asc-result-symbol">
              <Icon
                name={fullTerm.status === "REVIEWABLE" ? "check" : "clock"}
                size={27}
              />
            </div>
            <Badge tone={fullTerm.status === "REVIEWABLE" ? "green" : "amber"}>
              {fullTerm.status}
            </Badge>
            <h2 data-testid="decision-title">{fullTerm.title}</h2>
            <p>
              {!fullTerm.structuralPass
                ? `Recurring repayments and essentials exceed the stipend by ${money(-fullTerm.recurringMargin)} per cycle. Moving a due date cannot resolve this monthly gap.`
                : !fullTerm.timingPass
                  ? `The projected balance falls below ${money(POLICY.buffer)} ${dayLabel(fullTerm.firstBreach.day)}. The lowest point is ${money(fullTerm.lowestBalance)} ${dayLabel(fullTerm.lowestDay)}.`
                  : `All dated events preserve the ${money(POLICY.buffer)} buffer. The lowest balance is ${money(fullTerm.lowestBalance)} ${dayLabel(fullTerm.lowestDay)}.`}
            </p>
            <div className="asc-reason-code">
              Reason <code data-testid="reason-code">{fullTerm.reason}</code>
            </div>
            <div className="asc-gates">
              <div>
                <span className={fullTerm.structuralPass ? "pass" : "fail"}>
                  <Icon
                    name={fullTerm.structuralPass ? "check" : "close"}
                    size={14}
                  />
                </span>
                <div>
                  <strong>01 · Monthly affordability</strong>
                  <small>
                    {money(fullTerm.recurringMargin)} after essentials &
                    repayments
                  </small>
                </div>
              </div>
              <div>
                <span className={fullTerm.timingPass ? "pass" : "fail"}>
                  <Icon
                    name={fullTerm.timingPass ? "check" : "close"}
                    size={14}
                  />
                </span>
                <div>
                  <strong>02 · Timing & buffer</strong>
                  <small>
                    {fullTerm.timingPass
                      ? "Buffer preserved across all 3 cycles"
                      : "At least one event breaches the buffer"}
                  </small>
                </div>
              </div>
            </div>
            <button
              className="asc-button light"
              onClick={() => setNextOpen(!nextOpen)}
              aria-expanded={nextOpen}
            >
              See responsible next step <Icon size={17} />
            </button>
            {nextOpen && (
              <div className="asc-next-step" role="status">
                {fullTerm.status === "REVIEWABLE"
                  ? "This scenario is ready for human review. A regulated lender would still need to verify identity, eligibility, actual cash-flow evidence, existing debts and final pricing before making any decision."
                  : !fullTerm.structuralPass
                    ? "Reduce or defer the purchase, or establish reliable additional income before reassessment. Changing dates or borrowing again does not repair a recurring deficit."
                    : schedule.suggested
                      ? `Day ${schedule.suggested.day} preserves the buffer in this illustrative schedule. Preview it below; only a lender can offer or approve a changed repayment date.`
                      : `No EMI date protects the buffer with these inputs. Even the best date needs ${money(schedule.best.requiredTopUp)} more opening cash. Defer the purchase or reassess after reliable funds arrive.`}
              </div>
            )}
            <small className="asc-advisory-note">
              Evaluated over 3 illustrative 30-day cycles. Reviewable does not
              mean approved.
            </small>
          </section>
          <section className="asc-card asc-schedule-card">
            <div className="asc-card-title">
              <h3>Explore a different date</h3>
              <Icon name="calendar" size={19} />
            </div>
            <p className="asc-muted">Try an EMI date before applying it.</p>
            <div className="asc-schedule-day">
              <label htmlFor="schedule-day">Illustrative EMI day</label>
              <strong>{String(proposedDay).padStart(2, "0")}</strong>
            </div>
            <input
              type="range"
              id="schedule-day"
              min="1"
              max="30"
              value={proposedDay}
              onChange={(event) => setProposedDay(Number(event.target.value))}
            />
            <div className="asc-range-labels">
              <span>Day 1</span>
              <span>Day 30</span>
            </div>
            <div className="asc-schedule-preview">
              <Badge
                tone={explored.status === "REVIEWABLE" ? "green" : "amber"}
              >
                {explored.status}
              </Badge>
              <p>
                Lowest balance <strong>{money(explored.lowestBalance)}</strong>{" "}
                {dayLabel(explored.lowestDay)}.
              </p>
              {explored.status === "PAUSE" && (
                <small>
                  {explored.structuralPass
                    ? `Buffer shortfall: ${money(explored.requiredTopUp)}. A later EMI may not solve essential spending gaps.`
                    : "The monthly affordability gap remains."}
                </small>
              )}
            </div>
            {schedule.suggested && (
              <button
                className="asc-text-button suggestion"
                onClick={() => setProposedDay(schedule.suggested.day)}
              >
                Preview a buffer-preserving date: day {schedule.suggested.day}{" "}
                <Icon size={13} />
              </button>
            )}
            <button
              className="asc-button secondary wide"
              disabled={readOnly || invalid || proposedDay === scenario.emiDay}
              onClick={() => {
                commit({ ...scenario, emiDay: proposedDay });
                notify(
                  `Day ${proposedDay} applied to the simulation. This is not an approved schedule change.`,
                );
              }}
            >
              Use this date in simulation <Icon size={16} />
            </button>
            <p className="asc-caption">
              The illustrative charge stays fixed at 4% for this demo. Real
              lenders would re-price and disclose changed terms.
            </p>
          </section>
          {active && session.consent.scopes.bureau && (
            <div className="asc-card asc-bureau-card">
              <Icon name="shield" size={19} />
              <div>
                <strong>Simulated bureau snapshot</strong>
                <p>
                  Thin file · no adverse record in the fixture. Existing
                  repayments are declared separately. No actual bureau has been
                  contacted.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
      <div className="asc-lab-bottom">
        <details className="asc-disclosure">
          <summary>
            Model assumptions & illustrative pricing{" "}
            <Icon name="info" size={16} />
          </summary>
          <p>
            {money(scenario.principal)} principal + {money(result.terms.fee)}{" "}
            total flat charge = {money(result.terms.total)} repaid over three
            installments: {result.terms.installments.map(money).join(", ")}.
            This 4% total-term charge is not an APR. EMI values are rounded to
            paise and the last installment reconciles the total.
          </p>
          <p>
            Essentials repeat each 30-day cycle, existing debt is due on day 8,
            and the shock occurs once. Expenses settle before same-day income;
            intermediate event balances count. Negative balances represent a
            modeled funding gap, not an available overdraft. The protected
            buffer is a floor and is not subtracted again as an expense.
          </p>
          <p>
            Stipend amounts and future dates are assumptions. No loan proceeds
            enter available cash because direct purchase financing is assumed.
            The recurring margin uses the largest installment, excluding one-off
            shocks and opening cash. Illustrative essentials are not a complete
            budget.
          </p>
        </details>
        <button
          className="asc-button secondary"
          disabled={invalid}
          onClick={exportDecision}
        >
          <Icon name="download" size={17} />
          Export demo receipt
        </button>
      </div>
    </>
  );
}
