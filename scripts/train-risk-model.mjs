/**
 * Trains Ascend's default-risk model from a public dataset fetched via the OpenML REST API
 * (no key needed) and writes src/features/ascend/domain/riskModelWeights.js.
 *
 *   npm run train:model              download (or reuse the cache) and train
 *   npm run train:model -- --offline train from the cached download only
 *
 * Dataset: UCI "Default of Credit Card Clients" (Yeh & Lien, 2009), OpenML id 42477, CC0.
 * Only repayment-status and utilisation columns are used. Sex, education, marital status
 * and age are deliberately excluded.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS, modelFeatures, scoreFeatures } from "../src/features/ascend/domain/defaultModel.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_ID = 42477;
const META_URL = `https://www.openml.org/api/v1/json/data/${DATASET_ID}`;
const CACHE = join(ROOT, "scripts", ".cache", `openml-${DATASET_ID}.arff`);
const OUT = join(ROOT, "src", "features", "ascend", "domain", "riskModelWeights.js");
const SEED = 20261009;
const LAMBDAS = [0.01, 0.1, 1, 10, 100];
const FOLDS = 5;
const BOOTSTRAPS = 30;
const CHECKS = { minAuc: 0.65, maxCvGap: 0.03, maxEce: 0.03 };
/** Features whose effect on risk must be non-negative, in every bootstrap refit. */
const MONOTONE_UP = ["lateShare", "missedShare", "anyMissed", "utilization"];

async function fetchWithRetry(url, { attempts = 3, timeoutMs = 60000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`  ${error.message}; retrying (${attempt}/${attempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

async function loadDataset(offline) {
  if (!offline) {
    console.log(`Fetching metadata from ${META_URL}`);
    const meta = (await (await fetchWithRetry(META_URL)).json()).data_set_description;
    if (meta.name !== "default-of-credit-card-clients" || meta.default_target_attribute !== "y")
      throw new Error(`Unexpected dataset metadata: ${meta.name} / ${meta.default_target_attribute}`);
    const fileUrl = `https://api.openml.org/data/v1/download/${meta.file_id}`;
    console.log(`Downloading ${fileUrl} (licence ${meta.licence})`);
    const text = await (await fetchWithRetry(fileUrl)).text();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, text);
    return { text, licence: meta.licence, version: meta.version, url: fileUrl };
  }
  console.log(`Offline: reading ${CACHE}`);
  return { text: await readFile(CACHE, "utf8"), licence: "CC0", version: null, url: "cache" };
}

/** ARFF columns: id, x1 limit, x2-x5 demographics (unused), x6-x11 PAY_0..PAY_6, x12-x17 bills, x18-x23 payments, y. */
function parseRows(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^@data/i.test(line.trim())) + 1;
  if (!start) throw new Error("No @DATA section in the download.");
  const rows = [];
  let rejected = 0;
  for (const line of lines.slice(start)) {
    if (!line.trim() || line.startsWith("%")) continue;
    const cells = line.split(",").map(Number);
    const ok = cells.length === 25 && cells.every(Number.isFinite) && (cells[24] === 0 || cells[24] === 1);
    if (ok && cells[1] > 0) rows.push(cells);
    else rejected++;
  }
  return { rows, rejected };
}

