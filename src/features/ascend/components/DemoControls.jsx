import React, { useEffect, useState } from "react";
import { Badge, Field, Icon, NumberField } from "./ui.jsx";
import { PROFILES, switchProfile } from "../data/demoStore.js";
import { BUREAU_SCENARIOS, defaultDemoSettings, fixtureFor } from "../data/creditProfiles.js";
import {
  COVERAGE_OPTIONS,
  SCALE_OPTIONS,
  SDA_OUTCOMES,
  minimumBankBalance,
} from "../data/creditState.js";
import { amountError } from "../domain/creditLadder.js";

const NUMERIC = ["bankBalance", "existingEmi", "onTime", "late", "missed"];
const pickDraft = (demo) => Object.fromEntries(NUMERIC.map((key) => [key, demo[key]]));

export function DemoModeBar({ open, onToggle }) {
  return (
    <div className="asc-role-bar asc-demo-bar">
      <span>
        <Badge tone="green">LINKED ACCOUNTS</Badge>
      </span>
      <button className="asc-text-button" aria-expanded={open} onClick={onToggle}>
        <Icon name="layers" size={14} />
        {open ? "Hide applicant data" : "Applicant data"}
      </button>
    </div>
  );
}

export function DemoControls({ session, update, notify }) {
  const demo = session.credit.demo;
  const [draft, setDraft] = useState(() => pickDraft(demo));
  const [errors, setErrors] = useState({});
  useEffect(() => {
    setDraft((prev) =>
      Object.fromEntries(
        NUMERIC.map((key) => [key, prev[key] !== "" && Number(prev[key]) === demo[key] ? prev[key] : demo[key]]),
      ),
    );
  }, [demo]);
  const minBalance = minimumBankBalance(session.profileId);

  function applyDemo(nextDemo) {
    update((current) => {
      let sda = current.credit.sda;
      // The bank re-checks an edited balance at once, so a verification never describes a balance it didn't see.
      if (sda.status === "VERIFIED" && sda.balance !== nextDemo.bankBalance)
        sda = { ...sda, balance: nextDemo.bankBalance, checkedAt: new Date().toISOString(), reference: "ASC-SDA-RECHECK" };
      return { ...current, credit: { ...current.credit, demo: nextDemo, sda } };
    }, true);
  }
  const commit = (key, value) => applyDemo({ ...session.credit.demo, [key]: value });
  function editNumber(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    let error = "";
    if (key === "bankBalance") error = amountError(value, "SDA balance", { min: minBalance });
    else if (key === "existingEmi") error = amountError(value, "Existing EMI", { max: 100000 });
    else if (!/^\d{1,2}$/.test(String(value))) error = "Use a whole number from 0 to 60.";
    else if (Number(value) > 60) error = "Use a whole number from 0 to 60.";
    setErrors((prev) => ({ ...prev, [key]: error }));
    if (!error) commit(key, Number(value));
  }
  function changeProfile(id) {
    const name = PROFILES.find((item) => item.id === id)?.name;
    update((current) => switchProfile(current, id), true);
    notify(`Switched to ${name}. Consent, verification and payments start fresh for this applicant.`);
  }

  return (
    <section className="asc-card asc-demo-panel" aria-label="Applicant data">
      <div className="asc-card-title">
        <h3>Applicant data</h3>
      </div>
      <p className="asc-muted">
        Select an applicant and review their linked financial data. The assessment recalculates on both pages.
      </p>
      <div className="asc-fields three">
        <Field label="Applicant" id="demo-profile">
          <select id="demo-profile" value={session.profileId} onChange={(event) => changeProfile(event.target.value)}>
            {PROFILES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {fixtureFor(item.id).persona}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          id="demo-bankBalance"
          label="SDA balance at the bank"
          prefix="₹"
          step={0.01}
          max={10000000}
          value={draft.bankBalance}
          error={errors.bankBalance}
          onChange={(value) => editNumber("bankBalance", value)}
          hint={minBalance > 0 ? `At least ₹${minBalance.toLocaleString("en-IN")} is already restricted` : "Re-verified instantly if already verified"}
        />
        <NumberField
          id="demo-existingEmi"
          label="Existing monthly EMI"
          prefix="₹"
          step={0.01}
          value={draft.existingEmi}
          error={errors.existingEmi}
          onChange={(value) => editNumber("existingEmi", value)}
        />
        <Field label="Income level" id="demo-incomeScale">
          <select id="demo-incomeScale" value={demo.incomeScale} onChange={(event) => commit("incomeScale", Number(event.target.value))}>
            {SCALE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}% of profile income</option>
            ))}
          </select>
        </Field>
        <Field label="Expense level" id="demo-expenseScale">
          <select id="demo-expenseScale" value={demo.expenseScale} onChange={(event) => commit("expenseScale", Number(event.target.value))}>
            {SCALE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}% of profile spending</option>
            ))}
          </select>
        </Field>
        <Field label="AA data coverage" id="demo-coverage">
          <select id="demo-coverage" value={demo.coverageMonths} onChange={(event) => commit("coverageMonths", Number(event.target.value))}>
            {COVERAGE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value} of 12 months</option>
            ))}
          </select>
        </Field>
        <NumberField id="demo-onTime" label="On-time Ascend repayments" min={0} max={60} value={draft.onTime} error={errors.onTime} onChange={(value) => editNumber("onTime", value)} />
        <NumberField id="demo-late" label="Late repayments" min={0} max={60} value={draft.late} error={errors.late} onChange={(value) => editNumber("late", value)} />
        <NumberField id="demo-missed" label="Missed repayments" min={0} max={60} value={draft.missed} error={errors.missed} onChange={(value) => editNumber("missed", value)} />
        <Field label="Bureau response" id="demo-bureau">
          <select id="demo-bureau" value={demo.bureauScenario} onChange={(event) => commit("bureauScenario", event.target.value)}>
            {BUREAU_SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Next SDA check result" id="demo-sdaOutcome">
          <select id="demo-sdaOutcome" value={demo.sdaOutcome} onChange={(event) => commit("sdaOutcome", event.target.value)}>
            {SDA_OUTCOMES.map((value) => (
              <option key={value} value={value}>{{ SUCCESS: "Verified", PENDING: "Pending at bank", TIMEOUT: "Bank timeout", FAILURE: "Verification fails" }[value]}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="asc-demo-foot">
        <span className="asc-caption">The bureau response applies to your next fetch. Repayment counts come from verified Ascend installment records.</span>
        <button
          className="asc-text-button"
          onClick={() => {
            applyDemo(defaultDemoSettings(session.profileId));
            setErrors({});
            notify("Original values restored for this applicant.");
          }}
        >
          <Icon name="reset" size={14} />
          Restore original values
        </button>
      </div>
    </section>
  );
}
