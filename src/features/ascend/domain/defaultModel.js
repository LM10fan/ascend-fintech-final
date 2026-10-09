/**
 * Trained default-risk model: a regularised logistic regression fitted by
 * scripts/train-risk-model.mjs on a public dataset (see riskModelWeights.js for provenance).
 * Pure: no React, storage or network. The same feature transform is used for training and
 * scoring so the two cannot drift. The model only ever estimates risk; riskEngine.js decides
 * how (and whether) that estimate may lower a level cap.
 */
export const MODEL_FEATURES = Object.freeze({
  repayments: "Number of repayments observed",
  lateShare: "Share of repayments made late",
  missedShare: "Share of repayments missed",
  anyMissed: "At least one missed repayment",
  utilization: "Revolving credit utilisation",
});
export const VARIANTS = Object.freeze({
  history: ["repayments", "lateShare", "missedShare", "anyMissed"],
  history_utilization: ["repayments", "lateShare", "missedShare", "anyMissed", "utilization"],
});
/** Inputs outside the training range are clipped to it, never extrapolated. */
export const INPUT_RANGE = Object.freeze({ maxRepayments: 6, maxUtilization: 1.5 });
export const PD_BANDS = Object.freeze({ elevated: 0.3, high: 0.5 });

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);
const clip = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Maps repayment counts and utilisation to model inputs. Returns null when there is no
 * repayment history: a first-time applicant is never scored, so never penalised.
 */
export function modelFeatures({ onTime, late, missed }, utilization = null) {
  const [ok, lt, ms] = [count(onTime), count(late), count(missed)];
  if (ok == null || lt == null || ms == null) return null;
  const total = ok + lt + ms;
  if (!total) return null;
  const features = {
    repayments: Math.log1p(Math.min(total, INPUT_RANGE.maxRepayments)),
    lateShare: lt / total,
    missedShare: ms / total,
    anyMissed: ms > 0 ? 1 : 0,
  };
  if (Number.isFinite(utilization) && utilization >= 0)
    features.utilization = clip(utilization, 0, INPUT_RANGE.maxUtilization);
  return features;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-clip(z, -30, 30)));

/** Rejects malformed or tampered weights so a bad file degrades to rules-only, not to garbage. */
export function validateWeights(weights) {
  if (!weights || typeof weights !== "object" || !weights.variants) return false;
  return Object.entries(VARIANTS).every(([name, names]) => {
    const variant = weights.variants[name];
    return (
      variant &&
      Number.isFinite(variant.intercept) &&
      names.every(
        (feature) =>
          Number.isFinite(variant.coefficients?.[feature]) &&
          Number.isFinite(variant.means?.[feature]) &&
          variant.scales?.[feature] > 0,
      )
    );
  });
}

export function scoreFeatures(features, variant) {
  let z = variant.intercept;
  const contributions = [];
  for (const [feature, coefficient] of Object.entries(variant.coefficients)) {
    const effect = (coefficient * (features[feature] - variant.means[feature])) / variant.scales[feature];
    z += effect;
    contributions.push({ feature, label: MODEL_FEATURES[feature], effect: Math.round(effect * 1000) / 1000 });
  }
  contributions.sort((a, b) => b.effect - a.effect);
  return { pd: sigmoid(z), contributions };
}

/**
 * @param v feature vector from toFeatureVector()
 * @returns { available, pd, band, variant, contributions, reason }
 */
export function predictDefault(v, weights) {
  const unavailable = (reason) => ({ available: false, pd: null, band: null, variant: null, contributions: [], reason });
  if (!validateWeights(weights)) return unavailable("The trained model could not be loaded, so only rules were used.");
  const features = modelFeatures({ onTime: v.onTime, late: v.late, missed: v.missed }, v.bureauUtilization);
  if (!features)
    return unavailable("No Ascend repayment history yet, so the trained model is not used. This is not treated as negative.");
  const name = "utilization" in features ? "history_utilization" : "history";
  const { pd, contributions } = scoreFeatures(features, weights.variants[name]);
  return {
    available: true,
    pd: Math.round(pd * 1000) / 1000,
    band: pd >= PD_BANDS.high ? "HIGH" : pd >= PD_BANDS.elevated ? "ELEVATED" : "LOW",
    variant: name,
    contributions,
    reason: null,
  };
}
