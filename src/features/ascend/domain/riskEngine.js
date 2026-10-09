/**
 * Ascend credit-level recommendation. Explainable rules set the level cap; a logistic
 * default-risk model trained on public data (defaultModel.js) can only lower it, never raise it.
 * Output is an internal recommendation, never a lending decision.
 */
import { POLICY, money, projectCashflow } from "./cashflow.js";
import { predictDefault } from "./defaultModel.js";
import { RISK_MODEL_WEIGHTS } from "./riskModelWeights.js";
import {
  LEVELS,
  MIN_SDA_BALANCE,
  creditPosition,
  fullUseRepayment,
  levelTerms,
} from "./creditLadder.js";

export const ENGINE = Object.freeze({
  id: "ascend-hybrid-v1",
  kind: "RULES_WITH_ML_GUARDRAIL",
  trainedModel: true,
  mlModelId: RISK_MODEL_WEIGHTS.id,
});
export const SDA_STALE_HOURS = 24;
export const BUREAU_STALE_DAYS = 30;
export const AFFORDABILITY = Object.freeze({ pass: 0.5, tight: 0.8 });

/** Non-negative whole counts only; anything else (NaN, negative, strings from storage) is missing. */
const toCount = (value) => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

/** Missing inputs stay null so the model treats them as missing, not as zero. */
export function toFeatureVector(aa, sda, history, bureau) {
  const retrieved = bureau?.status === "RETRIEVED";
  const counts = history ? [toCount(history.onTime), toCount(history.late), toCount(history.missed)] : [];
  const validHistory = counts.length === 3 && counts.every((value) => value != null);
  return {
    coverageMonths: aa ? aa.coverageMonths : null,
    confidence: aa ? aa.confidence : "INSUFFICIENT",
    incomeCV: aa?.estimated.incomeCV ?? null,
    freeCashFlow: aa?.estimated.freeCashFlow ?? null,
    debtServiceRatio: aa?.estimated.debtServiceRatio ?? null,
    essentialRatio: aa?.estimated.essentialRatio ?? null,
    bounces: aa ? aa.observed.bounces : null,
    lowBalanceMonths: aa?.observed.lowBalanceMonths ?? null,
    integrityFlags: aa ? aa.flags.filter((f) => f.severity === "high").map((f) => f.code) : [],
    sdaBalance: sda?.status === "VERIFIED" ? sda.balance : null,
    onTime: validHistory ? counts[0] : null,
    late: validHistory ? counts[1] : null,
    missed: validHistory ? counts[2] : null,
    bureauStatus: bureau?.status ?? null,
    bureauAdverse: retrieved ? !!bureau.adverse : null,
    bureauHistoryMonths: retrieved ? (bureau.historyMonths ?? null) : null,
    bureauUtilization: retrieved && Number.isFinite(bureau.utilization) ? bureau.utilization : null,
  };
}

/** Default risk model: maps features to the highest level the evidence can support. */
export const rulesModel = Object.freeze({
  id: "ascend-rules-v1",
  riskCap(v) {
    const caps = [];
    const cap = (level, reason) => caps.push({ level, reason });
    if (v.confidence === "INSUFFICIENT" || v.confidence === "LOW")
      cap(1, "There isn't enough transaction history yet to support more than a fully secured start.");
    else if (v.confidence === "MEDIUM")
      cap(2, "6–9 months of data support secured levels. Higher levels need 10+ months with balance history.");
    if (v.incomeCV != null && v.incomeCV > 0.6)
      cap(1, "Income varies a lot from month to month, so Ascend starts fully secured.");
    else if (v.incomeCV != null && v.incomeCV > 0.35)
      cap(2, "Income varies moderately from month to month. Unsecured levels need steadier income.");
    if (v.integrityFlags.length)
      cap(2, "Some transactions need verification before any unsecured exposure.");
    if (v.bounces != null && v.bounces >= 2)
      cap(1, "Recent payment returns suggest repayments could be missed.");
    let historyCap;
    let historyReason;
    if (v.missed > 0 || v.late > 2) {
      historyCap = 2;
      historyReason = "Missed or repeated late Ascend repayments keep the line fully secured for now.";
    } else if (v.onTime == null || v.onTime < 3) {
      historyCap = 2;
      historyReason =
        "No verified Ascend repayment history yet. Levels 3+ need at least 3 on-time repayments. A first application is not treated as negative.";
    } else if (v.onTime < 6 || v.late > 1) {
      historyCap = 3;
      historyReason = "3+ on-time repayments support Level 3. Level 4 needs 6+ with at most one late payment.";
    } else if (v.onTime < 12) {
      historyCap = 4;
      historyReason = "6+ on-time repayments support Level 4. Level 5 needs 12+ and a separate lender assessment.";
    } else {
      historyCap = 5;
      historyReason = "12+ on-time repayments meet the history requirement for Level 5.";
    }
    if (v.bureauAdverse === true) {
      historyCap = Math.min(historyCap, 2);
      historyReason = "The bureau report shows adverse repayment history, so unsecured levels need lender review first.";
    } else if (
      v.bureauAdverse === false &&
      (v.bureauHistoryMonths ?? 0) >= 24 &&
      v.confidence === "HIGH" &&
      historyCap < 4
    ) {
      historyCap += 1;
      historyReason += " A clean bureau history of 24+ months counts as one step of external repayment evidence.";
    }
    cap(historyCap, historyReason);
    const level = Math.min(5, ...caps.map((item) => item.level));
    return {
      cap: level,
      binding: caps.filter((item) => item.level === level),
      caps,
      manualReview: v.integrityFlags.length > 0 || v.bureauAdverse === true,
    };
  },
});

