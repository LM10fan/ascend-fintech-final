import React from "react";
export function Icon({ name = "arrow", size = 20, ...props }) {
  const paths = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    chevron: <path d="m8 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    building: (
      <>
        <path d="m3 8 9-5 9 5M4 9h16M3 21h18M5 18V12m7 6V12m7 6V12" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18m-13 5h1m6 0h1" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 6v13a2 2 0 0 0 2 2h14V8" />
        <path d="M20 12h-5v5h5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M7 14l5-5 4 3 5-8" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    bin: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    laptop: (
      <>
        <rect x="5" y="3" width="14" height="13" rx="2" />
        <path d="m5 16-3 5h20l-3-5M9 18h6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5m0 3v1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}
export function Badge({ children, tone = "neutral", dot = false }) {
  return (
    <span className={`asc-badge asc-badge-${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Field({ label, id, error, hint, children }) {
  return (
    <div className="asc-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="asc-field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="asc-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  min = 0,
  max = 100000,
  step = 1,
  prefix,
  suffix,
  hint,
}) {
  return (
    <Field label={label} id={id} error={error} hint={hint}>
      <div className={`asc-input-wrap ${error ? "has-error" : ""}`}>
        {prefix && <span>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode={step === 1 ? "numeric" : "decimal"}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </Field>
  );
}
export function SectionHeading({ number, title, description }) {
  return (
    <div className="asc-section-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
export function EmptyConsentNote({ manual, onApply }) {
  return (
    <div className="asc-notice">
      <Icon name="info" />
      <p>
        {manual
          ? "Manual exploration. Consent is not active; this calculation uses only the values you choose in this demo."
          : "Reference scenario. Explore the synthetic fixture, or record consent on Apply to use your saved demo profile."}
      </p>
      <button className="asc-text-button" onClick={onApply}>
        Go to Apply <Icon size={15} />
      </button>
    </div>
  );
}
