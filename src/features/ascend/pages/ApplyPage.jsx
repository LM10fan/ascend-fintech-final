import React, { useState } from "react";
import { LenderOnboarding } from "../components/LenderOnboarding.jsx";
import {
  Badge,
  Field,
  Icon,
  NumberField,
  SectionHeading,
} from "../components/ui.jsx";
import {
  DEFAULT_SCENARIO,
  ESSENTIALS,
  POLICY,
  loanTerms,
  money,
  normalizeScenario,
  validateScenario,
} from "../domain/cashflow.js";
import {
  PROFILES,
  PURPOSES,
  hasConsent,
  recordConsent,
  withdrawConsent,
  updateScenarioInputs,
  setConsentChoice,
} from "../data/demoStore.js";

export function ApplyPage({ session, update, navigate, notify }) {
  const draft = session.inputDraft ?? session.scenario;
  const scopes = session.consentChoices;
  const errors = validateScenario(draft);
  const [consentError, setConsentError] = useState("");
  const profile =
    PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  const active = hasConsent(session);
  const terms = Object.keys(
    validateScenario({ ...DEFAULT_SCENARIO, principal: draft.principal }),
  ).length
    ? null
    : loanTerms(Number(draft.principal));
  const setValue = (key, value) => {
    update(updateScenarioInputs(session, { [key]: value }), true);
  };
  function validate() {
    const next = validateScenario(draft);
    if (Object.keys(next).length) {
      document.getElementById(`apply-${Object.keys(next)[0]}`)?.focus();
      return false;
    }
    return true;
  }
  function setScope(key, checked) {
    setConsentError("");
    update(setConsentChoice(session, key, checked), true);
    if (active) {
      notify(
        "Consent withdrawn. Record your updated choices to use your profile.",
      );
    }
  }
  function record() {
    if (!validate()) return;
    if (!(scopes.evidence && scopes.cashflow)) {
      setConsentError(
        "Select the two required permissions, or continue with the manual calculator.",
      );
      return;
    }
    update(
      recordConsent(
        {
          ...session,
          scenario: normalizeScenario(draft),
          history:
            Number(draft.existingDebt) > 0 ? "existing" : session.history,
        },
        scopes,
      ),
      true,
    );
    notify("Your consent choices are recorded on this browser.");
  }
  function enter(manual = false) {
    if (!validate()) return;
    const next = {
      ...session,
      scenario: normalizeScenario(draft),
      history: Number(draft.existingDebt) > 0 ? "existing" : session.history,
    };
    update(manual ? withdrawConsent(next) : next, true);
    navigate("/decision-lab");
  }
  function changeProfile(id) {
    update(
      { ...withdrawConsent(session), profileId: id, mode: "reference" },
      true,
    );
    if (active)
      notify("Profile changed. Please record fresh consent choices.");
  }
  return (
    <>
      <header className="asc-page-heading">
        <div>
          <div className="asc-eyebrow">
            <span>01</span> APPLY & CONSENT
          </div>
          <h1>
            A clearer picture.
            <br />
            <em>A better next step.</em>
          </h1>
          <p>
            A productive purchase starts with understanding when your money
            arrives—and what needs to stay protected.
          </p>
        </div>
        <div className="asc-heading-note">
          <Icon name="shield" size={24} />
          <div>
            <strong>Your choices come first.</strong>
            <span>Only what you consent to. Always in your control.</span>
          </div>
        </div>
      </header>
      <div className="asc-role-bar">
        <div className="asc-tabs" aria-label="Registration role">
          <button
            className={session.role === "applicant" ? "is-active" : ""}
            aria-pressed={session.role === "applicant"}
            onClick={() => update({ ...session, role: "applicant" }, true)}
          >
            <Icon name="user" size={17} />
            For applicants
          </button>
          <button
            className={session.role === "lender" ? "is-active" : ""}
            aria-pressed={session.role === "lender"}
            onClick={() => update({ ...session, role: "lender" }, true)}
          >
            <Icon name="building" size={17} />
            For lenders
          </button>
        </div>
        <span>
          <span className="asc-live-dot" />
          Live application
        </span>
      </div>
      {session.role === "lender" ? (
        <LenderOnboarding
          session={session}
          update={update}
          navigate={navigate}
          notify={notify}
        />
      ) : (
        <div className="asc-apply-grid">
          <div className="asc-card asc-form-card">
            <section className="asc-form-section">
              <SectionHeading
                number="01"
                title="Start with your profile"
                description="Confirm the applicant profile linked to this application."
              />
              <div className="asc-fields two">
                <Field label="Applicant" id="apply-profile">
                  <select
                    id="apply-profile"
                    value={session.profileId}
                    onChange={(event) => changeProfile(event.target.value)}
                  >
                    {PROFILES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Credit journey" id="apply-history">
                  <select
                    id="apply-history"
                    value={session.history}
                    onChange={(event) => {
                      const history = event.target.value;
                      update(
                        {
                          ...updateScenarioInputs(
                            session,
                            history === "first" ? { existingDebt: 0 } : {},
                          ),
                          history,
                        },
                        true,
                      );
                    }}
                  >
                    <option value="first">First credit application</option>
                    <option value="existing">I have a loan history</option>
                  </select>
                </Field>
              </div>
              <div className="asc-identity">
                <div className="asc-avatar">{profile.initials}</div>
                <div>
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.age} years · {profile.campus}
                  </span>
                </div>
                <Badge tone="green">PROFILE LINKED</Badge>
              </div>
              <div className="asc-fixture-list compact asc-identity-ids">
                <div>
                  <span>
                    {session.history === "first"
                      ? "Parent PAN"
                      : "Applicant PAN"}
                  </span>
                  <code>
                    {session.history === "first"
                      ? profile.parentPan
                      : profile.ownPan}
                  </code>
                </div>
                <div>
                  <span>Aadhaar</span>
                  <code>{profile.aadhaar}</code>
                </div>
              </div>
            </section>
            <section className="asc-form-section">
              <SectionHeading
                number="02"
                title="Tell us when cash moves"
                description="Map a purchase to your monthly rhythm."
              />
              <div className="asc-fields two">
                <Field label="Necessary purchase" id="apply-purpose">
                  <select
                    id="apply-purpose"
                    value={session.purpose}
                    onChange={(event) =>
                      update({ ...session, purpose: event.target.value }, true)
                    }
                  >
                    {PURPOSES.map((purpose) => (
                      <option key={purpose}>{purpose}</option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  id="apply-principal"
                  label="Purchase amount"
                  prefix="₹"
                  value={draft.principal}
                  onChange={(value) => setValue("principal", value)}
                  min={1000}
                  max={10000}
                  step={0.01}
                  error={errors.principal}
                  hint="Range: ₹1,000–₹10,000"
                />
                <NumberField
                  id="apply-income"
                  label="Recurring monthly stipend"
                  prefix="₹"
                  value={draft.income}
                  onChange={(value) => setValue("income", value)}
                  step={0.01}
                  error={errors.income}
                />
                <NumberField
                  id="apply-stipendDay"
                  label="Expected arrival day"
                  suffix="of 30"
                  min={1}
                  max={30}
                  value={draft.stipendDay}
                  onChange={(value) => setValue("stipendDay", value)}
                  error={errors.stipendDay}
                />
                <NumberField
                  id="apply-openingBalance"
                  label="Opening available balance"
                  prefix="₹"
                  max={1000000}
                  value={draft.openingBalance}
                  onChange={(value) => setValue("openingBalance", value)}
                  step={0.01}
                  error={errors.openingBalance}
                  hint="Balance before day 1"
                />
                <NumberField
                  id="apply-existingDebt"
                  label="Existing monthly repayment"
                  prefix="₹"
                  value={draft.existingDebt}
                  onChange={(value) => setValue("existingDebt", value)}
                  step={0.01}
                  error={errors.existingDebt}
                  hint="Scheduled on day 8"
                />
              </div>
              <div className="asc-inline-note">
                <Icon name="info" size={17} />
                <span>
                  Future stipend dates are declared assumptions, never
                  guaranteed income.
                </span>
              </div>
              {Object.keys(errors).length > 0 && (
                <div className="asc-inline-note" role="alert">
                  <Icon name="alert" />
                  <span>
                    Some inputs need correction. Calculations retain the last
                    valid scenario.{" "}
                    <button
                      className="asc-text-button"
                      onClick={() => navigate("/decision-lab")}
                    >
                      Review all assumptions in Decision Lab
                    </button>
                  </span>
                </div>
              )}
            </section>
            <section className="asc-form-section last">
              <SectionHeading
                number="03"
                title="Your data, your decision"
                description="Choose what Ascend can use. You can withdraw consent at any time."
              />
              <label className="asc-consent-row">
                <input
                  type="checkbox"
                  checked={scopes.evidence}
                  onChange={(event) =>
                    setScope("evidence", event.target.checked)
                  }
                />
                <span>
                  <strong>
                    Use my historical spending data <b>Required</b>
                  </strong>
                  <small>
                    Your essential expenses below are used as historical evidence.
                  </small>
                </span>
              </label>
              <label className="asc-consent-row">
                <input
                  type="checkbox"
                  checked={scopes.cashflow}
                  onChange={(event) =>
                    setScope("cashflow", event.target.checked)
                  }
                />
                <span>
                  <strong>
                    Assess purchase affordability using these inputs{" "}
                    <b>Required</b>
                  </strong>
                  <small>
                    Use my cash flow and declared dates for this assessment.
                  </small>
                </span>
              </label>
              <label className="asc-consent-row">
                <input
                  type="checkbox"
                  checked={scopes.bureau}
                  onChange={(event) => setScope("bureau", event.target.checked)}
                />
                <span>
                  <strong>
                    Include a credit bureau snapshot <b>Optional</b>
                  </strong>
                  <small>
                    Retrieved with your consent. A bureau snapshot alone does not
                    establish willingness to repay.
                  </small>
                </span>
              </label>
              {consentError && (
                <p className="asc-error" role="alert">
                  {consentError}
                </p>
              )}
              {active && (
                <div className="asc-consent-receipt">
                  <Icon name="check" size={17} />
                  <span>
                    Consent recorded ·{" "}
                    {new Date(session.consent.recordedAt).toLocaleTimeString(
                      "en-IN",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                  <button
                    className="asc-text-button"
                    onClick={() => {
                      update(withdrawConsent(session), true);
                      notify(
                        "Consent withdrawn. You can still use the manual calculator.",
                      );
                    }}
                  >
                    Withdraw
                  </button>
                </div>
              )}
              <div className="asc-actions">
                <button className="asc-button secondary" onClick={record}>
                  {active
                    ? "Update consent record"
                    : "Record selected consents"}
                  <Icon name="check" size={17} />
                </button>
                <button
                  className="asc-button primary"
                  disabled={!active}
                  onClick={() => enter()}
                >
                  Enter Decision Lab
                  <Icon size={17} />
                </button>
              </div>
              <button className="asc-manual-link" onClick={() => enter(true)}>
                Continue without consent with the manual calculator{" "}
                <Icon size={15} />
              </button>
            </section>
          </div>
          <aside className="asc-apply-aside">
            <div className="asc-dark-card">
              <div className="asc-eyebrow light">
                YOUR PURCHASE, IN PERSPECTIVE
              </div>
              <div className="asc-purchase-icon">
                <Icon name="laptop" size={32} />
              </div>
              <h2>
                A little support.
                <br />
                <em>Room to move forward.</em>
              </h2>
              <div className="asc-quote-line">
                <span>{session.purpose}</span>
                <strong>{terms ? money(terms.principal) : "—"}</strong>
              </div>
              <div className="asc-quote-line">
                <span>Total charge · 4%</span>
                <strong>{terms ? money(terms.fee) : "—"}</strong>
              </div>
              <div className="asc-quote-total">
                <div>
                  <span>Monthly installment</span>
                  <strong>{terms ? money(terms.emi) : "—"}</strong>
                </div>
                <span>× 3 months</span>
              </div>
              <p className="asc-dark-caption">
                {terms ? `${money(terms.total)} total repayment. ` : ""}A 4%
                flat charge over the full term, not an annual rate. Final
                installment adjusts for rounding. Indicative terms, subject to
                lender validation.
              </p>
            </div>
            <div className="asc-card asc-evidence-card">
              <div className="asc-card-title">
                <h3>What stays protected</h3>
                <Icon name="shield" size={19} />
              </div>
              <p className="asc-muted">Your essentials snapshot.</p>
              <div className="asc-expenses">
                {ESSENTIALS.map((expense) => (
                  <div key={expense.id}>
                    <span>
                      <strong>{expense.label}</strong>
                      <small>Day {expense.day}</small>
                    </span>
                    <b>{money(expense.amount)}</b>
                  </div>
                ))}
              </div>
              <div className="asc-buffer-row">
                <span>
                  <Icon name="lock" size={16} />
                  Minimum cash buffer
                </span>
                <strong>{money(POLICY.buffer)}</strong>
              </div>
              <p className="asc-caption">
                The buffer is a balance floor, never spare cash to spend.
              </p>
            </div>
            <details className="asc-disclosure">
              <summary>
                How Ascend works <Icon name="info" size={16} />
              </summary>
              <p>
                A 30-day cycle models dated cash movements. The purchase is
                assumed to be financed directly; no loan proceeds are added to
                cash. Only installments enter the cash-flow ledger. Essentials
                shown are the main recurring costs, not a complete budget.
              </p>
              <p>
                Ascend is a technology platform, not a bank or NBFC. Credit is
                offered and approved only by regulated partner lenders.
              </p>
            </details>
          </aside>
        </div>
      )}
    </>
  );
}
