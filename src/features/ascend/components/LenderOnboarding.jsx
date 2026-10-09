import React, { useState } from "react";
import { Badge, Field, Icon, SectionHeading } from "./ui.jsx";
import { PROFILES, hasConsent } from "../data/demoStore.js";
import {
  ORGANIZATIONS,
  REVIEWER_ROLES,
  LENDING_FOCUSES,
  defaultLender,
  editLender,
  validateLender,
  verifyLender,
} from "../data/lender.js";
import { money, simulate, validateScenario } from "../domain/cashflow.js";

function AssessmentPreview({ session, verified }) {
  const active = hasConsent(session);
  const invalid =
    Object.keys(validateScenario(session.inputDraft ?? session.scenario))
      .length > 0;
  const profile =
    PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  const result = simulate(session.scenario, { months: 3 });
  return (
    <section
      className="asc-card asc-assessment"
      aria-label="Read-only applicant assessment preview"
    >
      <div className="asc-eyebrow">READ-ONLY · CONSENTED DATA</div>
      <h2>Applicant assessment preview</h2>
      {!verified ? (
        <p className="asc-muted">
          Complete the organization checks to unlock this preview.
        </p>
      ) : !active ? (
        <p className="asc-muted">
          Applicant consent is not active. Return to For applicants and record
          both required permissions to preview their assessment.
        </p>
      ) : invalid ? (
        <p className="asc-error" role="alert">
          Applicant inputs need correction. No current assessment is available
          until the highlighted fields are valid.
        </p>
      ) : (
        <>
          <div className="asc-identity">
            <div className="asc-avatar">{profile.initials}</div>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.city} · Applicant</span>
            </div>
          </div>
          <Badge tone={result.status === "REVIEWABLE" ? "green" : "amber"}>
            {result.status} · 90 DAYS
          </Badge>
          <dl className="asc-review-facts">
            <div>
              <dt>Purchase</dt>
              <dd>
                {session.purpose} · {money(session.scenario.principal)}
              </dd>
            </div>
            <div>
              <dt>Stipend / EMI date</dt>
              <dd>
                Day {session.scenario.stipendDay} / Day{" "}
                {session.scenario.emiDay}
              </dd>
            </div>
            <div>
              <dt>Recurring monthly margin</dt>
              <dd>
                {money(result.recurringMargin)} ·{" "}
                {result.structuralPass ? "Pass" : "Fail"}
              </dd>
            </div>
            <div>
              <dt>Lowest dated balance</dt>
              <dd>
                {money(result.lowestBalance)} · Day {result.lowestDay}
              </dd>
            </div>
            <div>
              <dt>Timing gate</dt>
              <dd>
                {result.timingPass ? "Buffer preserved" : "Buffer breached"}
              </dd>
            </div>
            <div>
              <dt>One-off shock</dt>
              <dd>
                {session.scenario.shock > 0
                  ? `${money(session.scenario.shock)} · Day ${session.scenario.shockDay} · once`
                  : "Off"}
              </dd>
            </div>
            <div>
              <dt>Consent scope</dt>
              <dd>
                Evidence + cash flow
                {session.consent.scopes.bureau
                  ? " + bureau snapshot"
                  : " · bureau not permitted"}
              </dd>
            </div>
          </dl>
          <code>{result.reason}</code>
          <p className="asc-caption">
            This view follows the applicant’s saved inputs. Reviewers cannot
            edit them or approve a loan. A reviewable result is not an approval.
          </p>
        </>
      )}
      <p className="asc-caption">
        <Icon name="lock" size={14} />
        Access is limited to verified partner reviewers.
      </p>
    </section>
  );
}