/** Maps a dataset row onto the same inputs Ascend has: repayment outcomes and utilisation. */
function toExample(cells) {
  const statuses = cells.slice(6, 12).filter((status) => status !== -2); // -2 = no balance due that month
  const history = {
    onTime: statuses.filter((status) => status <= 0).length,
    late: statuses.filter((status) => status === 1).length,
    missed: statuses.filter((status) => status >= 2).length,
  };
  const features = modelFeatures(history, Math.max(0, cells[12]) / cells[1]);
  return features && { features, y: cells[24] };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
/** Stratified k-way split so every fold keeps the dataset's default rate. */
function stratifiedFolds(examples, k, random) {
  const folds = Array.from({ length: k }, () => []);
  for (const label of [0, 1])
    shuffle(examples.filter((example) => example.y === label), random).forEach((example, index) =>
      folds[index % k].push(example),
    );
  return folds;
}

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    const pivot = a.reduce((best, row, i) => (i >= col && Math.abs(row[col]) > Math.abs(a[best][col]) ? i : best), col);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    if (Math.abs(a[col][col]) < 1e-12) throw new Error("Singular system while fitting.");
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let c = col; c <= n; c++) a[row][c] -= factor * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** L2-regularised logistic regression on standardised inputs, fitted by Newton/IRLS. */
function fit(examples, names, lambda) {
  const means = {};
  const scales = {};
  for (const name of names) {
    const values = examples.map((example) => example.features[name]);
    means[name] = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - means[name]) ** 2, 0) / values.length);
    scales[name] = sd > 1e-9 ? sd : 1;
  }
  const X = examples.map((example) => [1, ...names.map((name) => (example.features[name] - means[name]) / scales[name])]);
  const p = names.length + 1;
  let beta = new Array(p).fill(0);
  for (let iteration = 0; iteration < 50; iteration++) {
    const gradient = new Array(p).fill(0);
    const hessian = Array.from({ length: p }, () => new Array(p).fill(0));
    X.forEach((row, index) => {
      const mu = 1 / (1 + Math.exp(-row.reduce((sum, x, j) => sum + x * beta[j], 0)));
      const w = Math.max(mu * (1 - mu), 1e-9);
      for (let i = 0; i < p; i++) {
        gradient[i] += (examples[index].y - mu) * row[i];
        for (let j = 0; j < p; j++) hessian[i][j] += w * row[i] * row[j];
      }
    });
    for (let i = 1; i < p; i++) {
      gradient[i] -= lambda * beta[i];
      hessian[i][i] += lambda;
    }
    const step = solve(hessian, gradient);
    beta = beta.map((value, i) => value + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return {
    intercept: beta[0],
    coefficients: Object.fromEntries(names.map((name, i) => [name, beta[i + 1]])),
    means,
    scales,
  };
}

function auc(scored) {
  const sorted = [...scored].sort((a, b) => a.pd - b.pd);
  let rankSum = 0;
  let positives = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].pd === sorted[i].pd) j++;
    const rank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (sorted[k].y) (rankSum += rank), positives++;
    i = j;
  }
  const negatives = sorted.length - positives;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}
function evaluate(model, examples) {
  const scored = examples.map((example) => ({ y: example.y, pd: scoreFeatures(example.features, model).pd }));
  const logLoss = -scored.reduce((sum, { y, pd }) => sum + Math.log(y ? Math.max(pd, 1e-12) : Math.max(1 - pd, 1e-12)), 0) / scored.length;
  const brier = scored.reduce((sum, { y, pd }) => sum + (pd - y) ** 2, 0) / scored.length;
  // Fixed-width probability bins: inputs are discrete, so equal-count bins would split tied scores arbitrarily.
  const bins = Array.from({ length: 10 }, () => ({ predicted: 0, observed: 0 }));
  for (const { y, pd } of scored) {
    const bin = bins[Math.min(9, Math.floor(pd * 10))];
    bin.predicted += pd;
    bin.observed += y;
  }
  const ece = bins.reduce((sum, bin) => sum + Math.abs(bin.predicted - bin.observed), 0) / scored.length;
  return { auc: auc(scored), logLoss, brier, ece, scored };
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function roundModel(model) {
  const map = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, round(value)]));
  return { intercept: round(model.intercept), coefficients: map(model.coefficients), means: map(model.means), scales: map(model.scales) };
}