/** Highest level allowed per model risk band. Prototype policy, not lender policy. */
export const ML_BAND_CAPS = Object.freeze({ LOW: 5, ELEVATED: 3, HIGH: 2 });

/**
 * Rules first, then the trained model as a one-way guardrail: it can tighten the cap and
 * trigger review but never unlock a level the rules would not. Any model failure falls back
 * to rules-only.
 */
export function createHybridModel(weights = RISK_MODEL_WEIGHTS, rules = rulesModel) {
  return Object.freeze({
    id: `ascend-hybrid-v1+${weights?.id ?? "no-model"}`,
    riskCap(v) {
      const base = rules.riskCap(v);
      let ml;
      try {
        ml = predictDefault(v, weights);
      } catch {
        ml = { available: false, pd: null, band: null, reason: "The trained model failed, so only rules were used." };
      }
      if (!ml.available) return { ...base, ml };
      const pct = Math.round(ml.pd * 100);
      const mlCap = ML_BAND_CAPS[ml.band];
      const caps =
        mlCap < 5
          ? [
              ...base.caps,
              {
                level: mlCap,
                source: "model",
                reason: `A model trained on public credit-repayment records estimates a ${pct}% chance of a missed payment for this repayment pattern, so Ascend holds at Level ${mlCap} or below until a lender reviews it.`,
              },
            ]
          : base.caps;
      const cap = Math.min(base.cap, mlCap);
      return {
        cap,
        binding: caps.filter((item) => item.level === cap),
        caps,
        manualReview: base.manualReview || ml.band !== "LOW",
        ml,
      };
    },
  });
}

export const hybridModel = createHybridModel();

const SCENARIOS = [
  { id: "normal", label: "Normal month" },
  { id: "delayed", label: "Income arrives 10 days late", incomeDelay: 10 },
  { id: "shock", label: "Unexpected essential bill (+30% of a month)", shockShare: 0.3 },
  { id: "spend", label: "Discretionary spending up 25%", discretionaryFactor: 1.25 },
  { id: "balance", label: "Starting balance 50% lower", openingFactor: 0.5 },
];

function projectionEvents(aa, installments, scenario, withLoan) {
  const o = aa.observed;
  const incomeDay = aa.estimated.incomeDay ?? 1;
  const income = o.medianIncome ?? 0;
  const essential = o.medianEssential ?? 0;
  const half = Math.round(essential * 50) / 100;
  const discretionary = Math.round((o.medianDiscretionary ?? 0) * (scenario.discretionaryFactor ?? 1) * 100) / 100;
  const third = Math.round((discretionary / 3) * 100) / 100;
  const events = [];
  for (let month = 0; month < installments.length; month++) {
    const offset = month * POLICY.cycleDays;
    const add = (day, label, amount) => amount && events.push({ day: offset + day, label, amount });
    add(Math.min(30, incomeDay + (scenario.incomeDelay ?? 0)), "Income", income);
    add(2, "Essentials (first half)", -half);
    add(16, "Essentials (second half)", -(essential - half));
    add(7, "Subscriptions", -(o.medianSubscriptions ?? 0));
    add(8, "Existing repayments", -(o.existingObligations ?? 0));
    add(10, "Discretionary", -third);
    add(20, "Discretionary", -third);
    add(26, "Discretionary", -(discretionary - third * 2));
    if (withLoan) add(Math.min(28, incomeDay + 5), "Proposed repayment", -installments[month]);
    if (month === 0 && scenario.shockShare)
      add(4, "Unexpected essential bill", -Math.round(essential * scenario.shockShare));
  }
  return events;
}

