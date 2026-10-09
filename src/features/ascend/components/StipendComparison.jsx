import React from "react";
import { Badge } from "./ui.jsx";
import { compareStipendTiming, money } from "../domain/cashflow.js";

export function StipendComparison({ scenario, months, invalid = false }) {
  const results = compareStipendTiming(scenario, { months });
  return (
    <section
      className="asc-card asc-comparison"
      aria-label="Day 5 versus Day 20 stipend comparison"
    >
      <div className="asc-eyebrow">SAME MONEY. DIFFERENT DAY.</div>
      <h2>Day 5 versus Day 20</h2>
      <p className="asc-muted">
        {invalid ? "Last valid inputs · " : ""}
        {months * 30}-day comparison · EMI day {scenario.emiDay}. Only the
        stipend arrival date changes.{" "}
        {scenario.shock > 0
          ? `${money(scenario.shock)} shock on day ${scenario.shockDay}, once in each scenario.`
          : "Expense shock off in both scenarios."}
      </p>
      <div className="asc-comparison-grid">
        {Object.entries(results).map(([key, result]) => (
          <article
            key={key}
            className={`asc-comparison-panel ${result.timingPass ? "" : "risk"}`}
            data-testid={`comparison-${key}`}
          >
            <div className="asc-card-title">
              <h3>Stipend on Day {result.scenario.stipendDay}</h3>
              <Badge tone={result.status === "REVIEWABLE" ? "green" : "amber"}>
                {result.status}
              </Badge>
            </div>
            <dl>
              <div>
                <dt>Recurring monthly margin</dt>
                <dd data-testid={`${key}-margin`}>
                  {money(result.recurringMargin)}
                </dd>
              </div>
              <div>
                <dt>Monthly affordability</dt>
                <dd>{result.structuralPass ? "Pass" : "Fail"}</dd>
              </div>
              <div>
                <dt>Lowest dated balance</dt>
                <dd data-testid={`${key}-lowest`}>
                  {money(result.lowestBalance)}{" "}
                  <small>· Day {result.lowestDay}</small>
                </dd>
              </div>
              <div>
                <dt>Protected buffer</dt>
                <dd>{result.timingPass ? "Preserved" : "Breached"}</dd>
              </div>
              <div>
                <dt>First buffer breach</dt>
                <dd>
                  {result.firstBreach
                    ? result.firstBreach.day === 0
                      ? "Before day 1"
                      : `Day ${result.firstBreach.day}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Closing balance</dt>
                <dd data-testid={`${key}-closing`}>
                  {money(result.closingBalance)}
                </dd>
              </div>
            </dl>
            <code>{result.reason}</code>
          </article>
        ))}
      </div>
      <p className="asc-caption">
        A positive monthly margin does not guarantee enough cash on the EMI
        date. Opening cash and one-off shocks affect liquidity, not recurring
        affordability. The advisory at right always evaluates the full
        three-cycle term.
      </p>
    </section>
  );
}
