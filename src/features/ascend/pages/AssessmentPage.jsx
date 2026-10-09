import React, { useMemo, useRef, useState } from "react";
import { Badge, Field, Icon, NumberField, SectionHeading } from "../components/ui.jsx";
import {
  CoverageStrip,
  DemoNote,
  Formula,
  KeyValue,
  StageList,
  dateTime,
  inr,
  monthLabel,
  percent,
} from "../components/creditUi.jsx";
import { DemoControls, DemoModeBar } from "../components/DemoControls.jsx";
import { DemoCheckout } from "../components/DemoCheckout.jsx";
import { PROFILES } from "../data/demoStore.js";
import { deriveCredit } from "../data/creditState.js";
import { buildAssessmentReport, reportFileName } from "../data/report.js";
import { downloadJson } from "../components/download.js";
import { ESSENTIALS, normalizeScenario } from "../domain/cashflow.js";
import { amountError } from "../domain/creditLadder.js";
import {
  DEMO_FIPS,
  DEMO_NETBANKING_BANKS,
  MAX_PAYMENT,
  PAYMENT_PURPOSES,
  UPI_ID_PATTERN,
} from "../integrations/demoServices.js";

const AA_PURPOSE = "One-time creditworthiness assessment for the Ascend credit ladder";
const AA_STAGES = [
  "Consent approved with the Account Aggregator",
  "Fetching 12 months of statements",
  "Categorising transactions and computing cash-flow features",
];
const PAY_STATUS = {
  REDIRECTING: ["Redirecting to the payment provider…", "amber"],
  AWAITING_USER_ACTION: ["Waiting for you at the provider", "amber"],
  PROCESSING: ["Verifying with the provider…", "amber"],
  SUCCESS: ["Payment verified", "green"],
  PENDING: ["Pending verification", "amber"],
  FAILED: ["Payment failed", "red"],
  CANCELLED: ["Payment cancelled", "neutral"],
  UNKNOWN: ["Status unknown", "amber"],
};
const APPLICATION_LABEL = {
  DRAFT: "Not assessed yet",
  ASSESSED: "Assessed · not yet shared with a lender",
  SUBMITTED_FOR_REVIEW: "Shared for lender review",
};
const newKey = () => `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round2 = (value) => Math.round(value * 100) / 100;

export function sdaState(sda, assessment) {
  if (sda.status === "VERIFIED") {
    if (assessment.riskFlags.some((flag) => flag.code === "SDA_STALE")) return ["Needs refresh", "amber"];
    if (assessment.riskFlags.some((flag) => flag.code === "INSUFFICIENT_BALANCE")) return ["Insufficient balance", "amber"];
    return ["Verified", "green"];
  }
  return {
    NOT_STARTED: ["Not verified", "neutral"],
    PENDING: ["Pending at bank", "amber"],
    TIMEOUT: ["Timed out", "red"],
    FAILED: ["Verification failed", "red"],
  }[sda.status];
}

function consistency(cv) {
  if (cv == null) return "Not enough data";
  if (cv <= 0.15) return "Steady";
  if (cv <= 0.35) return "Mostly steady";
  if (cv <= 0.6) return "Variable";
  return "Highly variable";
}

function Mini({ label, value, tag, sub, testId }) {
  return (
    <div className="asc-mini">
      <span>
        {label}
        <em className={`asc-tag ${tag.toLowerCase()}`}>{tag}</em>
      </span>
      <strong data-testid={testId}>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function AssessmentPage({ session, update, navigate, notify, services }) {
  const model = useMemo(() => deriveCredit(session), [session]);
  const { assessment: a, features: f, facility } = model;
  const credit = session.credit;
  const profile = PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  const [demoOpen, setDemoOpen] = useState(false);
  const [fipId, setFipId] = useState(credit.aa.fipId ?? DEMO_FIPS[0].id);
  const [aaAgree, setAaAgree] = useState(false);
  const [aaRun, setAaRun] = useState(null);
  const [sdaBusy, setSdaBusy] = useState(false);
  const [pay, setPay] = useState({ purpose: "SDA_DEPOSIT", amount: "1000", method: "UPI", upiId: "", bankId: DEMO_NETBANKING_BANKS[0].id });
  const [payErrors, setPayErrors] = useState({});
  const [txn, setTxn] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const idempotencyKey = useRef(newKey());
  const analyzing = aaRun?.stage != null;
  const sdaVerified = credit.sda.status === "VERIFIED";
  const [sdaLabel, sdaTone] = sdaState(credit.sda, a);
  const position = a.position;

  /** Applies an async result only if the same applicant is still active. */
  function patchFor(profileId, fn) {
    update((current) => (current.profileId === profileId ? { ...current, credit: fn(current.credit) } : current), true);
  }

  async function connectAA() {
    if (!aaAgree) {
      setAaRun({ stage: null, error: "Tick the consent box to continue. You can also skip AA for a provisional result." });
      return;
    }
    const profileId = session.profileId;
    try {
      setAaRun({ stage: 0, error: "" });
      const consent = await services.aa.createConsent({ fipId, purpose: AA_PURPOSE });
      setAaRun({ stage: 1, error: "" });
      const data = await services.aa.fetchFIData({ consentId: consent.consentId, profileId, settings: session.credit.demo });
      setAaRun({ stage: 2, error: "" });
      if (!Array.isArray(data.transactions)) throw new Error("The statement data could not be read.");
      const analyzedAt = new Date().toISOString();
      patchFor(profileId, (current) => ({
        ...current,
        aa: { status: "ANALYZED", consentId: consent.consentId, fipId, consentedAt: consent.createdAt, analyzedAt, revokedAt: null },
      }));
      setAaRun(null);
      setAaAgree(false);
      notify("Statements analysed. Your 12-month cash-flow findings are ready.");
    } catch (error) {
      setAaRun({ stage: null, error: error.message || "The Account Aggregator request failed. Nothing was shared." });
    }
  }
  async function revokeAA() {
    const profileId = session.profileId;
    const result = await services.aa.revokeConsent(credit.aa.consentId);
    patchFor(profileId, (current) => ({
      ...current,
      aa: { status: "REVOKED", consentId: null, fipId: null, consentedAt: null, analyzedAt: null, revokedAt: result.revokedAt },
    }));
    notify("AA consent revoked. Cash-flow findings were removed from your assessment.");
  }

  async function verifySDA() {
    const profileId = session.profileId;
    setSdaBusy(true);
    try {
      const result = await services.sda.verifyBalance({
        bankBalance: credit.demo.bankBalance,
        otherRestrictions: model.fixture.otherRestrictions,
        confirmedLien: model.fixture.facility?.confirmedLien ?? 0,
        outcome: credit.demo.sdaOutcome,
      });
      patchFor(profileId, (current) => ({
        ...current,
        sda:
          result.status === "VERIFIED"
            ? { status: "VERIFIED", balance: result.balance, otherRestrictions: result.otherRestrictions, confirmedLien: result.confirmedLien, checkedAt: result.checkedAt, reference: result.reference, message: null }
            : { status: result.status, balance: null, otherRestrictions: null, confirmedLien: null, checkedAt: null, reference: result.reference, message: result.message },
      }));
      notify(result.status === "VERIFIED" ? "SDA balance verified with your bank." : result.message);
    } finally {
      setSdaBusy(false);
    }
  }

  function analyzeProfile() {
    if (!canAnalyze) return;
    update(
      (current) => ({
        ...current,
        credit: {
          ...current.credit,
          application: { status: "ASSESSED", assessedAt: new Date().toISOString(), assessedLevel: a.recommendedLevel, submittedAt: null, reference: null },
        },
      }),
      true,
    );
    notify(
      a.recommendedLevel
        ? `Assessment complete: Level ${a.recommendedLevel} · ${a.levelName} recommended. This is not an approval.`
        : "Assessment complete. Ascend recommends pausing for now.",
    );
    navigate("/credit");
  }

  function openInLab() {
    if (!f || !a.recommendedLevel) return;
    const fixedEssentials = ESSENTIALS.reduce((sum, item) => sum + item.amount, 0);
    const otherSpend = Math.max(
      0,
      (f.observed.medianEssential ?? 0) + (f.observed.medianDiscretionary ?? 0) + (f.observed.medianSubscriptions ?? 0) - fixedEssentials,
    );
    const incomeDay = Math.round(f.estimated.incomeDay ?? 5);
    const scenario = normalizeScenario({
      principal: round2(clamp(a.baseLimit, 1000, 10000)),
      income: round2(clamp((f.observed.medianIncome ?? 0) - otherSpend, 0, 100000)),
      openingBalance: round2(clamp(f.observed.endOfMonthLiquidity ?? 0, 0, 1000000)),
      stipendDay: clamp(incomeDay, 1, 30),
      emiDay: clamp(incomeDay + 5, 1, 28),
      existingDebt: round2(clamp(f.observed.existingObligations ?? 0, 0, 100000)),
      shock: 0,
      shockDay: 3,
    });
    update(
      (current) => ({
        ...current,
        scenario,
        // Keep the Apply draft in step, or a reload would restore it over this scenario.
        inputDraft: { ...scenario },
        credit: { ...current.credit, labLinked: { scenario, level: a.recommendedLevel, at: new Date().toISOString() } },
      }),
      true,
    );
    navigate("/decision-lab");
  }

  function downloadReport() {
    try {
      // Re-derive at click time so the file reflects the latest state, not the last render.
      const generatedAt = new Date().toISOString();
      const report = buildAssessmentReport(session, deriveCredit(session, generatedAt), generatedAt);
      downloadJson(report, reportFileName(session, generatedAt));
      notify("Assessment report downloaded.");
    } catch {
      notify("The download was blocked by this browser. Nothing was saved.");
    }
  }
  /** Payment shortcut: pre-fills the form at the bottom of the page and glides down to it. */
  function jumpToPayment(purpose, method) {
    if (!payBusy) {
      setPay((prev) => ({ ...prev, purpose, method }));
      setPayErrors({});
    }
    const section = document.getElementById("payments-section");
    if (!section) return;
    const arrive = () => {
      document.getElementById("pay-amount")?.focus({ preventScroll: true });
      section.classList.remove("asc-pay-highlight");
      void section.offsetWidth; // restart the highlight if clicked again
      section.classList.add("asc-pay-highlight");
      setTimeout(() => section.classList.remove("asc-pay-highlight"), 1400);
    };
    const start = window.scrollY;
    const target = Math.max(0, start + section.getBoundingClientRect().top - 16);
    if (typeof window.requestAnimationFrame !== "function" || Math.abs(target - start) < 2) {
      window.scrollTo(0, target);
      arrive();
      return;
    }
    // Animated in JS so the glide works even where CSS or the browser would jump instantly.
    const duration = 700;
    const began = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now) => {
      const progress = Math.min(1, (now - began) / duration);
      window.scrollTo({ top: start + (target - start) * ease(progress), behavior: "instant" });
      if (progress < 1) window.requestAnimationFrame(step);
      else arrive();
    };
    window.requestAnimationFrame(step);
  }
  function setPayField(key, value) {
    setPay((prev) => ({ ...prev, [key]: value }));
    setPayErrors((prev) => ({ ...prev, [key]: "", form: "" }));
  }
  function validatePayment() {
    const errors = {};
    if (pay.purpose === "BILL_PAYMENT" && !facility) errors.purpose = "There is no active credit facility to pay.";
    const max = pay.purpose === "BILL_PAYMENT" ? Math.min(MAX_PAYMENT, credit.outstanding) : MAX_PAYMENT;
    const amountIssue = amountError(pay.amount, "Amount", { min: 1, max: Math.max(1, max) });
    if (amountIssue) errors.amount = amountIssue;
    if (pay.purpose === "BILL_PAYMENT" && credit.outstanding <= 0) errors.amount = "Nothing is outstanding right now.";
    if (pay.method === "UPI" && !UPI_ID_PATTERN.test(pay.upiId.trim())) errors.upiId = "Enter a valid UPI ID, like name@bank.";
    setPayErrors(errors);
    return Object.keys(errors).length === 0;
  }
  function recordPayment(profileId, record, effect) {
    patchFor(profileId, (current) => {
      const existing = current.payments.find((item) => item.transactionId === record.transactionId);
      let next = current;
      let applied = existing?.applied ?? false;
      // Effects apply once, only for a provider-verified success.
      if (!applied && record.status === "SUCCESS" && effect) {
        next = effect(current);
        applied = true;
      }
      const row = {
        transactionId: record.transactionId,
        amount: record.amount,
        method: record.method,
        purpose: record.purpose,
        status: record.status,
        reference: record.reference ?? null,
        createdAt: existing?.createdAt ?? record.createdAt,
        updatedAt: record.updatedAt ?? new Date().toISOString(),
        applied,
      };
      return { ...next, payments: [row, ...next.payments.filter((item) => item.transactionId !== row.transactionId)].slice(0, 20) };
    });
  }
  async function startPayment() {
    if (payBusy || !validatePayment()) return;
    setPayBusy(true);
    setTxn({ status: "REDIRECTING", amount: Number(pay.amount), method: pay.method, purpose: pay.purpose });
    try {
      const created = await services.payments.createPayment({
        amount: Number(pay.amount),
        currency: "INR",
        method: pay.method,
        purpose: pay.purpose,
        idempotencyKey: idempotencyKey.current,
        upiId: pay.upiId.trim(),
        bankId: pay.bankId,
      });
      setTxn(created);
      if (created.duplicate && created.status !== "AWAITING_USER_ACTION") {
        setPayBusy(false);
        notify("This payment was already submitted. Showing its current status instead of charging again.");
        return;
      }
      recordPayment(session.profileId, created);
      setCheckoutOpen(true);
    } catch (error) {
      setTxn(null);
      setPayErrors({ form: error.message });
      setPayBusy(false);
    }
  }
  async function settle(verified) {
    const profileId = session.profileId;
    let effect = null;
    if (verified.status === "SUCCESS" && verified.purpose === "SDA_DEPOSIT") {
      const deposit = await services.sda.confirmDeposit({ transactionId: verified.transactionId, amount: verified.amount });
      if (deposit.status === "CREDITED")
        effect = (current) => ({
          ...current,
          demo: { ...current.demo, bankBalance: round2(current.demo.bankBalance + verified.amount) },
          sda:
            current.sda.status === "VERIFIED"
              ? { ...current.sda, balance: round2(current.sda.balance + verified.amount), checkedAt: deposit.creditedAt, reference: deposit.reference }
              : current.sda,
        });
    } else if (verified.status === "SUCCESS" && verified.purpose === "BILL_PAYMENT") {
      effect = (current) => ({ ...current, outstanding: round2(Math.max(0, current.outstanding - verified.amount)) });
    }
    recordPayment(profileId, verified, effect);
    setTxn(verified);
    if (["SUCCESS", "FAILED", "CANCELLED"].includes(verified.status)) idempotencyKey.current = newKey();
    setPayBusy(false);
    notify(
      {
        SUCCESS: verified.purpose === "SDA_DEPOSIT" ? "Payment verified and the deposit was confirmed by the bank." : "Payment verified. Your outstanding balance was updated.",
        PENDING: "The provider hasn't confirmed this payment yet. Nothing changes until it does.",
        FAILED: "The provider reported this payment as failed. No balance was changed.",
        CANCELLED: "Payment cancelled. No balance was changed.",
      }[verified.status] ?? "The payment status could not be confirmed. Nothing was changed.",
    );
  }
  async function onCheckoutOutcome(outcome) {
    setCheckoutOpen(false);
    setTxn((prev) => ({ ...prev, status: "PROCESSING" }));
    // The provider redirects back with a claim; only the provider's own record is trusted.
    const claim = services.payments.simulateCheckout(txn.transactionId, outcome) ?? { transactionId: txn.transactionId };
    const verified = await services.payments.handlePaymentReturn(claim);
    await settle(verified);
  }
  async function checkStatus(simulate) {
    if (!txn) return;
    if (simulate) services.payments.simulateSettlement(txn.transactionId, simulate);
    setTxn((prev) => ({ ...prev, status: "PROCESSING" }));
    const verified = await services.payments.getPaymentStatus(txn.transactionId);
    if (verified.status === "UNKNOWN") {
      setTxn((prev) => ({ ...prev, status: "PENDING" }));
      notify("The provider has no record of this payment. Nothing was changed.");
      return;
    }
    await settle(verified);
  }

  const missingForCta = [];
  if (!sdaVerified) missingForCta.push("a verified SDA balance");
  else if (a.riskFlags.some((flag) => flag.code === "SDA_STALE")) missingForCta.push("a fresh SDA balance check");
  if (analyzing) missingForCta.push("the AA analysis to finish");
  const canAnalyze = missingForCta.length === 0 && !sdaBusy;
  const aff = a.affordability;
  const fip = DEMO_FIPS.find((item) => item.id === credit.aa.fipId);
  const requested = session.scenario.principal;
  const [txnLabel, txnTone] = txn ? PAY_STATUS[txn.status] ?? PAY_STATUS.UNKNOWN : [];

  return (
    <>
      <header className="asc-page-heading">
        <div>
          <div className="asc-eyebrow">
            <span>03</span> ASSESSMENT & PAYMENTS
          </div>
          <h1>
            Know your numbers.
            <br />
            <em>Before you borrow.</em>
          </h1>
          <p>
            Share your account history, verify your savings and see what a responsible starting limit looks like
            before anything is approved.
          </p>
        </div>
        <div className="asc-heading-note">
          <Icon name="shield" size={24} />
          <div>
            <strong>Recommendations, not approvals.</strong>
            <span>Only a regulated lender can approve credit.</span>
          </div>
        </div>
      </header>
      <DemoModeBar open={demoOpen} onToggle={() => setDemoOpen(!demoOpen)} />
      {demoOpen && <DemoControls session={session} update={update} notify={notify} />}
      <section className="asc-card asc-pay-app" aria-label="Ascend Pay">
        <div className="asc-pay-app-brand">
          <span className="asc-pay-app-icon">
            <Icon name="wallet" size={20} />
          </span>
          <div>
            <strong>Ascend Pay</strong>
            <small>
              {sdaVerified ? `SDA ${inr(credit.sda.balance)}` : "SDA balance not verified yet"}
              {facility ? ` · Outstanding ${inr(credit.outstanding)}` : ""}
            </small>
          </div>
        </div>
        <div className="asc-pay-app-actions">
          <button className="asc-button primary" onClick={() => jumpToPayment("SDA_DEPOSIT", "UPI")}>
            <Icon name="spark" size={16} />
            Add money · UPI
          </button>
          <button className="asc-button secondary" onClick={() => jumpToPayment("SDA_DEPOSIT", "NETBANKING")}>
            <Icon name="building" size={16} />
            Pay by net banking
          </button>
          <button className="asc-button secondary" disabled={!facility} onClick={() => jumpToPayment("BILL_PAYMENT", "UPI")}>
            Pay my bill
          </button>
        </div>
      </section>
      <div className="asc-apply-grid">
        <div className="asc-card asc-form-card">
          <section className="asc-form-section">
            <SectionHeading number="01" title="Your application" description="Everything here is reused from your earlier steps. Nothing needs to be re-entered." />
            <div className="asc-identity">
              <div className="asc-avatar">{profile.initials}</div>
              <div>
                <strong>{profile.name}</strong>
                <span>{model.fixture.persona}</span>
              </div>
            </div>
            <div className="asc-fixture-list compact">
              <KeyValue label="Purpose · requested amount" value={`${session.purpose} · ${inr(requested)}`} />
              <KeyValue label="Application status" value={APPLICATION_LABEL[credit.application.status]} />
              <KeyValue label="Account Aggregator" value={credit.aa.status === "ANALYZED" ? "Analysed" : credit.aa.status === "REVOKED" ? "Consent revoked" : "Not connected"} />
              <KeyValue label="SDA verification" value={sdaLabel} />
              <KeyValue label="Existing Ascend facility" value={facility ? `Level ${facility.level} · active` : "None"} />
            </div>
            <div className="asc-inline-note">
              <Icon name="info" size={17} />
              <span>
                Your SDA balance sets the size of each level. Twelve months of cash flow show whether repayments fit.
                Your repayment record sets how far up the ladder you start.
              </span>
            </div>
          </section>

          <section className="asc-form-section" id="aa-section">
            <SectionHeading
              number="02"
              title="Account Aggregator · 12-month cash flow"
              description="Share deposit statements with explicit, revocable consent. Ascend reads patterns, not passwords."
            />
            {analyzing ? (
              <div className="asc-progress" role="status" aria-live="polite">
                <StageList
                  label="AA analysis progress"
                  stages={AA_STAGES.map((label, index) => ({
                    label,
                    state: index < aaRun.stage ? "done" : index === aaRun.stage ? "active" : "todo",
                  }))}
                />
                <div className="asc-progress-bar">
                  <span style={{ width: `${((aaRun.stage + 1) / AA_STAGES.length) * 100}%` }} />
                </div>
              </div>
            ) : credit.aa.status === "ANALYZED" && f ? (
              <>
                <div className="asc-status-line">
                  <Badge tone="green" dot>CONSENT ACTIVE</Badge>
                  <span>{fip?.name} · analysed {dateTime(credit.aa.analyzedAt)}</span>
                </div>
                <div className="asc-mini-grid">
                  <Mini label="Median monthly income" value={inr(f.observed.medianIncome)} tag="Observed" testId="aa-income" />
                  <Mini label="Median monthly spending" value={inr(f.observed.medianOutflow)} tag="Observed" />
                  <Mini label="Free cash flow a month" value={inr(f.estimated.freeCashFlow)} tag="Estimated" testId="aa-fcf" />
                  <Mini
                    label="Income consistency"
                    value={consistency(f.estimated.incomeCV)}
                    tag="Estimated"
                    sub={f.estimated.incomeCV != null ? `${percent(f.estimated.incomeCV)} month-to-month variation` : null}
                  />
                  <Mini label="Existing EMIs & card bills" value={inr(f.observed.existingObligations)} tag="Observed" />
                  <Mini label="Typical month-end balance" value={inr(f.observed.endOfMonthLiquidity)} tag="Observed" />
                </div>
                <div className="asc-coverage-row">
                  <CoverageStrip monthly={f.monthly} />
                  <span>
                    {f.coverageMonths} of {f.period.months} months · {f.transactionCount} transactions ·{" "}
                    {monthLabel(f.period.from)} – {monthLabel(f.period.to)} · Data quality{" "}
                    <b data-testid="aa-confidence">{f.confidence.toLowerCase()}</b>
                  </span>
                </div>
                {f.flags.length > 0 && (
                  <ul className="asc-flags">
                    {f.flags.map((flag) => (
                      <li key={flag.code} className={flag.severity}>
                        <Icon name={flag.severity === "info" ? "info" : "alert"} size={14} />
                        {flag.message}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="asc-impact">
                  <strong>How this affects your assessment</strong>
                  <p>
                    {f.estimated.freeCashFlow != null
                      ? `Repayments are tested against your estimated free cash flow of ${inr(f.estimated.freeCashFlow)} a month. `
                      : "There isn't enough data to estimate free cash flow, so the result is provisional. "}
                    {f.estimated.incomeCV == null
                      ? ""
                      : f.estimated.incomeCV > 0.6
                        ? "Because your income varies a lot, Ascend starts you fully secured. "
                        : f.estimated.incomeCV > 0.35
                          ? "Moderately variable income keeps you on secured levels for now. "
                          : "Steady income supports moving up as you build a repayment record. "}
                    {f.coverageMonths < 6 ? "With a short history, Ascend can only give a provisional result." : ""}
                  </p>
                </div>
                <details className="asc-adjust asc-findings">
                  <summary>
                    More findings <Icon name="chevron" size={15} />
                  </summary>
                  <div className="asc-kv-list">
                    <KeyValue label="Median monthly inflow (all credits)" value={inr(f.observed.medianInflow)} tag="Observed" />
                    <KeyValue label="Essential spending a month" value={inr(f.observed.medianEssential)} tag="Observed" />
                    <KeyValue label="Discretionary spending a month" value={inr(f.observed.medianDiscretionary)} tag="Observed" />
                    <KeyValue label="Subscriptions a month" value={inr(f.observed.medianSubscriptions)} tag="Observed" />
                    <KeyValue label="Essentials as a share of income" value={percent(f.estimated.essentialRatio)} tag="Estimated" />
                    <KeyValue label="Existing debt service ratio" value={percent(f.estimated.debtServiceRatio)} tag="Estimated" />
                    <KeyValue label="Main income type" value={f.estimated.primaryIncome ?? "—"} tag="Estimated" />
                    <KeyValue label="Income timing" value={f.estimated.incomeRegularity === "REGULAR" ? `Regular, around day ${f.estimated.incomeDay}` : f.estimated.incomeRegularity ? "Irregular" : "—"} tag="Estimated" />
                    <KeyValue label="Average balance" value={inr(f.observed.averageMonthlyBalance)} tag="Observed" />
                    <KeyValue label="Months with a balance under ₹500" value={f.observed.lowBalanceMonths ?? "—"} tag="Observed" />
                    <KeyValue label="Payment-return charges" value={f.observed.bounces} tag="Observed" />
                  </div>
                </details>
                <details className="asc-disclosure">
                  <summary>
                    View consent summary <Icon name="info" size={16} />
                  </summary>
                  <p>
                    Consent {credit.aa.consentId} · given {dateTime(credit.aa.consentedAt)} · purpose: {AA_PURPOSE}. Data:
                    deposit transactions and balances, one-time fetch, 12 months. Raw transactions are not stored by
                    Ascend. You can revoke at any time.
                  </p>
                </details>
                <div className="asc-actions">
                  <button className="asc-button secondary" onClick={revokeAA}>
                    Revoke AA consent
                  </button>
                </div>
              </>
            ) : (
              <>
                <Field label="Account to link" id="aa-fip">
                  <select id="aa-fip" value={fipId} onChange={(event) => setFipId(event.target.value)}>
                    {DEMO_FIPS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="asc-fixture-list compact">
                  <KeyValue label="Purpose" value="Creditworthiness assessment" />
                  <KeyValue label="Data shared" value="Deposit transactions & balances" />
                  <KeyValue label="Period" value="Last 12 months" />
                  <KeyValue label="Frequency · retention" value="One-time · not stored after analysis" />
                </div>
                <label className="asc-consent-row">
                  <input
                    type="checkbox"
                    checked={aaAgree}
                    onChange={(event) => {
                      setAaAgree(event.target.checked);
                      setAaRun(null);
                    }}
                  />
                  <span>
                    <strong>
                      I consent to share this account's statements through an Account Aggregator <b>Required</b>
                    </strong>
                    <small>Used only for this one-time assessment. You can revoke it at any time.</small>
                  </span>
                </label>
                {aaRun?.error && (
                  <p className="asc-error" role="alert">
                    {aaRun.error}
                  </p>
                )}
                {credit.aa.status === "REVOKED" && (
                  <p className="asc-caption">Consent revoked {dateTime(credit.aa.revokedAt)}. Its findings are no longer used.</p>
                )}
                <div className="asc-actions">
                  <button className="asc-button primary" onClick={connectAA}>
                    Connect AA & analyse statements
                    <Icon size={17} />
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="asc-form-section" id="sda-section">
            <SectionHeading
              number="03"
              title="SDA · savings verification"
              description="Ascend checks your savings deposit balance with your bank. A check never locks your money."
            />
            <div className="asc-status-line">
              <Badge tone={sdaTone}>{sdaLabel.toUpperCase()}</Badge>
              <span>{credit.sda.checkedAt ? `Last checked ${dateTime(credit.sda.checkedAt)}` : "Not checked yet"}</span>
            </div>
            {credit.sda.message && (
              <p className="asc-error" role="status">
                {credit.sda.message}
              </p>
            )}
            <div className="asc-kv-list">
              <KeyValue label="Verified savings balance" value={sdaVerified ? inr(credit.sda.balance) : "—"} testId="sda-balance" />
              <KeyValue label="Existing holds (not Ascend)" value={sdaVerified ? inr(credit.sda.otherRestrictions) : "—"} />
              <KeyValue label="Confirmed Ascend LIEN" tag="Bank-confirmed" value={sdaVerified ? inr(credit.sda.confirmedLien) : "—"} testId="confirmed-lien" />
              <KeyValue label="Available savings" value={position ? inr(position.availableSavings) : "—"} testId="available-savings" tone="strong" />
              <KeyValue
                label="Proposed collateral"
                tag="Proposed"
                value={inr(a.proposedLien)}
                hint="Not marked. A LIEN is placed only after a lender approves and your bank confirms it."
                testId="proposed-lien"
              />
              <KeyValue label="Available after the proposed LIEN" value={inr(position?.availableAfterProposedLien)} />
            </div>
            <Formula summary="How these are calculated">
              Available savings = verified balance − existing holds − confirmed Ascend LIEN. Proposed collateral = proposed
              limit × the level's collateral share. Available after the proposed LIEN = verified balance − existing holds −
              the larger of the confirmed and proposed LIEN, so no rupee is counted twice.
            </Formula>
            <div className="asc-actions">
              <button className="asc-button secondary" disabled={sdaBusy} onClick={verifySDA}>
                {sdaBusy ? "Checking with your bank…" : sdaVerified ? "Refresh SDA verification" : "Verify SDA balance"}
                <Icon name="reset" size={16} />
              </button>
            </div>
          </section>

          <section className="asc-form-section last" id="payments-section">
            <SectionHeading
              number="04"
              title="Payments · UPI & net banking"
              description="Add money to your SDA or pay an Ascend bill. A payment never changes your level or limit by itself."
            />
            <div className="asc-fields two">
              <Field label="What is this payment for?" id="pay-purpose" error={payErrors.purpose}>
                <select id="pay-purpose" value={pay.purpose} disabled={payBusy} onChange={(event) => setPayField("purpose", event.target.value)}>
                  <option value="SDA_DEPOSIT">{PAYMENT_PURPOSES.SDA_DEPOSIT} (deposit)</option>
                  <option value="BILL_PAYMENT" disabled={!facility}>
                    {PAYMENT_PURPOSES.BILL_PAYMENT}
                    {facility ? "" : " (no active facility)"}
                  </option>
                </select>
              </Field>
              <NumberField
                id="pay-amount"
                label="Payment amount"
                prefix="₹"
                step={0.01}
                min={1}
                max={MAX_PAYMENT}
                value={pay.amount}
                error={payErrors.amount}
                onChange={(value) => setPayField("amount", value)}
                hint={pay.purpose === "BILL_PAYMENT" ? `Outstanding: ${inr(credit.outstanding)}` : "₹1 – ₹1,00,000"}
              />
            </div>
            <div className="asc-tabs asc-pay-tabs" role="group" aria-label="Payment method">
              {[
                ["UPI", "UPI"],
                ["NETBANKING", "Net banking"],
              ].map(([id, label]) => (
                <button key={id} className={pay.method === id ? "is-active" : ""} aria-pressed={pay.method === id} disabled={payBusy} onClick={() => setPayField("method", id)}>
                  <Icon name={id === "UPI" ? "spark" : "building"} size={16} />
                  {label}
                </button>
              ))}
            </div>
            {pay.method === "UPI" ? (
              <Field label="Your UPI ID" id="pay-upi" error={payErrors.upiId} hint="For example, name@bank">
                <div className={`asc-input-wrap ${payErrors.upiId ? "has-error" : ""}`}>
                  <input
                    id="pay-upi"
                    type="text"
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="name@bank"
                    value={pay.upiId}
                    disabled={payBusy}
                    onChange={(event) => setPayField("upiId", event.target.value)}
                    aria-invalid={!!payErrors.upiId}
                  />
                </div>
              </Field>
            ) : (
              <Field label="Your bank" id="pay-bank" hint="You'll continue on your bank's own secure page.">
                <select id="pay-bank" value={pay.bankId} disabled={payBusy} onChange={(event) => setPayField("bankId", event.target.value)}>
                  {DEMO_NETBANKING_BANKS.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="asc-pay-summary">
              You pay <b>{amountError(pay.amount, "Amount", { min: 1, max: MAX_PAYMENT }) ? "—" : inr(Number(pay.amount))}</b> to{" "}
              <b>{pay.purpose === "SDA_DEPOSIT" ? "your Ascend SDA" : "your Ascend credit facility"}</b> by{" "}
              <b>{pay.method === "UPI" ? "UPI" : "net banking"}</b>.
              {pay.purpose === "SDA_DEPOSIT" && " Your SDA balance updates only after the bank confirms the deposit."}
            </div>
            {payErrors.form && (
              <p className="asc-error" role="alert">
                {payErrors.form}
              </p>
            )}
            <button className="asc-button primary wide" disabled={payBusy} onClick={startPayment}>
              {pay.method === "UPI" ? "Continue to UPI app" : "Continue to your bank"}
              <Icon name="external" size={16} />
            </button>
            {txn && (
              <div className={`asc-pay-status ${txnTone}`} role="status" aria-live="polite">
                <div className="asc-status-line">
                  <Badge tone={txnTone}>{txnLabel.toUpperCase()}</Badge>
                  <span data-testid="payment-status">{txn.status}</span>
                </div>
                {txn.transactionId && (
                  <div className="asc-kv-list">
                    <KeyValue label="Transaction ID" value={txn.transactionId} />
                    <KeyValue label="Amount" value={inr(txn.amount)} />
                    {txn.reference && <KeyValue label="Provider reference" value={txn.reference} />}
                    {txn.updatedAt && <KeyValue label="Last update" value={dateTime(txn.updatedAt)} />}
                  </div>
                )}
                {txn.status === "SUCCESS" && (
                  <p className="asc-muted">
                    {txn.purpose === "SDA_DEPOSIT"
                      ? `The bank confirmed the deposit. Your SDA balance is now ${inr(credit.sda.status === "VERIFIED" ? credit.sda.balance : credit.demo.bankBalance)}.`
                      : `Your outstanding balance is now ${inr(credit.outstanding)}.`}{" "}
                    Your level and limit only change through a new assessment and lender review.
                  </p>
                )}
                {txn.status === "PENDING" && (
                  <>
                    <p className="asc-muted">The provider hasn't confirmed this payment. Nothing changes until it does.</p>
                    <div className="asc-actions">
                      <button className="asc-button secondary" onClick={() => checkStatus()}>
                        Check status
                      </button>
                      <button className="asc-text-button" onClick={() => checkStatus("SUCCESS")}>
                        Provider confirmed payment
                      </button>
                      <button className="asc-text-button" onClick={() => checkStatus("FAILED")}>
                        Provider declined payment
                      </button>
                    </div>
                  </>
                )}
                {["FAILED", "CANCELLED"].includes(txn.status) && (
                  <p className="asc-muted">No balance was changed. You can try again. A new attempt gets a new reference.</p>
                )}
              </div>
            )}
            {credit.payments.length > 0 && (
              <details className="asc-disclosure asc-pay-history">
                <summary>
                  Recent payments ({credit.payments.length}) <Icon name="info" size={16} />
                </summary>
                <ul>
                  {credit.payments.slice(0, 5).map((item) => (
                    <li key={item.transactionId}>
                      <span>
                        {PAYMENT_PURPOSES[item.purpose]} · {item.method === "UPI" ? "UPI" : "Net banking"}
                        <small>
                          {item.transactionId} · {dateTime(item.updatedAt)}
                        </small>
                      </span>
                      <b>{inr(item.amount)}</b>
                      <Badge tone={(PAY_STATUS[item.status] ?? PAY_STATUS.UNKNOWN)[1]}>{item.status}</Badge>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <DemoNote>
              Ascend never asks for your UPI PIN or bank password, and never starts a debit without a
              mandate you have authorised.
            </DemoNote>
          </section>
        </div>

        <aside className="asc-apply-aside">
          <section className="asc-dark-card asc-preview" aria-label="Credit affordability preview">
            <div className="asc-eyebrow light">CREDIT AFFORDABILITY PREVIEW</div>
            {!sdaVerified ? (
              <>
                <h2>
                  Verify your savings
                  <br />
                  <em>to see a proposed limit.</em>
                </h2>
                <p className="asc-dark-text">Each level's limit is a share of your verified SDA balance. AA cash flow shows whether its repayments fit.</p>
              </>
            ) : a.recommendedLevel == null ? (
              <>
                <h2>
                  Pausing is the
                  <br />
                  <em>responsible step.</em>
                </h2>
                <p className="asc-dark-text" data-testid="preview-status">
                  {a.missing.length ? `Still needed: ${a.missing.join("; ")}.` : a.reasons[a.reasons.length - 1]}
                </p>
              </>
            ) : (
              <>
                <h2>
                  Level {a.recommendedLevel} · {a.levelName}
                  <br />
                  <em>Proposed, not approved.</em>
                </h2>
                <div className="asc-quote-line">
                  <span>Proposed credit limit</span>
                  <strong data-testid="preview-limit">{inr(a.baseLimit)}</strong>
                </div>
                <div className="asc-quote-line">
                  <span>Proposed collateral (LIEN)</span>
                  <strong data-testid="preview-lien">{inr(a.proposedLien)}</strong>
                </div>
                <div className="asc-quote-line">
                  <span>Unsecured portion</span>
                  <strong>{inr(a.unsecuredExposure)}</strong>
                </div>
                <div className="asc-quote-total">
                  <div>
                    <span>Repayment if fully used</span>
                    <strong data-testid="preview-repayment">{inr(aff.repayment)}</strong>
                  </div>
                  <span>a month × {aff.installments.length}</span>
                </div>
                <div className="asc-quote-line">
                  <span>Existing obligations considered</span>
                  <strong>{aff.existingObligations == null ? "Unknown" : inr(aff.existingObligations)}</strong>
                </div>
                <div className="asc-quote-line">
                  <span>Estimated free cash flow</span>
                  <strong>{aff.freeCashFlow == null ? "Unknown" : inr(aff.freeCashFlow)}</strong>
                </div>
                <div className="asc-quote-line">
                  <span>Left each month after repayment</span>
                  <strong>{aff.remaining == null ? "Unknown" : inr(aff.remaining)}</strong>
                </div>
                {requested > a.baseLimit && (
                  <p className="asc-dark-warning">
                    <Icon name="info" size={14} />
                    Your {inr(requested)} purchase is more than this starting limit.
                  </p>
                )}
                {aff.status === "TIGHT" && (
                  <p className="asc-dark-warning" data-testid="affordability-warning">
                    <Icon name="alert" size={14} />
                    Repayments would be tight. A lender will review this before anything is offered.
                  </p>
                )}
                {aff.status === "UNKNOWN" && (
                  <p className="asc-dark-warning">
                    <Icon name="alert" size={14} />
                    Without AA data this is a provisional, fully secured start.
                  </p>
                )}
                {a.fastTrack.eligible && <Badge tone="green">ELIGIBLE FOR FAST-TRACK LENDER REVIEW</Badge>}
                <p className="asc-dark-caption">
                  Indicative terms: a 4% flat charge over the full {aff.installments.length}-month term (not an APR),
                  {` ${inr(aff.fee)}`} in total if the whole limit is used. Late-payment charges and their consequences are set
                  and disclosed by the lender before you accept. Final terms come only from the lender.
                </p>
              </>
            )}
            <button className="asc-button light wide" disabled={!canAnalyze} onClick={analyzeProfile}>
              Analyze My Credit Profile <Icon size={17} />
            </button>
            {!canAnalyze && <p className="asc-dark-caption">Needed first: {missingForCta.join(" and ") || "the bank check to finish"}.</p>}
            {canAnalyze && credit.aa.status !== "ANALYZED" && (
              <p className="asc-dark-caption">Without AA cash-flow data, your result will be provisional.</p>
            )}
          </section>
          {aff?.stress?.available && a.recommendedLevel && (
            <section className="asc-card asc-evidence-card">
              <div className="asc-card-title">
                <h3>Stress-tested repayments</h3>
                <Icon name="chart" size={19} />
              </div>
              <p className="asc-muted">Level {a.recommendedLevel} repayments over 3 cycles of your AA cash flow, with a ₹1,000 buffer.</p>
              <ul className="asc-stress">
                {aff.stress.scenarios.map((row) => (
                  <li key={row.id}>
                    <span className={row.pass ? "pass" : "fail"}>
                      <Icon name={row.pass ? "check" : "close"} size={12} />
                    </span>
                    <div>
                      <strong>{row.label}</strong>
                      <small>
                        Lowest balance {inr(row.lowestWithLoan)}
                        {row.preExistingPressure ? " · tight even without this credit" : ""}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="asc-button secondary wide" onClick={openInLab}>
                Explore in the Decision Lab <Icon size={16} />
              </button>
              <p className="asc-caption">A projection is never a guarantee that repayments will be made.</p>
            </section>
          )}
          <details className="asc-disclosure">
            <summary>
              How Ascend evaluates you <Icon name="info" size={16} />
            </summary>
            <p>
              Base limit = SDA balance × the level's limit share. Proposed LIEN = base limit × the level's collateral share. Ascend
              picks the highest level your evidence supports and whose full-use repayments stay within half of your estimated
              free cash flow under stress.
            </p>
            <p>
              The engine ({a.engine.id}) applies explainable rules first. A risk model trained on public credit-repayment data
              can then only lower the level and ask for lender review. It can never raise the level. It recommends; a regulated
              lender decides. Having no credit history, or missing data, is never treated as a default.
            </p>
            <p>
              {a.mlRisk?.available
                ? `Model estimate: ${Math.round(a.mlRisk.pd * 100)}% chance of a missed payment (${a.mlRisk.band.toLowerCase()} risk).`
                : a.mlRisk?.reason ?? "The trained model was not used for this assessment."}
            </p>
          </details>
        </aside>
      </div>
      <div className="asc-lab-bottom asc-report-bar">
        <p className="asc-caption">
          Download everything on this page as a JSON report: your application, Account Aggregator analysis, SDA
          verification, bureau report, assessment, risk-model estimate and payments. Identity numbers stay masked.
        </p>
        <button className="asc-button secondary" onClick={downloadReport}>
          <Icon name="download" size={17} />
          Download assessment report
        </button>
      </div>
      {checkoutOpen && txn?.transactionId && (
        <DemoCheckout transaction={txn} upiId={pay.upiId.trim()} bankId={pay.bankId} onOutcome={onCheckoutOutcome} />
      )}
    </>
  );
}
