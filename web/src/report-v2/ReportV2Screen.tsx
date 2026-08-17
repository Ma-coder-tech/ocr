import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Info,
  LockKeyhole,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  confidenceLabel,
  experienceLabel,
  formatCount,
  formatMoney,
  formatRate,
  formatStatementPeriod,
  positionLabel,
  priorityLabel,
} from "./reportV2Formatters";
import type {
  ProductionReportV2,
  ReportV2Action,
  ReportV2Charge,
  ReportV2Finding,
  ReportV2Payload,
  ReportV2Question,
} from "./reportV2Types";
import "./reportV2.css";

type ReportV2ScreenProps = {
  report: ProductionReportV2;
  onStartOver: () => void;
};

type InventoryFilter = "all" | "attention" | "routine" | "unresolved";

export function ReportV2Screen({ report, onStartOver }: ReportV2ScreenProps) {
  if (report.experience === "unable_to_complete") {
    return <UnableReport report={report} onStartOver={onStartOver} />;
  }
  if (!report.report) return null;
  return <ReportableReport report={report} payload={report.report} onStartOver={onStartOver} />;
}

function AppHeader({ payload, onStartOver }: { payload: ReportV2Payload | null; onStartOver: () => void }) {
  return (
    <header className="rr-v2-app-header">
      <a className="rr-v2-brand" href="/" aria-label="RateReveal home">
        <span className="rr-v2-brand-mark" aria-hidden="true">R</span>
        <span>RateReveal</span>
      </a>
      <div className="rr-v2-header-actions">
        {payload ? <SaveReportMenu payload={payload} /> : null}
        <button className="rr-v2-button rr-v2-button-secondary" type="button" onClick={onStartOver}>
          <RotateCcw size={16} aria-hidden="true" /> Analyze another
        </button>
      </div>
    </header>
  );
}

