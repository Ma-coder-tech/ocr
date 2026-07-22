import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  Info,
  Mail,
} from "lucide-react";
import { useMemo } from "react";
import {
  buildResultsViewModel,
  formatMoney0,
  formatMoney2,
  formatPercent,
  type CustomerFinding,
  type JobResponse,
} from "./reportAdapter";

type ResultsScreenProps = {
  job: JobResponse;
  selectedBusinessLabel: string | null;
  onStartOver: () => void;
};

export function ResultsScreen({ job, selectedBusinessLabel, onStartOver }: ResultsScreenProps) {
  const report = useMemo(() => buildResultsViewModel(job, selectedBusinessLabel), [job, selectedBusinessLabel]);

  return (
    <section className="results-shell" aria-labelledby="results-title">
      <div className="results-topbar">
        <span className="complete-badge">
          <Check size={16} aria-hidden="true" />
          Analysis complete
        </span>
        <button className="secondary-button compact" type="button" aria-label="Download PDF report">
          <Download size={17} aria-hidden="true" />
          Download PDF report
        </button>
      </div>

      <div className="verdict-panel">
        <p className="identity-line">{report.identityLine}</p>
        <h1 id="results-title" className="results-title">
          {report.merchantTitle}
        </h1>

        <div className="stat-grid" aria-label="Statement summary">
          {report.stats.effectiveRate ? (
            <StatCard
              label="Fees as a percentage of sales"
              value={report.stats.effectiveRate}
              detail={report.benchmark.label}
              tone={report.benchmark.className}
            />
          ) : null}
          {report.stats.totalFees ? (
            <StatCard
              label="Total fees this month"
              value={report.stats.totalFees}
              detail={report.stats.volume ? `on ${report.stats.volume} volume` : ""}
            />
          ) : null}
          {report.stats.annualSavings ? (
            <StatCard
              label="Annual fees to challenge"
              value={report.stats.annualSavings}
              detail="in fees worth challenging"
              tone="savings"
              tooltip={savingsTooltip(report)}
            />
          ) : null}
        </div>
      </div>

      {report.pricing ? (
        <section className={`pricing-card ${report.pricing.tone}`} aria-labelledby="pricing-title">
          <div>
            <p className="panel-label">Your pricing structure</p>
            <h2 id="pricing-title">{report.pricing.label}</h2>
            <p>{report.pricing.description}</p>
            {report.pricing.recommendation ? <strong className="pricing-recommendation">{report.pricing.recommendation}</strong> : null}
          </div>
          <div className="pricing-side">
            <span>{report.pricing.detail}</span>
            <strong>
              {report.pricing.tone === "good" ? <Check size={17} aria-hidden="true" /> : <Info size={17} aria-hidden="true" />}
              {report.pricing.statusLabel}
            </strong>
          </div>
        </section>
      ) : null}

      <section className="narrative-panel" aria-labelledby="narrative-title">
        <p className="panel-label">Here's what to do</p>
        <h2 id="narrative-title">{report.narrative.title}</h2>
        <p>{report.narrative.body}</p>
      </section>

      <DetailedReport report={report} />

      <ProcessorPrep report={report} />

      <section className="bottom-cta-grid" aria-label="Next actions">
        <div className="download-cta">
          <Mail size={22} aria-hidden="true" />
          <h2>Take this with you</h2>
          <p>Download the PDF before calling your processor.</p>
          <button className="primary-button" type="button">
            Download PDF report <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="upsell-cta">
          <p className="panel-label">Check more months</p>
          <h2>One statement is a snapshot. More months show the pattern.</h2>
          <p>
            Compare your fees across months, catch recurring charges, and bring a cleaner case to your processor.
          </p>
          <button className="secondary-button" type="button">
            See what&apos;s included <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <button className="start-over-inline" type="button" onClick={onStartOver}>
        Analyze another statement
      </button>
    </section>
  );
}