/** Stress-tests a repayment schedule against AA-derived cash flow. A pass is never a repayment guarantee. */
export function stressTest(aa, installments) {
  const opening = aa?.observed.endOfMonthLiquidity;
  if (!aa || opening == null || aa.observed.medianIncome == null)
    return { available: false, scenarios: [], fails: 0, normalPass: null };
  const scenarios = SCENARIOS.map((scenario) => {
    const start = Math.round(opening * (scenario.openingFactor ?? 1) * 100) / 100;
    const withLoan = projectCashflow({
      openingBalance: start,
      events: projectionEvents(aa, installments, scenario, true),
    });
    const without = projectCashflow({
      openingBalance: start,
      events: projectionEvents(aa, installments, scenario, false),
    });
    const preExistingPressure = without.breachesBuffer;
    const pass = !withLoan.breachesBuffer || (preExistingPressure && !withLoan.shortfall);
    return {
      id: scenario.id,
      label: scenario.label,
      pass,
      preExistingPressure,
      lowestWithLoan: withLoan.lowestBalance,
      lowestWithoutLoan: without.lowestBalance,
    };
  });
  return {
    available: true,
    scenarios,
    normalPass: scenarios[0].pass,
    fails: scenarios.slice(1).filter((item) => !item.pass).length,
  };
}

export function affordabilityFor(aa, sdaBalance, level) {
  const terms = levelTerms(sdaBalance, level);
  const repayment = fullUseRepayment(terms.baseLimit);
  const fcf = aa?.estimated.freeCashFlow ?? null;
  const base = {
    level,
    baseLimit: terms.baseLimit,
    repayment: repayment.maxInstallment,
    installments: repayment.installments,
    fee: repayment.fee,
    totalRepayable: repayment.total,
    existingObligations: aa?.observed.existingObligations ?? null,
    freeCashFlow: fcf,
  };
  if (fcf == null)
    return { ...base, status: "UNKNOWN", ratio: null, remaining: null, stress: stressTest(null, []) };
  const stress = stressTest(aa, repayment.installments);
  const ratio = fcf > 0 ? repayment.maxInstallment / fcf : null;
  const status =
    fcf <= 0 || ratio > AFFORDABILITY.tight || stress.normalPass === false
      ? "FAIL"
      : ratio > AFFORDABILITY.pass || stress.fails >= 2
        ? "TIGHT"
        : "PASS";
  return {
    ...base,
    status,
    ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
    remaining: Math.round((fcf - repayment.maxInstallment) * 100) / 100,
    stress,
  };
}

const pct = (value) => `${Math.round(value * 100)}%`;

function requirementsFor(level, v, aff) {
  const reqs = [];
  const add = (label, met) => reqs.push({ label, met });
  if (level >= 2) add("6+ months of AA transaction data", v.coverageMonths != null && v.coverageMonths >= 6);
  if (level >= 2) add("Month-to-month income variation of 35% or less", v.incomeCV != null && v.incomeCV <= 0.35);
  if (level >= 3) add("10+ months of data with balance history", v.confidence === "HIGH");
  if (level >= 3) add("No unverified or unusual transactions", v.integrityFlags.length === 0);
  const needed = { 3: 3, 4: 6, 5: 12 }[level];
  if (needed)
    add(
      `${needed}+ on-time Ascend repayments, none missed${level >= 4 ? ", at most one late" : ""}`,
      (v.onTime ?? 0) >= needed && !v.missed && (level >= 4 ? (v.late ?? 0) <= 1 : (v.late ?? 0) <= 2),
    );
  add(`Repayments at Level ${level} fit within 50% of free cash flow`, aff ? aff.status === "PASS" : null);
  if (level >= 3) add("Lender review of the unsecured portion", null);
  if (level === 5) add("Independent lender affordability and eligibility assessment", null);
  return reqs;
}

/**
 * @param aaFeatures output of extractFeatures(), or null when AA data is unavailable
 * @param sdaData { status, balance, otherRestrictions, confirmedLien, checkedAt }
 * @param repaymentHistory { onTime, late, missed } of verified Ascend installments, or null
 * @param existingCreditData normalized bureau report, or null
 */
