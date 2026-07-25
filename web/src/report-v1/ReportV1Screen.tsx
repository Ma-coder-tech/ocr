import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, FileSearch, Info, ShieldCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Separator } from "../components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  cadenceLabel,
  categoryExplanation,
  categoryLabel,
  confidenceLabel,
  dispositionLabel,
  formatCount,
  formatMoney,
  formatPercent,
  statusLabel,
} from "./reportV1Formatters";
import type {
  CalculationRecord,
  EvidenceRef,
  FeeCategoryCode,
  FeeInventoryRow,
  ReportComponentId,
  ReportFinding,
  ReportStateCode,
  SingleStatementReportV1,
} from "./reportV1Types";

type ReportV1ScreenProps = {
  report: SingleStatementReportV1;
  onStartOver: () => void;
};

type DetailsTarget =
  | { kind: "finding"; id: string; title: string; evidenceRefs: string[]; calculationRef?: string; labels: string[]; limitations: string[]; assumptions: string[] }
  | { kind: "fee"; id: string; title: string; row: FeeInventoryRow };
type DetailsHandler = (target: DetailsTarget, trigger: HTMLButtonElement) => void;
type VerdictAction =
  | { kind: "start_over"; label: string; detail: string }
  | { kind: "anchor"; label: string; detail: string; href: string };

const FILTERS: Array<{ id: "all" | FeeCategoryCode | "actionable"; label: string }> = [
  { id: "all", label: "All" },
  { id: "processor_fees", label: "Processor-controlled" },
  { id: "card_brand_network", label: "Network" },
  { id: "service_compliance", label: "Service/compliance" },
  { id: "needs_review", label: "Needs review" },
  { id: "actionable", label: "Actionable" },
];