function savingsTooltip(report: ReturnType<typeof buildResultsViewModel>) {
  const parts = [];
  if (report.stats.conservativeSavings) parts.push(`${report.stats.conservativeSavings} in fees to challenge directly`);
  if (report.stats.negotiableSavings) parts.push(`${report.stats.negotiableSavings} worth reviewing through negotiation or investigation`);
  return parts.length ? `Includes ${parts.join(", plus ")}.` : undefined;
}

function StatCard(props: { label: string; value: string; detail?: string; tone?: string; tooltip?: string }) {
  return (
    <article className={`stat-card ${props.tone ?? ""}`}>
      <div className="stat-label-row">
        <span>{props.label}</span>
        {props.tooltip ? (
          <span className="info-tooltip" aria-label={props.tooltip}>
            <Info size={15} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <strong>{props.value}</strong>
      {props.detail ? <small>{props.detail}</small> : null}
    </article>
  );
}

function DetailedReport({ report }: { report: ReturnType<typeof buildResultsViewModel> }) {
  if (report.feeRows.length === 0 && report.findings.length === 0) return null;
  const maxAmount = Math.max(...report.feeRows.map((row) => row.amount), 1);
  return (
    <div className="report-view">
      {report.feeRows.length ? (
        <section className="fee-breakdown-section" aria-labelledby="fee-breakdown-title">
          <p className="panel-label">Fee breakdown by category</p>
          <h2 id="fee-breakdown-title">Where your fees went this month</h2>
          <div className="fee-breakdown-table">
            {report.feeRows.map((row) => (
              <div className="fee-bar-row" key={`${row.label}-${row.amount}`}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.description}</span>
                </div>
                <div className="fee-bar-track">
                  <span className={row.tone} style={{ width: `${Math.max(8, (row.amount / maxAmount) * 100)}%` }} />
                </div>
                {row.pctOfVolume === null ? null : <span>{formatPercent(row.pctOfVolume)}</span>}
                <strong>{formatMoney0(row.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {report.findings.length ? (
        <section className="detailed-findings-section" aria-labelledby="detailed-findings-title">
          <p className="panel-label">Top findings</p>
          <h2 id="detailed-findings-title">Review these line items first</h2>
          <div className="finding-card-grid">
            {report.findings.map((finding) => (
              <FindingDetailCard finding={finding} key={finding.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FindingDetailCard({ finding }: { finding: CustomerFinding }) {
  const label = finding.severity === "fix" ? "Avoidable" : finding.severity === "watch" ? "Negotiable" : "Clean";
  return (
    <article className={`finding-detail-card ${finding.severity}`}>
      <div className="finding-detail-top">
        <h3>{finding.title}</h3>
        <span>{label}</span>
      </div>
      <strong>
        {finding.monthlyImpact ?? impactFallback(finding)}
        {finding.annualImpact ? <small> · {finding.annualImpact}/yr</small> : null}
      </strong>
      <p>{finding.description}</p>
      {finding.evidenceSummary ? <small>{finding.evidenceSummary}</small> : null}
    </article>
  );
}

function ProcessorPrep({ report }: { report: ReturnType<typeof buildResultsViewModel> }) {
  return (
    <section className="processor-prep" aria-labelledby="processor-prep-title">
      <p className="panel-label">Before you call your processor</p>
      <h2 id="processor-prep-title">Bring these notes to the call</h2>
      <div className="prep-grid">
        <PrepCard title="Questions to ask your processor" items={report.actionItems.processorQuestions} />
        <PrepCard title="Negotiation checklist" items={report.actionItems.negotiationChecklist} />
        <PrepCard title="Documents to gather" items={report.actionItems.documents} />
        <PrepCard title="Risks worth monitoring" items={report.actionItems.risks} />
      </div>
    </section>
  );
}

function PrepCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="prep-card">
      <FileText size={20} aria-hidden="true" />
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function impactFallback(finding: CustomerFinding) {
  if (finding.severity === "clean") return "Clean";
  if (finding.annualImpact) return `${formatMoney2(Number(finding.annualImpact.replace(/[^0-9.-]/g, "")) / 12)}/mo`;
  return "Review";
}
