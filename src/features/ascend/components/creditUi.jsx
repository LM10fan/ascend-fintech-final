import React from "react";
import { Badge, Icon } from "./ui.jsx";
import { money } from "../domain/cashflow.js";

export const inr = (value) => (value == null ? "—" : money(value));
export const percent = (ratio) => (ratio == null ? "—" : `${Math.round(ratio * 100)}%`);
export function dateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export function KeyValue({ label, value, tag, hint, testId, tone }) {
  return (
    <div className={`asc-kv ${tone ?? ""}`}>
      <span>
        {label}
        {tag && <em className={`asc-tag ${tag.toLowerCase()}`}>{tag}</em>}
        {hint && <small>{hint}</small>}
      </span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

export function Formula({ summary, children }) {
  return (
    <details className="asc-formula">
      <summary>
        <Icon name="info" size={13} />
        {summary}
      </summary>
      <p>{children}</p>
    </details>
  );
}

export function StageList({ stages, label }) {
  return (
    <ol className="asc-stages" aria-label={label}>
      {stages.map((stage) => (
        <li key={stage.label} className={stage.state}>
          <span aria-hidden="true">
            <Icon
              name={stage.state === "done" ? "check" : stage.state === "blocked" ? "close" : "clock"}
              size={13}
            />
          </span>
          <div>
            <strong>{stage.label}</strong>
            {stage.detail && <small>{stage.detail}</small>}
          </div>
          <em className="asc-sr-only">
            {stage.state === "done" ? "Complete" : stage.state === "active" ? "In progress" : stage.state === "blocked" ? "Not available" : "Not started"}
          </em>
        </li>
      ))}
    </ol>
  );
}

export function CoverageStrip({ monthly }) {
  return (
    <div className="asc-coverage" role="img" aria-label={`${monthly.filter((row) => row.hasData).length} of ${monthly.length} months contain transaction data`}>
      {monthly.map((row) => (
        <span key={row.month} className={row.hasData ? "has-data" : ""} title={`${monthLabel(row.month)} · ${row.transactions} transactions`} />
      ))}
    </div>
  );
}

/** Five-step ladder. Highlights the active facility and the recommendation; never implies approval. */
export function LevelLadder({ levels, recommended, facilityLevel }) {
  return (
    <ol className="asc-ladder" aria-label="Ascend credit ladder">
      {levels.map((row) => {
        const isRecommended = row.level === recommended;
        const isFacility = row.level === facilityLevel;
        return (
          <li
            key={row.level}
            className={`${isRecommended ? "recommended" : ""} ${recommended && row.level < recommended ? "below" : ""}`}
            aria-current={isRecommended ? "step" : undefined}
          >
            <div className="asc-ladder-top">
              <span>L{row.level}</span>
              {isRecommended && <Badge tone="green">RECOMMENDED</Badge>}
              {isFacility && !isRecommended && <Badge>ACTIVE</Badge>}
            </div>
            <strong>{row.name}</strong>
            <small>
              {row.limitPct}% of SDA
              {row.collateralPct > 0 && ` · ${row.collateralPct}% secured`}
            </small>
            {row.baseLimit != null && (
              <div className="asc-ladder-amounts">
                <span>
                  Limit <b>{inr(row.baseLimit)}</b>
                </span>
                {row.collateralPct > 0 && (
                  <span>
                    LIEN <b>{inr(row.proposedLien)}</b>
                  </span>
                )}
              </div>
            )}
            {isFacility && isRecommended && <small className="asc-ladder-note">Your active facility</small>}
          </li>
        );
      })}
    </ol>
  );
}

export function DemoNote({ children }) {
  return (
    <p className="asc-demo-note">
      <span>{children}</span>
    </p>
  );
}