export function LenderOnboarding({ session, update, navigate, notify }) {
  const lender = session.lender ?? defaultLender();
  const [errors, setErrors] = useState({});
  const organization = ORGANIZATIONS.find(
    (org) => org.id === lender.organizationId,
  );
  const verified = lender.status === "verified";
  function edit(key, value) {
    update(
      {
        ...session,
        lender: editLender(lender, { [key]: value }),
        lenderRegistered: false,
      },
      true,
    );
    setErrors((old) => ({ ...old, [key]: "" }));
  }
  function submit(event) {
    event.preventDefault();
    const issues = validateLender(lender);
    setErrors(issues);
    if (Object.keys(issues).length) {
      document.getElementById(`lender-${Object.keys(issues)[0]}`)?.focus();
      return;
    }
    update(
      { ...session, lender: verifyLender(lender), lenderRegistered: true },
      true,
    );
    notify(
      "Organization checks passed.",
    );
  }
  return (
    <div className="asc-apply-grid asc-lender-grid">
      <section className="asc-card asc-form-card">
        <SectionHeading
          number="01"
          title="A window into the decision."
          description="Complete organization onboarding, then inspect a read-only applicant assessment."
        />
        <div className="asc-lender-illustration">
          <Icon name="building" size={42} />
          <div>
            <Badge tone="green">LENDER PORTAL</Badge>
            <h3>
              Transparent inputs.
              <br />
              Explainable outcomes.
            </h3>
          </div>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="asc-fields two">
            <Field
              id="lender-organizationId"
              label="Organization"
              error={errors.organizationId}
            >
              <select
                id="lender-organizationId"
                value={lender.organizationId}
                onChange={(event) => edit("organizationId", event.target.value)}
                aria-invalid={!!errors.organizationId}
                aria-describedby={
                  errors.organizationId
                    ? "lender-organizationId-error"
                    : undefined
                }
              >
                <option value="">Select organization</option>
                {ORGANIZATIONS.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="lender-reviewerRole"
              label="Reviewer role"
              error={errors.reviewerRole}
            >
              <select
                id="lender-reviewerRole"
                value={lender.reviewerRole}
                onChange={(event) => edit("reviewerRole", event.target.value)}
                aria-invalid={!!errors.reviewerRole}
                aria-describedby={
                  errors.reviewerRole ? "lender-reviewerRole-error" : undefined
                }
              >
                <option value="">Select role</option>
                {REVIEWER_ROLES.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field id="lender-focus" label="Lending focus" error={errors.focus}>
              <select
                id="lender-focus"
                value={lender.focus}
                onChange={(event) => edit("focus", event.target.value)}
                aria-invalid={!!errors.focus}
                aria-describedby={
                  errors.focus ? "lender-focus-error" : undefined
                }
              >
                <option value="">Select focus</option>
                {LENDING_FOCUSES.map((focus) => (
                  <option key={focus}>{focus}</option>
                ))}
              </select>
            </Field>
          </div>
          {organization && (
            <div className="asc-fixture-list">
              <div>
                <span>Organization type</span>
                <strong>{organization.type}</strong>
              </div>
              <div>
                <span>Registered city</span>
                <strong>{organization.city}</strong>
              </div>
              <div>
                <span>Reviewer email</span>
                <strong>{organization.email}</strong>
              </div>
              <div>
                <span>Ascend partner ID</span>
                <code>{organization.registration}</code>
              </div>
            </div>
          )}
          <p className="asc-muted">
            Choose your organization from Ascend's partner list. Your role and
            organization are checked before any applicant data is shown.
          </p>
          <label className="asc-consent-row">
            <input
              id="lender-confirmed"
              type="checkbox"
              checked={lender.confirmed}
              onChange={(event) => edit("confirmed", event.target.checked)}
              aria-invalid={!!errors.confirmed}
              aria-describedby={
                errors.confirmed ? "lender-confirmed-error" : undefined
              }
            />
            <span>
              <strong>
                I confirm these reviewer details are correct.
              </strong>
              <small>
                Reviewer access does not grant lending authority.
              </small>
            </span>
          </label>
          {errors.confirmed && (
            <p className="asc-error" id="lender-confirmed-error" role="alert">
              {errors.confirmed}
            </p>
          )}
          <div
            className={`asc-verification ${verified ? "verified" : ""}`}
            role="status"
          >
            <Badge tone={verified ? "green" : "amber"}>
              {verified ? "CHECKS PASSED" : "NOT YET VERIFIED"}
            </Badge>
            <p>
              {verified
                ? "Organization, reviewer role and confirmation checked. Editing any field requires a new check."
                : "Complete organization information and run the check."}
            </p>
            {verified && (
              <small>
                Check recorded:{" "}
                {new Date(lender.verifiedAt).toLocaleString("en-IN")}
              </small>
            )}
          </div>
          <div className="asc-actions">
            <button
              type="submit"
              className="asc-button primary"
              disabled={verified}
            >
              Verify organization <Icon name="check" size={17} />
            </button>
            <button
              type="button"
              className="asc-button secondary"
              disabled={
                !verified ||
                !hasConsent(session) ||
                Object.keys(
                  validateScenario(session.inputDraft ?? session.scenario),
                ).length > 0
              }
              onClick={() => navigate("/decision-lab")}
            >
              Open reviewer view <Icon size={17} />
            </button>
          </div>
        </form>
      </section>
      <aside>
        <AssessmentPreview session={session} verified={verified} />
      </aside>
    </div>
  );
}
