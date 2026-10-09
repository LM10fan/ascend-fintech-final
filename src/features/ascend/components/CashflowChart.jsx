import React, { useId, useState } from "react";
import { POLICY, money } from "../domain/cashflow.js";
export function CashflowChart({ result, comparison = null }) {
  const id = useId().replaceAll(":", "");
  const [selected, setSelected] = useState(null);
  const width = 800,
    height = 305;
  const left = 65,
    right = 22,
    top = 22,
    bottom = 40;
  const values = [...result.points, ...(comparison?.points ?? [])].map(
    (point) => point.balance,
  );
  const min = Math.floor(Math.min(0, ...values) / 1000) * 1000;
  const max = Math.max(
    4000,
    Math.ceil(Math.max(POLICY.buffer, ...values) / 2000) * 2000,
  );
  const x = (day) => left + (day / result.horizon) * (width - left - right);
  const y = (balance) =>
    top + ((max - balance) / (max - min)) * (height - top - bottom);
  const line = (points) =>
    points.reduce(
      (path, point, index) =>
        index
          ? `${path} H${x(point.day)} V${y(point.balance)}`
          : `M${x(point.day)} ${y(point.balance)}`,
      "",
    );
  const path = line(result.points);
  const area = `${path} L${x(result.horizon)} ${y(min)} L${x(0)} ${y(min)} Z`;
  const ticks = Array.from(
    { length: 5 },
    (_, i) => min + ((max - min) / 4) * i,
  );
  const dayTicks =
    result.horizon === 30
      ? [0, 5, 10, 15, 20, 25, 30]
      : [0, 15, 30, 45, 60, 75, 90];
  const chosen = result.ledger[selected] ?? null;
  return (
    <div className="asc-chart">
      <div className="asc-chart-legend">
        <span>
          <i className="asc-line-key" />
          Projected balance
        </span>
        {comparison && (
          <span>
            <i className="asc-line-key compare" />
            Day 5 baseline
          </span>
        )}
        <span>
          <i className="asc-line-key buffer" />
          Protected buffer
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>
          Cash balance over {result.horizon} days
        </title>
        <desc id={`${id}-desc`}>
          Lowest balance {money(result.lowestBalance)} on day {result.lowestDay}
          . Protected buffer {money(POLICY.buffer)}. Same-day expenses precede
          income. Exact amounts are available in the event ledger.
        </desc>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#26786b" stopOpacity=".19" />
            <stop offset="1" stopColor="#26786b" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <rect
          x={left}
          y={y(POLICY.buffer)}
          width={width - left - right}
          height={y(min) - y(POLICY.buffer)}
          fill="#f4e5d8"
          opacity=".58"
        />
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
              stroke="#e3e8e4"
              strokeDasharray="3 5"
            />
            <text x={left - 12} y={y(value) + 4} textAnchor="end">
              {value === 0
                ? "₹0"
                : `${value < 0 ? "−" : ""}₹${Math.abs(value / 1000)
                    .toFixed(1)
                    .replace(".0", "")}k`}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${id}-fill)`} />
        <line
          x1={left}
          x2={width - right}
          y1={y(POLICY.buffer)}
          y2={y(POLICY.buffer)}
          stroke="#bd8846"
          strokeDasharray="6 5"
          strokeWidth="1.4"
        />
        {comparison && (
          <path
            d={line(comparison.points)}
            fill="none"
            stroke="#9faca6"
            strokeWidth="2"
            strokeDasharray="7 6"
          />
        )}
        <path
          className="asc-balance-line"
          d={path}
          fill="none"
          stroke="#226759"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle
          cx={x(result.lowestDay)}
          cy={y(result.lowestBalance)}
          r="5"
          fill={result.timingPass ? "#226759" : "#b85c3b"}
          stroke="white"
          strokeWidth="2.5"
        />
        {chosen && (
          <g>
            <line
              x1={x(chosen.day)}
              x2={x(chosen.day)}
              y1={top}
              y2={height - bottom}
              stroke="#91a79e"
              strokeDasharray="4 3"
            />
            <circle
              cx={x(chosen.day)}
              cy={y(chosen.balance)}
              r="6"
              fill="#163f35"
              stroke="white"
              strokeWidth="3"
            />
          </g>
        )}
        {dayTicks.map((day) => (
          <text key={day} x={x(day)} y={height - 13} textAnchor="middle">
            {day === 0 ? "Start" : `Day ${day}`}
          </text>
        ))}
      </svg>
      <div className="asc-chart-inspector">
        <span>
          {chosen ? (
            <>
              <strong>
                Day {chosen.day} · {chosen.label}
              </strong>{" "}
              {money(chosen.balance)} remaining
            </>
          ) : (
            <>Select an event to inspect its balance.</>
          )}
        </span>
        <select
          aria-label="Inspect a chart event"
          value={selected ?? ""}
          onChange={(event) =>
            setSelected(
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          <option value="">Inspect event</option>
          {result.ledger.map((row, index) => (
            <option value={index} key={row.id}>
              Day {row.day} · {row.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