export function assessCreditProfile(aaFeatures, sdaData, repaymentHistory, existingCreditData, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const model = options.model ?? hybridModel;
  const facility = options.facility ?? null;
  const bureau = existingCreditData?.status === "RETRIEVED" ? existingCreditData : null;
  const vector = toFeatureVector(aaFeatures, sdaData, repaymentHistory, existingCreditData);
  const missing = [];
  const reasons = [];
  const riskFlags = [...(aaFeatures?.flags ?? [])];

  const sdaVerified =
    sdaData?.status === "VERIFIED" && Number.isFinite(sdaData.balance) && sdaData.balance >= 0;
  const ageHours = sdaVerified ? (Date.parse(now) - Date.parse(sdaData.checkedAt)) / 3600000 : null;
  const sdaStale = sdaVerified && !(ageHours <= SDA_STALE_HOURS);
  const balance = sdaVerified ? sdaData.balance : null;
  const tooLow = sdaVerified && balance < MIN_SDA_BALANCE;
  if (!sdaVerified) missing.push("A verified SDA balance");
  if (sdaStale) {
    missing.push("A fresh SDA balance check (the last one is more than 24 hours old)");
    riskFlags.push({ code: "SDA_STALE", severity: "watch", message: "SDA verification is out of date." });
  }
  if (tooLow) {
    missing.push(`An SDA balance of at least ${money(MIN_SDA_BALANCE)}`);
    riskFlags.push({ code: "INSUFFICIENT_BALANCE", severity: "watch", message: "SDA balance is below the ladder minimum." });
  }
  const confidence = vector.confidence;
  if (!aaFeatures) missing.push("A 12-month Account Aggregator cash-flow analysis");
  else if (confidence === "INSUFFICIENT" || confidence === "LOW")
    missing.push(
      `More transaction history (${aaFeatures.coverageMonths} of ${aaFeatures.period.months} months found. 6+ are needed for a fuller assessment.)`,
    );
  if (bureau) {
    const days = (Date.parse(now) - Date.parse(bureau.retrievedAt)) / 86400000;
    if (!(days <= BUREAU_STALE_DAYS))
      riskFlags.push({ code: "BUREAU_STALE", severity: "info", message: "The bureau report is more than 30 days old." });
    if (bureau.adverse)
      riskFlags.push({ code: "BUREAU_ADVERSE", severity: "high", message: "The bureau report shows overdue or written-off accounts." });
  }

  const risk = model.riskCap(vector);
  if (risk.ml?.available && risk.ml.band !== "LOW")
    riskFlags.push({
      code: "MODEL_ELEVATED_RISK",
      severity: risk.ml.band === "HIGH" ? "high" : "watch",
      message: `The trained risk model estimates a ${Math.round(risk.ml.pd * 100)}% chance of a missed payment.`,
    });
  const levels = sdaVerified
    ? LEVELS.map((spec) => {
        const aff = affordabilityFor(aaFeatures, balance, spec.level);
        const position = creditPosition({
          sdaBalance: balance,
          otherRestrictions: sdaData.otherRestrictions ?? 0,
          confirmedLien: sdaData.confirmedLien ?? 0,
          level: spec.level,
        });
        return {
          ...levelTerms(balance, spec.level),
          affordability: aff,
          withinRiskCap: spec.level <= risk.cap,
          collateralFits: position.collateralShortfall === 0,
        };
      })
    : [];

  let recommended = null;
  if (sdaVerified && !tooLow) {
    for (let level = risk.cap; level >= 1; level--) {
      const row = levels[level - 1];
      if (!row.collateralFits) continue;
      const status = row.affordability.status;
      if (status === "PASS" || (level === 1 && (status === "TIGHT" || status === "UNKNOWN"))) {
        recommended = level;
        break;
      }
    }
  }
  const chosenAff = recommended
    ? levels[recommended - 1].affordability
    : sdaVerified
      ? levels[0].affordability
      : null;

  if (sdaVerified)
    reasons.push(
      `Your verified SDA balance of ${money(balance)} sets the ladder. Each level's limit is a fixed share of it.`,
    );
  if (aaFeatures)
    reasons.push(
      `${aaFeatures.coverageMonths} of ${aaFeatures.period.months} months of transactions analysed (${confidence.toLowerCase()} confidence).`,
    );
  for (const item of risk.binding) reasons.push(item.reason);
  if (recommended && recommended < risk.cap) {
    const higher = levels[risk.cap - 1].affordability;
    reasons.push(
      higher.status === "FAIL" || higher.ratio == null
        ? `Level ${risk.cap} repayments would not fit your cash flow, so Ascend steps down to Level ${recommended}.`
        : `Level ${risk.cap} repayments would use ${pct(higher.ratio)} of your estimated free cash flow, so Ascend steps down to Level ${recommended}.`,
    );
  }
  if (chosenAff && chosenAff.status !== "UNKNOWN" && chosenAff.ratio != null)
    reasons.push(
      `Using the full ${money(chosenAff.baseLimit)} limit means installments of up to ${money(chosenAff.repayment)}, or ${pct(chosenAff.ratio)} of your estimated monthly free cash flow of ${money(chosenAff.freeCashFlow)}.`,
    );
  if (chosenAff?.status === "UNKNOWN")
    reasons.push("Affordability can't be estimated without cash-flow data, so only a provisional, fully secured start is possible.");
  if (sdaVerified && !tooLow && recommended == null)
    reasons.push("Even the smallest level's repayments don't fit your current cash flow. Ascend recommends pausing.");
  if (existingCreditData?.status === "NO_HISTORY")
    reasons.push("No bureau history was found. A missing score is not treated as negative.");

  const status = !sdaVerified || tooLow
    ? "INCOMPLETE"
    : recommended == null
      ? "PAUSE"
      : sdaStale
        ? "INCOMPLETE"
        : confidence === "INSUFFICIENT" || confidence === "LOW"
          ? "PROVISIONAL"
          : "READY_FOR_LENDER_REVIEW";
  const chosenRow = recommended ? levels[recommended - 1] : null;
  const position = sdaVerified
    ? creditPosition({
        sdaBalance: balance,
        otherRestrictions: sdaData.otherRestrictions ?? 0,
        confirmedLien: sdaData.confirmedLien ?? 0,
        level: recommended,
        facility,
      })
    : null;
  const manualReviewRequired =
    !!recommended &&
    (recommended >= 3 ||
      risk.manualReview ||
      chosenAff?.status === "TIGHT" ||
      status === "PROVISIONAL" ||
      riskFlags.some((flag) => flag.severity === "high"));

  const fastTrackChecks = [
    ["Assessment ready for lender review", status === "READY_FOR_LENDER_REVIEW"],
    ["High-confidence data (10+ months with balances)", confidence === "HIGH"],
    ["Regular salary credits", aaFeatures?.estimated.primaryIncome === "salary" && aaFeatures?.estimated.incomeRegularity === "REGULAR"],
    ["Income variation of 15% or less", vector.incomeCV != null && vector.incomeCV <= 0.15],
    ["Affordable in every stress scenario", chosenAff?.status === "PASS" && chosenAff.stress.available && chosenAff.stress.fails === 0],
    ["No risk flags", riskFlags.filter((f) => f.severity !== "info").length === 0],
  ];
  const nextLevel = recommended && recommended < 5 ? recommended + 1 : null;
  const currentReqs = recommended ? requirementsFor(recommended, vector, chosenAff) : [];

  return {
    engine: { ...ENGINE, modelId: model.id },
    assessedAt: now,
    status,
    eligibleToProceed: status === "READY_FOR_LENDER_REVIEW" || status === "PROVISIONAL",
    recommendedLevel: recommended,
    levelName: chosenRow?.name ?? null,
    baseLimit: chosenRow?.baseLimit ?? null,
    proposedLien: chosenRow?.proposedLien ?? null,
    verifiedCollateral: sdaVerified ? (sdaData.confirmedLien ?? 0) : 0,
    unsecuredExposure: chosenRow?.unsecured ?? null,
    affordability: chosenAff,
    confidence,
    riskCap: risk.cap,
    mlRisk: risk.ml ?? null,
    riskFlags,
    reasons,
    missing,
    manualReviewRequired,
    position,
    levels,
    fastTrack: {
      eligible: fastTrackChecks.every(([, met]) => met),
      checks: fastTrackChecks.map(([label, met]) => ({ label, met: !!met })),
    },
    progression: {
      completed: currentReqs.filter((req) => req.met === true).map((req) => req.label),
      nextLevel,
      requirements: nextLevel ? requirementsFor(nextLevel, vector, levels[nextLevel - 1]?.affordability) : [],
    },
    featureVector: vector,
  };
}
