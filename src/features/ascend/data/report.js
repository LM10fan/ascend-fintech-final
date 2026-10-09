/**
 * Builds the downloadable assessment & payments report from the same derivation the pages
 * render (deriveCredit), so the file always matches what the applicant saw. Pure: no DOM.
 * Identity numbers stay masked; raw statement lines are summarised by month, not exported.
 */
import { PROFILES } from "./demoStore.js";
import { DEMO_FIPS, PAYMENT_PURPOSES } from "../integrations/demoServices.js";
import { RISK_MODEL_WEIGHTS } from "../domain/riskModelWeights.js";

export const REPORT_VERSION = "ascend-assessment-report-v1";

export function buildAssessmentReport(session, model, generatedAt = new Date().toISOString()) {
  const credit = session.credit;
  const profile = PROFILES.find((item) => item.id === session.profileId) ?? PROFILES[0];
  const { assessment: a, features: f, report, facility, history, fixture } = model;
  const sdaVerified = credit.sda.status === "VERIFIED";
  return {
    reportVersion: REPORT_VERSION,
    generatedAt,
    assessedAt: model.now,
    applicant: {
      id: profile.id,
      name: profile.name,
      city: profile.city,
      profile: fixture.persona,
      pan: profile.ownPan,
      parentPan: profile.parentPan,
      aadhaar: profile.aadhaar,
    },
    application: {
      purpose: session.purpose,
      requestedAmount: session.scenario.principal,
      ...credit.application,
    },
    accountAggregator: {
      status: credit.aa.status,
      account: DEMO_FIPS.find((item) => item.id === credit.aa.fipId)?.name ?? null,
      consentId: credit.aa.consentId,
      consentedAt: credit.aa.consentedAt,
      analyzedAt: credit.aa.analyzedAt,
      revokedAt: credit.aa.revokedAt,
      analysis: f
        ? {
            period: f.period,
            coverageMonths: f.coverageMonths,
            confidence: f.confidence,
            transactionCount: f.transactionCount,
            dataQuality: f.dataQuality,
            monthly: f.monthly,
            observed: f.observed,
            estimated: f.estimated,
            flags: f.flags,
          }
        : null,
    },
    sda: {
      status: credit.sda.status,
      balance: sdaVerified ? credit.sda.balance : null,
      existingHolds: sdaVerified ? credit.sda.otherRestrictions : null,
      confirmedLien: sdaVerified ? credit.sda.confirmedLien : null,
      checkedAt: credit.sda.checkedAt,
      reference: credit.sda.reference,
    },
    bureau: report
      ? {
          status: report.status,
          bureau: report.bureau,
          requestId: report.requestId,
          retrievedAt: report.retrievedAt,
          score: report.score ?? null,
          scoreRange: report.scoreRange ?? null,
          historyMonths: report.historyMonths ?? null,
          utilization: report.utilization ?? null,
          enquiries6m: report.enquiries6m ?? null,
          factors: report.factors ?? [],
          accounts: report.accounts ?? [],
        }
      : null,
    repaymentHistory: history,
    facility,
    assessment: {
      status: a.status,
      eligibleToProceed: a.eligibleToProceed,
      recommendedLevel: a.recommendedLevel,
      levelName: a.levelName,
      baseLimit: a.baseLimit,
      proposedLien: a.proposedLien,
      unsecuredExposure: a.unsecuredExposure,
      confidence: a.confidence,
      riskCap: a.riskCap,
      manualReviewRequired: a.manualReviewRequired,
      reasons: a.reasons,
      missing: a.missing,
      riskFlags: a.riskFlags,
      affordability: a.affordability,
      position: a.position,
      fastTrack: a.fastTrack,
      progression: a.progression,
      levels: a.levels,
    },
    riskModel: {
      engine: a.engine,
      estimate: a.mlRisk,
      model: {
        id: RISK_MODEL_WEIGHTS.id,
        trainedAt: RISK_MODEL_WEIGHTS.trainedAt,
        dataset: RISK_MODEL_WEIGHTS.dataset.name,
        holdoutAuc: Object.fromEntries(
          Object.entries(RISK_MODEL_WEIGHTS.variants).map(([name, variant]) => [name, variant.metrics.holdoutAuc]),
        ),
      },
    },
    payments: {
      outstanding: credit.outstanding,
      transactions: credit.payments.map((item) => ({ ...item, purposeLabel: PAYMENT_PURPOSES[item.purpose] ?? null })),
    },
    notice: "Ascend's assessment is a recommendation, not an approval. Credit is offered and approved only by regulated partner lenders.",
  };
}

export function reportFileName(session, generatedAt) {
  return `ascend-assessment-report-${session.profileId}-${generatedAt.slice(0, 10)}.json`;
}