export function ReportV1Screen({ report, onStartOver }: ReportV1ScreenProps) {
  const [detailsTarget, setDetailsTarget] = useState<DetailsTarget | null>(null);
  const [findingsExpanded, setFindingsExpanded] = useState(false);
  const [feeFilter, setFeeFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const lastDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const evidenceById = useMemo(() => new Map(report.details.evidence.map((item) => [item.id, item])), [report.details.evidence]);
  const calculationById = useMemo(() => new Map(report.details.calculations.map((item) => [item.id, item])), [report.details.calculations]);
  const stateTone = toneForState(report.reportState.code);
  const verdictAction = verdictActionForState(report.reportState.code);
  const visibleFindings = findingsExpanded ? report.findings : report.findings.slice(0, 6);
  const filteredFeeRows = report.feeInventory.rows.filter((row) => {
    if (feeFilter === "all") return true;
    if (feeFilter === "actionable") return row.disposition !== "none";
    return row.category === feeFilter;
  });

  function visibility(component: ReportComponentId) {
    return report.componentVisibility[component] ?? { status: "hide" as const };
  }

  function canShow(component: ReportComponentId) {
    return visibility(component).status !== "hide";
  }

  function openDetails(target: DetailsTarget, trigger: HTMLButtonElement) {
    lastDetailsTriggerRef.current = trigger;
    setDetailsTarget(target);
  }

  return (
    <TooltipProvider>
      <section className={`rr-v1 rr-v1-state-${report.reportState.code}`} aria-labelledby="rr-v1-title">
        <div className="rr-v1-shell">
          <header className="rr-v1-app-header">
            <a className="rr-v1-brand" href="/" aria-label="RateReveal home">
              <span className="rr-v1-brand-mark">R</span>
              <span>RateReveal</span>
            </a>
            <Button variant="secondary" type="button" onClick={onStartOver}>
              Analyze another statement
            </Button>
          </header>

          <section className="rr-v1-identity" aria-label="Report identity">
            <div>
              <p className="rr-v1-kicker">
                {valueText(report.identity.processorName, "Processor unconfirmed")} · {valueText(report.identity.statementPeriod, "Period unavailable")} ·{" "}
                {valueText(report.identity.businessType, "Business type unavailable")}
              </p>
              <h1 id="rr-v1-title">{valueText(report.identity.merchantName, "Statement analysis")}</h1>
              <p className="rr-v1-muted">
                One statement analyzed ·{" "}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="rr-v1-link-button" type="button">
                      {confidenceLabel(report.reportState.confidence)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Confidence is supplied by the backend and reflects the evidence available for this statement.
                  </TooltipContent>
                </Tooltip>
              </p>
            </div>
            <Badge tone={stateTone}>{statusLabel(report.reportState.code)}</Badge>
          </section>

          <div className="rr-v1-nav-rail">
            <nav className="rr-v1-nav" aria-label="Report sections">
              <a href="#rr-v1-summary">Summary</a>
              {canShow("fee_composition") || canShow("fee_inventory") ? <a href="#rr-v1-fees">Fees</a> : null}
              {canShow("findings") ? <a href="#rr-v1-findings">Findings</a> : null}
              {canShow("fee_inventory") ? <a href="#rr-v1-all-charges">All charges</a> : null}
              {canShow("methodology") ? <a href="#rr-v1-methodology">Methodology</a> : null}
            </nav>
          </div>

          <section id="rr-v1-summary" className="rr-v1-section">
            <Card className="rr-v1-verdict">
              <CardContent>
                <div className="rr-v1-verdict-grid">
                  <div>
                    <Badge tone={stateTone}>{report.verdict.eyebrow}</Badge>
                    <h2>{report.verdict.title}</h2>
                    <p>{report.verdict.summary}</p>
                    {report.verdict.supportingPoints.length ? (
                      <ul className="rr-v1-support-list">
                        {report.verdict.supportingPoints.slice(0, 3).map((point) => (
                          <li key={point}>
                            <CheckCircle2 size={17} aria-hidden="true" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <VerdictActionPanel action={verdictAction} onStartOver={onStartOver} />
                </div>
              </CardContent>
            </Card>

            {canShow("core_metrics") ? <MetricStrip report={report} /> : null}
            <DataQualityNotice report={report} />
            {canShow("opportunity_summary") ? <OpportunitySummary report={report} /> : <StateSafeEmpty report={report} />}
          </section>

          {(canShow("benchmark") || canShow("pricing_model")) && (
            <section id="rr-v1-pricing" className="rr-v1-section rr-v1-two-column" aria-label="Benchmark and pricing">
              {canShow("benchmark") ? <BenchmarkPanel report={report} /> : null}
              {canShow("pricing_model") ? <PricingModelPanel report={report} onDetails={openDetails} evidenceById={evidenceById} /> : null}
            </section>
          )}

          {(canShow("fee_composition") || canShow("fee_inventory")) && (
            <section id="rr-v1-fees" className="rr-v1-section">
              {canShow("fee_composition") ? <FeeComposition report={report} visibilityMessage={visibility("fee_composition").message} /> : null}
            </section>
          )}

          {canShow("findings") ? (
            <section id="rr-v1-findings" className="rr-v1-section">
              <SectionHeading
                eyebrow="Prioritized findings"
                title={findingSectionTitle(report.reportState.code, report.findings)}
                copy={findingSectionCopy(report.findings)}
              />
              <div className="rr-v1-finding-list">
                {visibleFindings.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} onDetails={openDetails} evidenceById={evidenceById} calculationById={calculationById} />
                ))}
              </div>
              {report.findings.length > 6 ? (
                <Button variant="secondary" type="button" onClick={() => setFindingsExpanded((value) => !value)}>
                  {findingsExpanded ? "Show fewer findings" : `Show ${report.findings.length - 6} more findings`}
                </Button>
              ) : null}
            </section>
          ) : null}

          {canShow("positive_findings") ? <PositiveFindings report={report} /> : null}

          {canShow("fee_inventory") ? (
            <section id="rr-v1-all-charges" className="rr-v1-section">
              <SectionHeading
                eyebrow="Complete fee inventory"
                title="Every usable charge from this statement"
                copy="Filtering changes only which rows are visible here. It does not change report totals or opportunity amounts."
              />
              <div className="rr-v1-filter-row" role="group" aria-label="Filter fee inventory">
                {FILTERS.map((filter) => (
                  <button className={filter.id === feeFilter ? "active" : ""} key={filter.id} type="button" onClick={() => setFeeFilter(filter.id)}>
                    {filter.label}
                  </button>
                ))}
              </div>
              <FeeInventoryTable rows={filteredFeeRows} onDetails={openDetails} evidenceById={evidenceById} calculationById={calculationById} />
            </section>
          ) : null}

          {canShow("methodology") ? <Methodology report={report} /> : null}

        </div>
        <EvidenceCalculationSheet
          target={detailsTarget}
          onOpenChange={(open) => !open && setDetailsTarget(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            lastDetailsTriggerRef.current?.focus();
          }}
          evidenceById={evidenceById}
          calculationById={calculationById}
        />
      </section>
    </TooltipProvider>
  );
}

function VerdictActionPanel({ action, onStartOver }: { action: VerdictAction; onStartOver: () => void }) {
  return (
    <div className="rr-v1-verdict-action">
      <span className="rr-v1-action-label">Recommended next step</span>
      <p>{action.detail}</p>
      {action.kind === "start_over" ? (
        <Button type="button" onClick={onStartOver}>
          {action.label}
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
      ) : (
        <a className="rr-v1-button rr-v1-button-primary rr-v1-button-default" href={action.href}>
          {action.label}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function MetricStrip({ report }: { report: SingleStatementReportV1 }) {
  const opportunity = opportunityMetric(report);
  const metrics = [
    metricFromValue("Fees as a percentage of sales", report.metrics.effectiveRate, (value) => formatPercent(value), "Also called your effective rate."),
    metricFromValue("Total fees this month", report.metrics.totalFees, (value) => formatMoney(value, 2)),
    metricFromValue("Processed sales", report.metrics.processedSales, (value) => formatMoney(value, 0)),
    opportunity,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="rr-v1-metric-strip" aria-label="Core metrics">
      {metrics.map((metric) => (
        <Card className="rr-v1-metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </Card>
      ))}
    </div>
  );
}

function metricFromValue(label: string, value: { value: number | string | null; status: string; explanation?: string; displayLabel?: string }, formatter: (value: number) => string, detail?: string) {
  if (value.status === "unavailable" || typeof value.value !== "number") return null;
  return { label, value: formatter(value.value), detail: value.displayLabel ?? detail ?? value.explanation };
}

function opportunityMetric(report: SingleStatementReportV1) {
  const state = report.reportState.code;
  if (state === "healthy") return { label: "Opportunity", value: "No material opportunity", detail: "Continue monitoring with another statement." };
  if (state === "verification_required") {
    const amount = report.opportunitySummary.verificationAnnualizedAmountUsd ?? report.opportunitySummary.verificationMonthlyAmountUsd;
    return { label: "Amount to verify", value: formatMoney(amount, 0), detail: "Requires documentation. Not treated as savings." };
  }
  if (state === "low_confidence" || state === "reconciliation_failure" || state === "unable_to_analyze") return null;
  return {
    label: "Eligible opportunity",
    value: formatMoney(report.opportunitySummary.totalEligibleAnnualOpportunityUsd, 0),
    detail: "Backend-approved annual opportunity, not a promised reduction.",
  };
}

function DataQualityNotice({ report }: { report: SingleStatementReportV1 }) {
  const criticalReasons = report.dataQuality.reasons.filter((reason) => reason.severity !== "info");
  const shouldShow = criticalReasons.length > 0 || report.reconciliation.status !== "pass";
  if (!shouldShow) return null;
  const tone = report.reportState.code === "unable_to_analyze" || report.reconciliation.status === "fail" ? "critical" : "warning";
  return (
    <Alert id="rr-v1-data-quality" tone={tone}>
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <strong>{report.reconciliation.status === "fail" ? "Some totals did not reconcile" : "Data-quality note"}</strong>
        <p>{criticalReasons[0]?.message ?? report.reconciliation.reasons[0] ?? "Some report sections are limited by the available statement evidence."}</p>
        <ul>
          <li>Verified: {verifiedSummary(report)}</li>
          <li>Limited: {limitedSummary(report)}</li>
          <li>Affected sections: {affectedSections(report)}</li>
        </ul>
      </div>
    </Alert>
  );
}

function OpportunitySummary({ report }: { report: SingleStatementReportV1 }) {
  const state = report.reportState.code;
  const deterministic = report.opportunitySummary.deterministicAnnualImpactUsd;
  const estimated = report.opportunitySummary.estimatedAnnualOpportunityUsd;
  const verification = report.opportunitySummary.verificationAnnualizedAmountUsd ?? report.opportunitySummary.verificationMonthlyAmountUsd;
  if (state === "healthy") return <StateSafeEmpty report={report} />;
  return (
    <Card className="rr-v1-opportunity">
      <CardHeader>
        <span className="rr-v1-kicker">{state === "verification_required" ? "Verification summary" : "Opportunity summary"}</span>
        <CardTitle>{state === "verification_required" ? "Documentation is needed before a conclusion" : "Opportunity and verification stay separate"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rr-v1-opportunity-grid">
          {state !== "verification_required" ? (
            <div className="rr-v1-opportunity-primary">
              <span>Eligible annual opportunity</span>
              <strong>{formatMoney(report.opportunitySummary.totalEligibleAnnualOpportunityUsd, 0)}</strong>
              <small>This is the backend-approved annual total for findings eligible to count as opportunity.</small>
            </div>
          ) : null}
          {deterministic > 0 ? (
            <div>
              <span>Deterministic portion</span>
              <strong>{formatMoney(deterministic, 0)}</strong>
              <small>Based on specific recurring charges with supported cadence and direct statement evidence.</small>
            </div>
          ) : null}
          {estimated > 0 ? (
            <div>
              <span>Estimated portion</span>
              <strong>{formatMoney(estimated, 0)}</strong>
              <small>Based on backend-supported estimates, such as pricing comparisons. Actual outcomes can vary.</small>
            </div>
          ) : null}
          {verification > 0 ? (
            <div className="rr-v1-verify-box">
              <span>Verification amount</span>
              <strong>{formatMoney(verification, 0)}</strong>
              <small>Requires documentation before any conclusion. Not counted as savings.</small>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StateSafeEmpty({ report }: { report: SingleStatementReportV1 }) {
  if (report.reportState.code !== "healthy") return null;
  return (
    <Card className="rr-v1-empty-state">
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <strong>No material cost-reduction opportunity identified in this statement.</strong>
        <p>Continue monitoring with another month when you have it.</p>
      </div>
    </Card>
  );
}

function BenchmarkPanel({ report }: { report: SingleStatementReportV1 }) {
  return (
    <Card>
      <CardHeader>
        <span className="rr-v1-kicker">Benchmark</span>
        <CardTitle>{statusLabel(report.benchmark.status)}</CardTitle>
      </CardHeader>
      <CardContent className="rr-v1-stack">
        <p>
          {report.benchmark.segment ?? "Benchmark segment unavailable"} · {formatPercent(report.benchmark.lowerRate)} to {formatPercent(report.benchmark.upperRate)}
        </p>
        {report.benchmark.deltaFromUpperRate !== null ? <p>Difference from range ceiling: {formatPercent(report.benchmark.deltaFromUpperRate)}</p> : null}
        {report.benchmark.source ? (
          <div className="rr-v1-limitation">
            <strong>RateReveal directional reference</strong>
            <p>This range is an internal directional reference, not an independently verified market rate.</p>
          </div>
        ) : (
          <p className="rr-v1-muted">Benchmark unavailable or limited for this statement.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PricingModelPanel({
  report,
  onDetails,
  evidenceById,
}: {
  report: SingleStatementReportV1;
  onDetails: DetailsHandler;
  evidenceById: Map<string, EvidenceRef>;
}) {
  const hasEvidence = report.pricingModel.evidenceRefs.some((ref) => evidenceById.has(ref));
  return (
    <Card>
      <CardHeader>
        <span className="rr-v1-kicker">Pricing model</span>
        <CardTitle>{report.pricingModel.label}</CardTitle>
      </CardHeader>
      <CardContent className="rr-v1-stack">
        <Badge tone={report.pricingModel.status === "favorable" ? "positive" : report.pricingModel.status === "review" ? "warning" : "limited"}>{statusLabel(report.pricingModel.status)}</Badge>
        <p>{report.pricingModel.explanation}</p>
        {report.pricingModel.observedRates.length ? (
          <div className="rr-v1-rate-list">
            {report.pricingModel.observedRates.map((rate) => (
              <div key={rate.label}>
                <span>{rate.label}</span>
                <strong>
                  {rate.ratePct !== null ? formatPercent(rate.ratePct) : ""}
                  {rate.perItemUsd !== null ? ` ${formatMoney(rate.perItemUsd, 2)} / item` : ""}
                </strong>
              </div>
            ))}
          </div>
        ) : null}
        {report.pricingModel.recommendation ? <p className="rr-v1-limitation">{report.pricingModel.recommendation}</p> : null}
        {hasEvidence ? (
          <Button
            variant="secondary"
            type="button"
            onClick={(event) =>
              onDetails(
                {
                kind: "finding",
                id: "pricing_model",
                title: report.pricingModel.label,
                evidenceRefs: report.pricingModel.evidenceRefs,
                labels: [],
                assumptions: [],
                limitations: [],
                },
                event.currentTarget,
              )
            }
          >
            Review details
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FeeComposition({ report, visibilityMessage }: { report: SingleStatementReportV1; visibilityMessage?: string }) {
  if (report.feeComposition.status === "unavailable") return null;
  return (
    <Card>
      <CardHeader>
        <span className="rr-v1-kicker">{report.feeComposition.status === "partial" ? "Partial fee breakdown" : "Fee composition"}</span>
        <CardTitle>Where your fees went this month</CardTitle>
      </CardHeader>
      <CardContent>
        {visibilityMessage ? <p className="rr-v1-limitation">{visibilityMessage}</p> : null}
        {report.feeComposition.coveragePct !== null ? <p className="rr-v1-muted">Classification coverage: {formatPercent(report.feeComposition.coveragePct, 1)}</p> : null}
        <div className="rr-v1-composition-list">
          {report.feeComposition.rows.map((row) => (
            <div className="rr-v1-composition-row" key={row.category}>
              <div className="rr-v1-composition-copy">
                <strong>{row.label}</strong>
                <p>{categoryExplanation(row.category)}</p>
              </div>
              <div className="rr-v1-bar-track" aria-hidden="true">
                <span className={`rr-v1-bar-${row.category}`} style={{ width: `${Math.max(3, Math.min(100, row.pctOfTotalFees ?? 0))}%` }} />
              </div>
              <div className="rr-v1-composition-amount">
                <strong>{formatMoney(row.amountUsd, 2)}</strong>
                <span>{row.pctOfTotalFees !== null ? formatPercent(row.pctOfTotalFees, 1) : "Share unavailable"}</span>
              </div>
            </div>
          ))}
        </div>
        {report.feeComposition.deltaUsd !== null ? <p className="rr-v1-muted">Unclassified or reconciliation difference: {formatMoney(report.feeComposition.deltaUsd, 2)}</p> : null}
      </CardContent>
    </Card>
  );
}

function FindingCard({
  finding,
  onDetails,
  evidenceById,
  calculationById,
}: {
  finding: ReportFinding;
  onDetails: DetailsHandler;
  evidenceById: Map<string, EvidenceRef>;
  calculationById: Map<string, CalculationRecord>;
}) {
  const hasDetails = finding.evidenceRefs.some((ref) => evidenceById.has(ref)) || Boolean(finding.calculationRef && calculationById.has(finding.calculationRef));
  return (
    <Card className="rr-v1-finding-card">
      <CardContent>
        <div className="rr-v1-finding-head">
          <Badge tone={finding.disposition === "verify" ? "warning" : finding.disposition === "monitor" ? "limited" : "opportunity"}>{dispositionLabel(finding.disposition)}</Badge>
          <span>{findingRankLabel(finding)}</span>
        </div>
        <h3>{finding.title}</h3>
        <div className="rr-v1-finding-money">
          <span>Current</span>
          <strong>{finding.currentMonthlyAmountUsd !== null ? formatMoney(finding.currentMonthlyAmountUsd, 2) : "Review"}</strong>
          <span>{finding.impactClassification === "verification_only" ? "To verify" : "Impact"}</span>
          <strong>{finding.estimatedAnnualImpactUsd !== null ? formatMoney(finding.estimatedAnnualImpactUsd, 0) : "Not quantified"}</strong>
        </div>
        <p>{finding.explanation}</p>
        <p className="rr-v1-limitation">{finding.merchantAction}</p>
        <div className="rr-v1-card-actions">
          <Badge tone="neutral">{confidenceLabel(finding.confidence)}</Badge>
          {hasDetails ? (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={(event) =>
                onDetails(
                  {
                  kind: "finding",
                  id: finding.id,
                  title: finding.title,
                  evidenceRefs: finding.evidenceRefs,
                  calculationRef: finding.calculationRef,
                  labels: finding.originalStatementLabels,
                  assumptions: finding.assumptions,
                  limitations: finding.limitations,
                  },
                  event.currentTarget,
                )
              }
            >
              {finding.calculationRef ? "View calculation" : "Review details"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PositiveFindings({ report }: { report: SingleStatementReportV1 }) {
  if (!report.positiveFindings.length) return null;
  return (
    <section className="rr-v1-section">
      <SectionHeading eyebrow="Verified strengths" title="What checked out" copy="These positive findings are supplied by the backend and do not dilute the prioritized actions." />
      <div className="rr-v1-positive-grid">
        {report.positiveFindings.map((finding) => (
          <Card key={finding.id}>
            <CardContent>
              <CheckCircle2 size={20} aria-hidden="true" />
              <h3>{finding.title}</h3>
              <p>{finding.explanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function FeeInventoryTable({
  rows,
  onDetails,
  evidenceById,
  calculationById,
}: {
  rows: FeeInventoryRow[];
  onDetails: DetailsHandler;
  evidenceById: Map<string, EvidenceRef>;
  calculationById: Map<string, CalculationRecord>;
}) {
  return (
    <>
      <div className="rr-v1-table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="rr-v1-col-fee">Fee</TableHead>
              <TableHead className="rr-v1-col-category">Category</TableHead>
              <TableHead className="rr-v1-col-money">Charged</TableHead>
              <TableHead className="rr-v1-col-rate">Rate/count</TableHead>
              <TableHead className="rr-v1-col-status">Comparison/status</TableHead>
              <TableHead className="rr-v1-col-action">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <FeeInventoryRowView key={row.id} row={row} onDetails={onDetails} evidenceById={evidenceById} calculationById={calculationById} />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rr-v1-mobile-fees">
        {rows.map((row) => (
          <FeeInventoryMobileRow key={row.id} row={row} onDetails={onDetails} evidenceById={evidenceById} calculationById={calculationById} />
        ))}
      </div>
    </>
  );
}

function FeeInventoryRowView({
  row,
  onDetails,
  evidenceById,
  calculationById,
}: {
  row: FeeInventoryRow;
  onDetails: DetailsHandler;
  evidenceById: Map<string, EvidenceRef>;
  calculationById: Map<string, CalculationRecord>;
}) {
  const hasDetails = row.evidenceRefs.some((ref) => evidenceById.has(ref)) || Boolean(row.calculationRef && calculationById.has(row.calculationRef));
  return (
    <TableRow>
      <TableCell className="rr-v1-col-fee">
        <strong>{row.displayLabel}</strong>
        <span>{row.originalLabel}</span>
      </TableCell>
      <TableCell className="rr-v1-col-category">{categoryLabel(row.category)}</TableCell>
      <TableCell className="rr-v1-col-money">{formatMoney(row.observedAmountUsd, 2)}</TableCell>
      <TableCell className="rr-v1-col-rate">{rateCountLabel(row)}</TableCell>
      <TableCell className="rr-v1-col-status">
        {row.differenceUsd !== null ? `${formatMoney(row.differenceUsd, 2)} difference` : statusLabel(row.comparisonTargetType)}
        <span>{confidenceLabel(row.classificationConfidence)}</span>
      </TableCell>
      <TableCell className="rr-v1-col-action">
        <Badge tone={row.disposition === "none" ? "neutral" : row.disposition === "verify" ? "warning" : "opportunity"}>{dispositionLabel(row.disposition)}</Badge>
        {hasDetails ? (
          <Button variant="ghost" size="sm" type="button" onClick={(event) => onDetails({ kind: "fee", id: row.id, title: row.displayLabel, row }, event.currentTarget)}>
            {row.calculationRef ? "View calculation" : "Review details"}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function FeeInventoryMobileRow(props: Parameters<typeof FeeInventoryRowView>[0]) {
  const { row, onDetails, evidenceById, calculationById } = props;
  const hasDetails = row.evidenceRefs.some((ref) => evidenceById.has(ref)) || Boolean(row.calculationRef && calculationById.has(row.calculationRef));
  return (
    <Card className="rr-v1-mobile-fee-card">
      <CardContent>
        <div>
          <strong>{row.displayLabel}</strong>
          <span>{formatMoney(row.observedAmountUsd, 2)}</span>
        </div>
        <p>
          {categoryLabel(row.category)} · {cadenceLabel(row.cadence)} · {dispositionLabel(row.disposition)}
        </p>
        <p>{rateCountLabel(row)}</p>
        {hasDetails ? (
          <Button variant="secondary" size="sm" type="button" onClick={(event) => onDetails({ kind: "fee", id: row.id, title: row.displayLabel, row }, event.currentTarget)}>
            {row.calculationRef ? "View calculation" : "Review details"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Methodology({ report }: { report: SingleStatementReportV1 }) {
  const benchmarkSource = report.benchmark.source;
  return (
    <section id="rr-v1-methodology" className="rr-v1-section">
      <SectionHeading eyebrow="Methodology" title="How to read this report" copy="Important limitations are shown here and in the affected sections." />
      <Card>
        <CardContent>
          <p className="rr-v1-limitation">{report.limitations[0]?.message ?? "This analysis is based on one monthly statement."}</p>
          <Collapsible>
            <CollapsibleTrigger className="rr-v1-collapsible-trigger">
              Show methodology details <ChevronDown size={16} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="rr-v1-methodology-grid">
              <div>
                <strong>Benchmark</strong>
                <p>{report.methodology.benchmarkMethod ?? "Benchmark methodology unavailable."}</p>
                {benchmarkSource ? (
                  <p>
                    Source: {benchmarkSource.sourceId}, version {benchmarkSource.version}. Methodology: {benchmarkSource.methodologyLabel}.
                  </p>
                ) : null}
              </div>
              <div>
                <strong>Opportunity</strong>
                <p>{report.methodology.savingsMethod}</p>
              </div>
              <div>
                <strong>Reconciliation</strong>
                <p>{report.methodology.reconciliationMethod}</p>
              </div>
              <div>
                <strong>Confidence</strong>
                <p>{report.methodology.confidenceMethod}</p>
              </div>
              {report.limitations.slice(1).map((limitation) => (
                <div key={limitation.code}>
                  <strong>{statusLabel(limitation.code)}</strong>
                  <p>{limitation.message}</p>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </section>
  );
}

function EvidenceCalculationSheet({
  target,
  onOpenChange,
  onCloseAutoFocus,
  evidenceById,
  calculationById,
}: {
  target: DetailsTarget | null;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  evidenceById: Map<string, EvidenceRef>;
  calculationById: Map<string, CalculationRecord>;
}) {
  const evidenceRefs = target ? (target.kind === "fee" ? target.row.evidenceRefs : target.evidenceRefs) : [];
  const calculationRef = target?.kind === "fee" ? target.row.calculationRef : target?.calculationRef;
  const evidenceItems = evidenceRefs.map((ref) => evidenceById.get(ref)).filter((item): item is EvidenceRef => Boolean(item));
  const calculation = calculationRef ? calculationById.get(calculationRef) ?? null : null;

  return (
    <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="rr-v1-sheet-description" onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader>
          <SheetTitle>{target?.title ?? "Report details"}</SheetTitle>
          <SheetDescription id="rr-v1-sheet-description">
            {calculation ? "Calculation and evidence supplied by the report contract." : "Evidence supplied by the report contract."}
          </SheetDescription>
        </SheetHeader>
        {target ? (
          <div className="rr-v1-sheet-body">
            {target.kind === "fee" ? (
              <Card>
                <CardContent className="rr-v1-stack">
                  <div>
                    <span className="rr-v1-detail-label">Original statement label</span>
                    <strong>{target.row.originalLabel}</strong>
                  </div>
                  <div>
                    <span className="rr-v1-detail-label">Observed amount</span>
                    <strong>{formatMoney(target.row.observedAmountUsd, 2)}</strong>
                  </div>
                  <div>
                    <span className="rr-v1-detail-label">Classification</span>
                    <p>{target.row.classificationExplanation ?? categoryExplanation(target.row.category)}</p>
                  </div>
                </CardContent>
              </Card>
            ) : target.labels.length ? (
              <Card>
                <CardContent>
                  <span className="rr-v1-detail-label">Original statement labels</span>
                  <ul>{target.labels.map((label) => <li key={label}>{label}</li>)}</ul>
                </CardContent>
              </Card>
            ) : null}

            {evidenceItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="rr-v1-stack">
                  <Badge tone="neutral">{statusLabel(item.type)}</Badge>
                  {item.originalLabel ? (
                    <div>
                      <span className="rr-v1-detail-label">Statement label</span>
                      <strong>{item.originalLabel}</strong>
                    </div>
                  ) : null}
                  {item.statementPage ? (
                    <div>
                      <span className="rr-v1-detail-label">Statement page</span>
                      <strong>{item.statementPage}</strong>
                    </div>
                  ) : null}
                  {item.statementSection ? (
                    <div>
                      <span className="rr-v1-detail-label">Statement section</span>
                      <strong>{item.statementSection}</strong>
                    </div>
                  ) : null}
                  {item.excerpt ? <blockquote>{item.excerpt}</blockquote> : null}
                  <small>{confidenceLabel(item.confidence)}</small>
                </CardContent>
              </Card>
            ))}

            {calculation ? (
              <Card>
                <CardHeader>
                  <CardTitle>{calculation.formulaLabel}</CardTitle>
                </CardHeader>
                <CardContent className="rr-v1-stack">
                  <div className="rr-v1-calculation-result">
                    <span>Result</span>
                    <strong>{formatCalculationValue(calculation.result, calculation.unit)}</strong>
                  </div>
                  <div className="rr-v1-input-list">
                    {calculation.inputs.map((input) => (
                      <div key={input.label}>
                        <span>{input.label}</span>
                        <strong>{formatCalculationValue(input.value, input.unit)}</strong>
                      </div>
                    ))}
                  </div>
                  {calculation.assumptions.length ? (
                    <div>
                      <span className="rr-v1-detail-label">Assumptions</span>
                      <ul>{calculation.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {target.kind === "finding" && (target.assumptions.length || target.limitations.length) ? (
              <Card>
                <CardContent>
                  {target.assumptions.length ? (
                    <>
                      <span className="rr-v1-detail-label">Assumptions</span>
                      <ul>{target.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                    </>
                  ) : null}
                  {target.limitations.length ? (
                    <>
                      <span className="rr-v1-detail-label">Limitations</span>
                      <ul>{target.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="rr-v1-section-heading">
      <span className="rr-v1-kicker">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

function valueText(value: { value: unknown; status: string }, fallback: string) {
  return value.status !== "unavailable" && typeof value.value === "string" && value.value.trim() ? value.value.trim() : fallback;
}

function toneForState(state: ReportStateCode) {
  const tones: Record<ReportStateCode, "positive" | "opportunity" | "warning" | "danger" | "limited" | "blocked"> = {
    healthy: "positive",
    healthy_with_opportunities: "opportunity",
    above_benchmark_review: "warning",
    material_overpayment: "danger",
    verification_required: "warning",
    low_confidence: "limited",
    reconciliation_failure: "limited",
    unable_to_analyze: "blocked",
  };
  return tones[state];
}

function findingSectionTitle(state: ReportStateCode, findings: ReportFinding[]) {
  const hasVerificationOnly = findings.some((finding) => finding.impactClassification === "verification_only");
  const hasActionable = findings.some((finding) => finding.impactClassification !== "verification_only");
  if (hasVerificationOnly && hasActionable) return "Start with these findings";
  if (state === "verification_required" || state === "reconciliation_failure") return "These items need verification";
  if (state === "healthy_with_opportunities" || state === "material_overpayment") return "Start with these opportunities";
  return "Review these charges";
}

function findingSectionCopy(findings: ReportFinding[]) {
  const hasVerificationOnly = findings.some((finding) => finding.impactClassification === "verification_only");
  const hasActionable = findings.some((finding) => finding.impactClassification !== "verification_only");
  if (hasVerificationOnly && hasActionable) {
    return "Actionable opportunities and verification items are shown together in the backend-approved order. Verification items are not treated as savings.";
  }
  if (hasVerificationOnly) return "These are shown in the backend-approved order. Verification items are not treated as savings.";
  return "These are shown in the backend-approved order.";
}

function findingRankLabel(finding: ReportFinding) {
  if (finding.impactClassification === "verification_only") return `Verify #${finding.rank}`;
  if (finding.disposition === "monitor") return `Monitor #${finding.rank}`;
  return `${dispositionLabel(finding.disposition)} #${finding.rank}`;
}

function verdictActionForState(state: ReportStateCode): VerdictAction {
  switch (state) {
    case "healthy":
      return { kind: "start_over", label: "Analyze another statement", detail: "No follow-up action is needed for this statement. Start over when you have another month to review." };
    case "healthy_with_opportunities":
    case "material_overpayment":
      return { kind: "anchor", label: "View prioritized findings", detail: "Go directly to the backend-supported findings worth reviewing first.", href: "#rr-v1-findings" };
    case "above_benchmark_review":
      return { kind: "anchor", label: "Review pricing details", detail: "Review the pricing model and benchmark context before deciding what to ask your processor.", href: "#rr-v1-pricing" };
    case "verification_required":
      return { kind: "anchor", label: "Review verification findings", detail: "Start with the charges that need documentation before they can be treated as opportunity.", href: "#rr-v1-findings" };
    case "reconciliation_failure":
      return { kind: "anchor", label: "Review data-quality note", detail: "See why RateReveal withheld the full financial conclusion for this statement.", href: "#rr-v1-data-quality" };
    case "low_confidence":
      return { kind: "start_over", label: "Upload a clearer statement", detail: "A cleaner or more complete processor statement may allow RateReveal to verify more sections." };
    case "unable_to_analyze":
      return { kind: "start_over", label: "Upload complete statement", detail: "Try again with the original complete processor statement PDF." };
  }
}

function verifiedSummary(report: SingleStatementReportV1) {
  const parts = [];
  if (report.metrics.processedSales.status !== "unavailable") parts.push("processed sales");
  if (report.metrics.totalFees.status !== "unavailable") parts.push("total fees");
  if (report.feeInventory.rows.length) parts.push("observed fee rows");
  return parts.length ? parts.join(", ") : "limited identity details";
}

function limitedSummary(report: SingleStatementReportV1) {
  const hidden = Object.entries(report.componentVisibility)
    .filter(([key]) => key !== "action_toolkit")
    .filter(([, value]) => value.status === "hide")
    .map(([key]) => statusLabel(key));
  return hidden.length ? hidden.slice(0, 3).join(", ") : "minor limitations only";
}

function affectedSections(report: SingleStatementReportV1) {
  const affected = new Set<string>();
  for (const reason of report.dataQuality.reasons) {
    for (const component of reason.affectedComponents) {
      if (component !== "action_toolkit") affected.add(statusLabel(component));
    }
  }
  if (report.reconciliation.status !== "pass") affected.add("Reconciliation");
  return affected.size ? [...affected].slice(0, 4).join(", ") : "None";
}

function rateCountLabel(row: FeeInventoryRow) {
  const parts = [];
  if (row.observedRatePct !== null) parts.push(formatPercent(row.observedRatePct));
  if (row.observedPerItemUsd !== null) parts.push(`${formatMoney(row.observedPerItemUsd, 2)} / item`);
  if (row.observedItemCount !== null) parts.push(`${formatCount(row.observedItemCount)} items`);
  return parts.length ? parts.join(" · ") : cadenceLabel(row.cadence);
}

function formatCalculationValue(value: number, unit: "money" | "percent" | "bps" | "count") {
  if (unit === "money") return formatMoney(value, 2);
  if (unit === "percent") return formatPercent(value);
  if (unit === "bps") return `${formatCount(value)} bps`;
  return formatCount(value);
}