function SaveReportMenu({ payload }: { payload: ReportV2Payload }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="rr-v2-button rr-v2-button-quiet" type="button">
          <Save size={16} aria-hidden="true" /> Save report
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="rr-v2-dialog-overlay" />
        <Dialog.Content className="rr-v2-dialog rr-v2-save-dialog" aria-describedby="rr-v2-save-description">
          <Dialog.Title>Save your report</Dialog.Title>
          <Dialog.Description id="rr-v2-save-description">
            These options are planned, but they are not available yet.
          </Dialog.Description>
          <div className="rr-v2-save-options">
            {payload.saveReport.capabilities.map((capability) => (
              <div className="rr-v2-save-option" key={capability.id}>
                <FileText size={19} aria-hidden="true" />
                <span><strong>{capability.label}</strong><small>Coming soon</small></span>
              </div>
            ))}
          </div>
          <p className="rr-v2-dialog-note">No file will download and no email address will be collected.</p>
          <Dialog.Close className="rr-v2-dialog-close" aria-label="Close save report dialog"><X size={18} aria-hidden="true" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UnableReport({ report, onStartOver }: ReportV2ScreenProps) {
  const recovery = report.recovery;
  if (!recovery) return null;
  return (
    <div className="rr-v2 rr-v2-unable">
      <AppHeader payload={null} onStartOver={onStartOver} />
      <main className="rr-v2-unable-main">
        <section className="rr-v2-recovery" aria-labelledby="rr-v2-recovery-title">
          <div className="rr-v2-recovery-icon" aria-hidden="true"><FileText size={26} /></div>
          <p className="rr-v2-kicker">Statement review</p>
          <h1 id="rr-v2-recovery-title">{recovery.title}</h1>
          <p className="rr-v2-recovery-copy">{recovery.explanation}</p>
          <div className="rr-v2-recovery-steps">
            <h2>What to try next</h2>
            <ol>{recovery.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
          <button className="rr-v2-button rr-v2-button-primary" type="button" onClick={onStartOver}>
            Analyze another statement <ArrowRight size={17} aria-hidden="true" />
          </button>
          <p className="rr-v2-recovery-assurance"><LockKeyhole size={15} aria-hidden="true" /> No financial conclusion was shown because this review could not be completed safely.</p>
        </section>
      </main>
    </div>
  );
}

function ReportableReport({ report, payload, onStartOver }: { report: ProductionReportV2; payload: ReportV2Payload; onStartOver: () => void }) {
  const clean = payload.priorityFindings.status === "omitted" && payload.openQuestions.status === "omitted";
  const navItems = navigationFor(payload);
  return (
    <div className="rr-v2">
      <AppHeader payload={payload} onStartOver={onStartOver} />
      <main className="rr-v2-report">
        <ReportIdentity report={report} />
        <nav className="rr-v2-section-nav" aria-label="Report sections">
          <div className="rr-v2-section-nav-inner">
            {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </div>
        </nav>

        <div className="rr-v2-content">
          <Hero payload={payload} />
          <Snapshot payload={payload} />
          <Composition payload={payload} />
          {payload.priorityFindings.status === "shown" && payload.priorityFindings.items.length ? (
            <Findings findings={payload.priorityFindings.items} />
          ) : clean ? (
            <section className="rr-v2-clean-note" aria-label="Clean report summary">
              <span className="rr-v2-clean-icon" aria-hidden="true"><Check size={18} /></span>
              <div><h2>Nothing urgent found</h2><p>This statement does not show a material finding that needs immediate attention. One month is still only a snapshot.</p></div>
            </section>
          ) : null}
          <OpenQuestions payload={payload} />
          <ChargeInventory payload={payload} clean={clean} />
          <NextSteps payload={payload} />
          <Methodology payload={payload} />
          <Continuation payload={payload} />
        </div>
      </main>
    </div>
  );
}

function ReportIdentity({ report }: { report: ProductionReportV2 }) {
  const period = formatStatementPeriod(report.header.statementPeriod);
  return (
    <section className="rr-v2-identity" aria-labelledby="rr-v2-report-title">
      <div>
        <p className="rr-v2-kicker">Statement review</p>
        <h1 id="rr-v2-report-title">{report.header.merchantName ?? report.header.title}</h1>
        <div className="rr-v2-identity-meta">
          {report.header.processor ? <span>{report.header.processor}</span> : null}
          {period ? <span>{period}</span> : null}
          <span>{report.header.statementScope}</span>
        </div>
      </div>
      <span className={`rr-v2-state rr-v2-state-${report.experience}`}>{experienceLabel(report.experience)}</span>
    </section>
  );
}

function Hero({ payload }: { payload: ReportV2Payload }) {
  const hero = payload.hero;
  if (hero.status === "omitted" || !hero.effectiveRate) return null;
  const benchmark = hero.benchmark;
  return (
    <section className="rr-v2-hero" id="rr-v2-summary" aria-labelledby="rr-v2-effective-rate-title">
      <div className="rr-v2-hero-main">
        <p className="rr-v2-kicker">Your clearest number</p>
        <h2 id="rr-v2-effective-rate-title">{hero.heading}</h2>
        <div className="rr-v2-rate-row">
          <strong>{formatRate(hero.effectiveRate)}</strong>
          {benchmark ? <span className={`rr-v2-position rr-v2-position-${benchmark.position}`}>{positionLabel(benchmark.position)}</span> : <span className="rr-v2-position rr-v2-position-unavailable">Comparison unavailable</span>}
        </div>
        {hero.interpretation ? <p className="rr-v2-hero-interpretation">{hero.interpretation}</p> : null}
        {benchmark ? <BenchmarkRange effectiveRate={hero.effectiveRate} benchmark={benchmark} /> : hero.benchmarkUnavailableMessage ? (
          <div className="rr-v2-comparison-unavailable"><Info size={17} aria-hidden="true" /><p>{hero.benchmarkUnavailableMessage}</p></div>
        ) : null}
      </div>
      {hero.primaryNextAction ? (
        <aside className="rr-v2-start-here">
          <span className="rr-v2-start-number">01</span>
          <div><p className="rr-v2-kicker">Start here</p><h3>Your next focus</h3><p>{hero.primaryNextAction}</p></div>
          <a className="rr-v2-text-link" href={payload.nextActions.status === "shown" ? "#rr-v2-next" : payload.priorityFindings.status === "shown" ? "#rr-v2-findings" : "#rr-v2-check"}>
            Go to next step <ArrowDown size={15} aria-hidden="true" />
          </a>
        </aside>
      ) : null}
    </section>
  );
}

function BenchmarkRange({ effectiveRate, benchmark }: { effectiveRate: string; benchmark: NonNullable<ReportV2Payload["hero"]["benchmark"]> }) {
  const marker = rangeMarker(Number(effectiveRate), Number(benchmark.range.low), Number(benchmark.range.high));
  const contextEntries: Array<readonly [string, string | null]> = [
    ["Reference segment", benchmark.context.referenceSegment],
    ["Risk context", benchmark.context.risk],
    ["Processing channel", benchmark.context.processingChannel],
    ["Annual volume", benchmark.context.annualVolume],
    ["Market", benchmark.context.market],
    ["Processor", benchmark.context.processor],
    ["Comparison confidence", benchmark.context.confidence],
  ];
  const context = contextEntries.filter((item): item is readonly [string, string] => typeof item[1] === "string" && item[1].length > 0);
  return (
    <div className="rr-v2-benchmark">
      <div className="rr-v2-benchmark-heading"><span>{benchmark.label}</span><strong>{formatRate(benchmark.range.low)}–{formatRate(benchmark.range.high)}</strong></div>
      <div className="rr-v2-range" role="img" aria-label={`Your effective rate ${formatRate(effectiveRate)}; reference range ${formatRate(benchmark.range.low)} to ${formatRate(benchmark.range.high)}; ${positionLabel(benchmark.position)}.`}>
        <span className="rr-v2-range-track" />
        <span className="rr-v2-range-band" />
        <span className="rr-v2-range-marker" style={{ left: `${marker}%` }}><span>Your rate</span></span>
      </div>
      <div className="rr-v2-range-labels"><span>{formatRate(benchmark.range.low)}</span><span>{formatRate(benchmark.range.high)}</span></div>
      <details className="rr-v2-disclosure rr-v2-comparison-details">
        <summary>How we compared this <ChevronDown size={15} aria-hidden="true" /></summary>
        <div className="rr-v2-disclosure-body">
          <dl className="rr-v2-context-list">
            {context.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {benchmark.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
        </div>
      </details>
    </div>
  );
}

function Snapshot({ payload }: { payload: ReportV2Payload }) {
  if (payload.snapshot.status === "omitted") return null;
  const snapshot = payload.snapshot;
  return (
    <section className="rr-v2-section rr-v2-snapshot" aria-labelledby="rr-v2-snapshot-title">
      <div className="rr-v2-section-heading"><div><p className="rr-v2-kicker">Statement snapshot</p><h2 id="rr-v2-snapshot-title">The month at a glance</h2></div></div>
      <div className={`rr-v2-metrics${snapshot.transactionCount ? " rr-v2-metrics-three" : ""}`}>
        <Metric label="Processed sales" value={formatMoney(snapshot.processedSales)} />
        <Metric label="Processing fees" value={formatMoney(snapshot.totalFees)} />
        {snapshot.transactionCount ? <Metric label="Transactions" value={formatCount(snapshot.transactionCount.value)} /> : null}
      </div>
      {payload.trustStrip.status === "shown" ? (
        <ul className="rr-v2-trust-strip" aria-label="Statement review checks">
          {payload.trustStrip.items.map((item) => (
            <li key={item.label} className={`rr-v2-trust-${item.status}`}>
              {item.status === "confirmed" ? <Check size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}{item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rr-v2-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Composition({ payload }: { payload: ReportV2Payload }) {
  const composition = payload.composition;
  if (composition.status === "omitted" || !composition.categories.length) return null;
  const total = Math.max(1, composition.categories.reduce((sum, category) => sum + Math.max(category.amount.amountMinor, 0), 0));
  return (
    <section className="rr-v2-section" id="rr-v2-fees" aria-labelledby="rr-v2-composition-title">
      <div className="rr-v2-section-heading">
        <div><p className="rr-v2-kicker">Fee composition</p><h2 id="rr-v2-composition-title">{composition.heading}</h2></div>
        {composition.status === "partial" ? <span className="rr-v2-section-status"><CircleAlert size={14} aria-hidden="true" /> Partial view</span> : null}
      </div>
      <div className="rr-v2-composition-card">
        <div className="rr-v2-composition-total"><span>Statement fees</span><strong>{formatMoney(composition.statementFeeTotal)}</strong></div>
        <div className="rr-v2-stack" role="img" aria-label={composition.accessibleSummary}>
          {composition.categories.map((category, index) => (
            <span key={category.id} className={`rr-v2-stack-segment rr-v2-palette-${index % 6}`} style={{ width: `${Math.max(2, category.amount.amountMinor / total * 100)}%` }} />
          ))}
        </div>
        <ul className="rr-v2-composition-legend">
          {composition.categories.map((category, index) => (
            <li key={category.id}>
              <span className={`rr-v2-legend-dot rr-v2-palette-${index % 6}`} aria-hidden="true" />
              <span><strong>{category.label}</strong><small>{category.rowCount} {category.rowCount === 1 ? "charge" : "charges"}</small></span>
              <b>{formatMoney(category.amount)}</b>
            </li>
          ))}
        </ul>
        {composition.disclosure ? <p className="rr-v2-inline-note"><Info size={15} aria-hidden="true" />{composition.disclosure}</p> : null}
      </div>
    </section>
  );
}

function Findings({ findings }: { findings: ReportV2Finding[] }) {
  return (
    <section className="rr-v2-section" id="rr-v2-findings" aria-labelledby="rr-v2-findings-title">
      <div className="rr-v2-section-heading"><div><p className="rr-v2-kicker">Charges worth your attention</p><h2 id="rr-v2-findings-title">Start with these findings</h2></div><span className="rr-v2-count">{findings.length}</span></div>
      <div className="rr-v2-findings-list">
        {findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} />)}
      </div>
    </section>
  );
}

function FindingCard({ finding, index }: { finding: ReportV2Finding; index: number }) {
  return (
    <article className={`rr-v2-finding rr-v2-finding-${finding.priority}`}>
      <div className="rr-v2-finding-topline">
        <span className="rr-v2-finding-order">{String(index + 1).padStart(2, "0")}</span>
        <span className="rr-v2-priority">{priorityLabel(finding.priority)}</span>
        <span className="rr-v2-evidence">{finding.evidenceStatus}</span>
      </div>
      <div className="rr-v2-finding-heading">
        <div><p>{finding.category}</p><h3>{finding.merchantTitle}</h3></div>
        {finding.observedAmount ? <strong>{formatMoney(finding.observedAmount)}</strong> : null}
      </div>
      <p className="rr-v2-finding-why">{finding.whyDeservesAttention}</p>
      <div className="rr-v2-finding-layers">
        <ExplanationLayer title="What your statement shows" body={finding.whatStatementShows} />
        <ExplanationLayer title="What this likely means" body={finding.whatThisLikelyMeans} />
        <ExplanationLayer title="What we still need to confirm" body={finding.whatStillNeedsConfirmation.join(" ") || "No additional confirmation is projected."} />
      </div>
      <div className="rr-v2-finding-footer">
        <span>{finding.likelyOwner ? `Likely owner: ${finding.likelyOwner.economicBeneficiary}` : "Owner not established"}</span>
        <span>{confidenceLabel(finding.confidence)}</span>
        <FindingDetails finding={finding} />
        {finding.safestNextAction ? <a className="rr-v2-button rr-v2-button-primary rr-v2-button-small" href="#rr-v2-next">{finding.safestNextAction.instruction}<ArrowRight size={15} aria-hidden="true" /></a> : null}
      </div>
    </article>
  );
}

function ExplanationLayer({ title, body }: { title: string; body: string }) {
  return <div><h4>{title}</h4><p>{body}</p></div>;
}

function FindingDetails({ finding }: { finding: ReportV2Finding }) {
  const referenceCount = finding.references.evidenceRefs.length + finding.references.feeRowRefs.length;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="rr-v2-text-link" type="button">See why</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="rr-v2-dialog-overlay" />
        <Dialog.Content className="rr-v2-dialog rr-v2-side-dialog">
          <Dialog.Title>{finding.merchantTitle}</Dialog.Title>
          <Dialog.Description>{finding.whyDeservesAttention}</Dialog.Description>
          <div className="rr-v2-dialog-sections">
            <ExplanationLayer title="What your statement shows" body={finding.whatStatementShows} />
            <ExplanationLayer title="What this likely means" body={finding.whatThisLikelyMeans} />
            <ExplanationLayer title="What we still need to confirm" body={finding.whatStillNeedsConfirmation.join(" ") || "No additional confirmation is projected."} />
          </div>
          {referenceCount ? <p className="rr-v2-reference-note"><ShieldCheck size={16} aria-hidden="true" />{referenceCount} supporting statement {referenceCount === 1 ? "reference is" : "references are"} linked to this finding.</p> : null}
          <Dialog.Close className="rr-v2-dialog-close" aria-label="Close finding details"><X size={18} aria-hidden="true" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OpenQuestions({ payload }: { payload: ReportV2Payload }) {
  const questions = payload.openQuestions;
  if (questions.status === "omitted" || (!questions.items.length && !questions.context.length)) return null;
  return (
    <section className="rr-v2-section" id="rr-v2-check" aria-labelledby="rr-v2-check-title">
      <div className="rr-v2-section-heading"><div><p className="rr-v2-kicker">Open questions</p><h2 id="rr-v2-check-title">{questions.heading}</h2></div></div>
      {questions.context.length ? <div className="rr-v2-context-note"><Info size={17} aria-hidden="true" /><p>{questions.context.join(" ")}</p></div> : null}
      <div className="rr-v2-question-grid">
        {questions.items.map((question) => <QuestionCard key={question.id} question={question} />)}
      </div>
    </section>
  );
}

function QuestionCard({ question }: { question: ReportV2Question }) {
  return (
    <article className="rr-v2-question">
      <p className="rr-v2-question-label">Needs checking</p>
      <h3>{question.question}</h3>
      {question.amountUnderReview ? <div className="rr-v2-review-amount"><span>Amount under review</span><strong>{formatMoney(question.amountUnderReview)}</strong><small>This is not a savings amount.</small></div> : null}
      <dl>
        <div><dt>What RateReveal knows</dt><dd>{question.whatRateRevealKnows}</dd></div>
        <div><dt>What is still open</dt><dd>{question.whatRemainsUncertain}</dd></div>
        <div><dt>What to do next</dt><dd>{question.safeNextStep}</dd></div>
      </dl>
      <div className="rr-v2-needed"><strong>What is needed</strong><ul>{question.requiredEvidenceOrConfirmation.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </article>
  );
}

function ChargeInventory({ payload, clean }: { payload: ReportV2Payload; clean: boolean }) {
  const inventory = payload.allCharges;
  const [filter, setFilter] = useState<InventoryFilter>(inventory.defaultView === "attention" ? "attention" : "all");
  const [expanded, setExpanded] = useState(!clean);
  const rows = useMemo(() => inventory.rows.filter((row) => filterCharge(row, filter)), [inventory.rows, filter]);
  if (inventory.status === "omitted") return null;
  return (
    <section className="rr-v2-section" id="rr-v2-charges" aria-labelledby="rr-v2-charges-title">
      <div className="rr-v2-section-heading">
        <div><p className="rr-v2-kicker">Charge transparency</p><h2 id="rr-v2-charges-title">{inventory.heading}</h2><p>{inventory.rows.length} projected charges · routine charges remain available</p></div>
        {inventory.status === "partial" ? <span className="rr-v2-section-status"><CircleAlert size={14} aria-hidden="true" /> Partial inventory</span> : null}
      </div>
      {clean && !expanded ? (
        <button className="rr-v2-inventory-reveal" type="button" onClick={() => setExpanded(true)}>
          <Search size={18} aria-hidden="true" /><span><strong>View all charges on this statement</strong><small>Inspect every projected charge, including routine items.</small></span><ArrowRight size={17} aria-hidden="true" />
        </button>
      ) : (
        <>
          <div className="rr-v2-filters" role="group" aria-label="Filter statement charges">
            {([
              ["all", "All"],
              ["attention", "Needs attention"],
              ["routine", "Routine"],
              ["unresolved", "Still unclear"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{countForFilter(inventory.rows, value)}</span></button>
            ))}
          </div>
          <div className="rr-v2-table-wrap">
            <table className="rr-v2-charge-table">
              <thead><tr><th scope="col">Statement charge</th><th scope="col">Category / owner</th><th scope="col">What RateReveal knows</th><th scope="col" className="rr-v2-money-col">Amount</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
              <tbody>
                {rows.map((row) => <ChargeRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p className="rr-v2-empty-filter">No projected charges match this filter.</p> : null}
          {inventory.disclosure ? <p className="rr-v2-inline-note"><Info size={15} aria-hidden="true" />{inventory.disclosure}</p> : null}
        </>
      )}
    </section>
  );
}

function ChargeRow({ row }: { row: ReportV2Charge }) {
  return (
    <tr className={`rr-v2-charge-row rr-v2-charge-${row.disposition}`}>
      <th scope="row"><span className={`rr-v2-disposition rr-v2-disposition-${row.disposition}`}>{dispositionLabel(row.disposition)}</span><strong>{row.label}</strong></th>
      <td><strong>{row.category}</strong><small>{row.likelyOwner?.economicBeneficiary ?? "Owner not established"}</small></td>
      <td><span>{row.whatRateRevealKnows ?? row.evidenceStatus}</span><small>{row.evidenceStatus}</small></td>
      <td className="rr-v2-money-col">{formatMoney(row.amount)}</td>
      <td><ChargeDetails row={row} /></td>
    </tr>
  );
}

function ChargeDetails({ row }: { row: ReportV2Charge }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="rr-v2-text-link" type="button">See details</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="rr-v2-dialog-overlay" />
        <Dialog.Content className="rr-v2-dialog rr-v2-side-dialog">
          <Dialog.Title>{row.label}</Dialog.Title>
          <Dialog.Description>{row.category} · {formatMoney(row.amount)}</Dialog.Description>
          <dl className="rr-v2-detail-list">
            <div><dt>What RateReveal knows</dt><dd>{row.whatRateRevealKnows ?? "No additional explanation is projected."}</dd></div>
            <div><dt>Evidence status</dt><dd>{row.evidenceStatus}</dd></div>
            <div><dt>Likely owner</dt><dd>{row.likelyOwner?.economicBeneficiary ?? "Not established"}</dd></div>
            {row.safestAction ? <div><dt>Safest next step</dt><dd>{row.safestAction.instruction}</dd></div> : null}
          </dl>
          {row.references.evidenceRefs.length ? <p className="rr-v2-reference-note"><ShieldCheck size={16} aria-hidden="true" />Supporting statement detail is linked to this charge.</p> : null}
          <Dialog.Close className="rr-v2-dialog-close" aria-label="Close charge details"><X size={18} aria-hidden="true" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NextSteps({ payload }: { payload: ReportV2Payload }) {
  if (payload.nextActions.status === "shown" && payload.nextActions.modules.length) {
    return (
      <section className="rr-v2-section" id="rr-v2-next" aria-labelledby="rr-v2-next-title">
        <div className="rr-v2-section-heading"><div><p className="rr-v2-kicker">Action plan</p><h2 id="rr-v2-next-title">{payload.nextActions.heading}</h2></div></div>
        <div className="rr-v2-actions-list">{payload.nextActions.modules.map((action, index) => <ActionCard key={action.id} action={action} index={index} />)}</div>
      </section>
    );
  }
  if (payload.nextActions.status === "guidance" && payload.nextActions.guidance) {
    return (
      <section className="rr-v2-section rr-v2-guidance-only" id="rr-v2-next" aria-labelledby="rr-v2-guidance-title">
        <div><p className="rr-v2-kicker">Next step</p><h2 id="rr-v2-guidance-title">{payload.nextActions.heading}</h2></div>
        <p>{payload.nextActions.guidance}</p>
      </section>
    );
  }
  if (payload.monitoring.status === "shown") {
    return (
      <section className="rr-v2-section rr-v2-monitoring" id="rr-v2-next" aria-labelledby="rr-v2-monitoring-title">
        <div className="rr-v2-monitoring-icon" aria-hidden="true"><ShieldCheck size={22} /></div>
        <div><p className="rr-v2-kicker">Baseline monitoring</p><h2 id="rr-v2-monitoring-title">{payload.monitoring.heading}</h2><p>One statement is a useful baseline, not a permanent verdict.</p></div>
        <ul>{payload.monitoring.guidance.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
      </section>
    );
  }
  return null;
}

function ActionCard({ action, index }: { action: ReportV2Action; index: number }) {
  return (
    <article className="rr-v2-action">
      <span className="rr-v2-action-step">Step {index + 1}</span>
      <div className="rr-v2-action-summary"><div><h3>{action.title}</h3><p>{action.whatToDo}</p></div></div>
      <p className="rr-v2-action-why"><strong>Why this step</strong>{action.why}</p>
      <details className="rr-v2-disclosure rr-v2-action-details">
        <summary>See full guidance <ChevronDown size={15} aria-hidden="true" /></summary>
        <div className="rr-v2-disclosure-body">
          {action.exactAsk ? <GuidanceBlock title="What to ask your processor" body={action.exactAsk} /> : null}
          {action.requestDocumentation.length ? <GuidanceList title="What to request" items={action.requestDocumentation} /> : null}
          {action.followUp ? <GuidanceBlock title="If the answer is unclear" body={action.followUp} /> : null}
          {action.avoidClaiming.length ? <GuidanceList title="What not to claim" items={action.avoidClaiming} /> : null}
          <GuidanceList title="What a good outcome looks like" items={action.successCriteria} />
        </div>
      </details>
    </article>
  );
}

function GuidanceBlock({ title, body }: { title: string; body: string }) {
  return <div className="rr-v2-guidance-block"><h4>{title}</h4><p>{body}</p></div>;
}

function GuidanceList({ title, items }: { title: string; items: string[] }) {
  return <div className="rr-v2-guidance-block"><h4>{title}</h4><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function Methodology({ payload }: { payload: ReportV2Payload }) {
  if (!payload.methodology.disclosures.length) return null;
  return (
    <section className="rr-v2-section rr-v2-methodology" id="rr-v2-method" aria-labelledby="rr-v2-method-title">
      <details className="rr-v2-disclosure">
        <summary><span><p className="rr-v2-kicker">Methodology</p><h2 id="rr-v2-method-title">{payload.methodology.heading}</h2></span><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="rr-v2-disclosure-body"><ul>{payload.methodology.disclosures.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </details>
    </section>
  );
}

function Continuation({ payload }: { payload: ReportV2Payload }) {
  const continuation = payload.continuation;
  return (
    <section className="rr-v2-continuation" aria-labelledby="rr-v2-continuation-title">
      <div className="rr-v2-continuation-copy"><p className="rr-v2-kicker">Build a clearer picture</p><h2 id="rr-v2-continuation-title">{continuation.title}.</h2><p>{continuation.body}</p></div>
      <div className="rr-v2-journey" aria-label="One statement analyzed, then three to six more months, then patterns across time">
        <span><strong>1</strong> statement analyzed</span><ArrowRight size={18} aria-hidden="true" /><span><strong>+3–6</strong> more months</span><ArrowRight size={18} aria-hidden="true" /><span><strong>See</strong> patterns over time</span>
      </div>
      <ul>{continuation.benefits.map((benefit) => <li key={benefit}><Check size={15} aria-hidden="true" />{benefit}</li>)}</ul>
      <p className="rr-v2-continuation-qualification">{continuation.qualification}</p>
      <Dialog.Root>
        <Dialog.Trigger asChild><button className="rr-v2-button rr-v2-button-primary rr-v2-continuation-button" type="button">{continuation.callToAction.label}<ArrowRight size={17} aria-hidden="true" /></button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="rr-v2-dialog-overlay" />
          <Dialog.Content className="rr-v2-dialog">
            <Dialog.Title>Multi-statement comparison is coming next</Dialog.Title>
            <Dialog.Description>This report does not start an upload or paid workflow. The comparison experience is not available yet.</Dialog.Description>
            <p className="rr-v2-dialog-note">Your current one-statement report remains unchanged.</p>
            <Dialog.Close className="rr-v2-dialog-close" aria-label="Close continuation dialog"><X size={18} aria-hidden="true" /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function navigationFor(payload: ReportV2Payload): Array<{ href: string; label: string }> {
  const items: Array<{ href: string; label: string }> = [];
  if (payload.hero.status === "shown" || payload.snapshot.status === "shown") items.push({ href: "#rr-v2-summary", label: "Summary" });
  if (payload.composition.status !== "omitted") items.push({ href: "#rr-v2-fees", label: "Fees" });
  if (payload.priorityFindings.status === "shown") items.push({ href: "#rr-v2-findings", label: "Findings" });
  if (payload.openQuestions.status === "shown") items.push({ href: "#rr-v2-check", label: "Still to check" });
  if (payload.allCharges.status !== "omitted") items.push({ href: "#rr-v2-charges", label: "All charges" });
  if (payload.nextActions.status !== "omitted" || payload.monitoring.status === "shown") items.push({ href: "#rr-v2-next", label: "Next steps" });
  if (payload.methodology.disclosures.length) items.push({ href: "#rr-v2-method", label: "Methodology" });
  return items;
}

function rangeMarker(rate: number, low: number, high: number): number {
  if (![rate, low, high].every(Number.isFinite) || high <= low) return 50;
  const padding = (high - low) * 0.39;
  const minimum = Math.max(0, low - padding);
  const maximum = high + padding;
  return Math.max(4, Math.min(96, (rate - minimum) / (maximum - minimum) * 100));
}

function filterCharge(row: ReportV2Charge, filter: InventoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return row.disposition === "attention";
  if (filter === "routine") return row.disposition === "routine";
  return row.disposition === "unresolved";
}

function countForFilter(rows: ReportV2Charge[], filter: InventoryFilter): number {
  return rows.filter((row) => filterCharge(row, filter)).length;
}

function dispositionLabel(value: ReportV2Charge["disposition"]): string {
  if (value === "attention") return "Needs attention";
  if (value === "unresolved") return "Still unclear";
  if (value === "routine") return "Routine";
  return "Information";
}