function trainVariant(name, train, test, random) {
  const names = VARIANTS[name];
  const folds = stratifiedFolds(train, FOLDS, random);
  const cv = LAMBDAS.map((lambda) => {
    const results = folds.map((fold, k) => evaluate(fit(folds.filter((_, i) => i !== k).flat(), names, lambda), fold));
    const mean = (key) => results.reduce((sum, result) => sum + result[key], 0) / results.length;
    return { lambda, logLoss: mean("logLoss"), auc: mean("auc") };
  });
  const best = cv.reduce((a, b) => (b.logLoss < a.logLoss ? b : a));
  const model = fit(train, names, best.lambda);
  const holdout = evaluate(model, test);

  const signs = Object.fromEntries(names.map((feature) => [feature, []]));
  for (let b = 0; b < BOOTSTRAPS; b++) {
    const sample = Array.from({ length: train.length }, () => train[Math.floor(random() * train.length)]);
    const refit = fit(sample, names, best.lambda);
    for (const feature of names) signs[feature].push(refit.coefficients[feature]);
  }
  const stability = Object.fromEntries(
    names.map((feature) => {
      const sorted = signs[feature].sort((a, b) => a - b);
      return [feature, [round(sorted[Math.floor(BOOTSTRAPS * 0.025)], 4), round(sorted[Math.ceil(BOOTSTRAPS * 0.975) - 1], 4)]];
    }),
  );

  const failures = [];
  if (holdout.auc < CHECKS.minAuc) failures.push(`holdout AUC ${holdout.auc.toFixed(3)} < ${CHECKS.minAuc}`);
  if (Math.abs(best.auc - holdout.auc) > CHECKS.maxCvGap) failures.push(`CV/holdout AUC gap ${Math.abs(best.auc - holdout.auc).toFixed(3)}`);
  if (holdout.ece > CHECKS.maxEce) failures.push(`calibration error ${holdout.ece.toFixed(3)} > ${CHECKS.maxEce}`);
  for (const feature of names.filter((f) => MONOTONE_UP.includes(f)))
    if (stability[feature][0] < 0) failures.push(`${feature} risk direction is unstable across bootstraps`);

  const band = (low, high) => {
    const rows = holdout.scored.filter(({ pd }) => pd >= low && pd < high);
    return { share: round(rows.length / holdout.scored.length, 3), defaultRate: rows.length ? round(rows.reduce((s, r) => s + r.y, 0) / rows.length, 3) : null };
  };
  console.log(
    `\n[${name}] lambda=${best.lambda}  CV AUC=${best.auc.toFixed(3)}  holdout AUC=${holdout.auc.toFixed(3)}  ` +
      `logloss=${holdout.logLoss.toFixed(4)}  brier=${holdout.brier.toFixed(4)}  ECE=${holdout.ece.toFixed(4)}`,
  );
  for (const feature of names)
    console.log(`  ${feature.padEnd(12)} ${model.coefficients[feature].toFixed(4).padStart(8)}  95% bootstrap ${stability[feature].join(" … ")}`);
  if (failures.length) throw new Error(`[${name}] robustness checks failed:\n  - ${failures.join("\n  - ")}`);
  return {
    ...roundModel(model),
    lambda: best.lambda,
    metrics: {
      cvAuc: round(best.auc, 4),
      holdoutAuc: round(holdout.auc, 4),
      holdoutLogLoss: round(holdout.logLoss, 4),
      holdoutBrier: round(holdout.brier, 4),
      holdoutEce: round(holdout.ece, 4),
      bands: { low: band(0, 0.3), elevated: band(0.3, 0.5), high: band(0.5, 1.01) },
    },
    bootstrap95: stability,
  };
}

const offline = process.argv.includes("--offline");
const source = await loadDataset(offline);
const sha256 = createHash("sha256").update(source.text).digest("hex");
const { rows, rejected } = parseRows(source.text);
if (rows.length < 25000) throw new Error(`Only ${rows.length} valid rows; the download looks truncated.`);
const examples = rows.map(toExample).filter(Boolean);
console.log(`${rows.length} valid rows (${rejected} rejected); ${examples.length} with repayment history used for training.`);

const random = rng(SEED);
const folds = stratifiedFolds(examples, 5, random);
const test = folds[0];
const train = folds.slice(1).flat();
const baseRate = examples.reduce((sum, example) => sum + example.y, 0) / examples.length;
const variants = Object.fromEntries(Object.keys(VARIANTS).map((name) => [name, trainVariant(name, train, test, random)]));

const weights = {
  id: "ascend-default-lr-v1",
  trainedAt: new Date().toISOString().slice(0, 10),
  dataset: {
    name: "Default of Credit Card Clients (Yeh & Lien, 2009)",
    source: `OpenML data id ${DATASET_ID}`,
    url: `https://www.openml.org/d/${DATASET_ID}`,
    licence: source.licence,
    sha256,
    rows: rows.length,
    trainingRows: train.length,
    holdoutRows: test.length,
    baseRate: round(baseRate, 4),
    excludedColumns: ["sex", "education", "marital status", "age"],
    caveat:
      "Taiwanese credit-card accounts from 2005. Repayment months stand in for Ascend installments, so estimates are indicative and must be re-fitted on Ascend's own outcomes before production use.",
  },
  seed: SEED,
  variants,
};
const banner = "// GENERATED by scripts/train-risk-model.mjs. Do not edit by hand; re-run `npm run train:model`.\n";
await writeFile(OUT, `${banner}export const RISK_MODEL_WEIGHTS = Object.freeze(${JSON.stringify(weights, null, 2)});\n`);
console.log(`\nAll robustness checks passed. Wrote ${OUT}`);
