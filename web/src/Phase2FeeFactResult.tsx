import { Check, Info } from "lucide-react";
import type { PublicPhase2FeeFact } from "./reportAdapter";

function printedCharge(fact: PublicPhase2FeeFact): string {
  return `${fact.printedCurrencySymbol}${(fact.displayChargeMagnitudeMinor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function Phase2FeeFactCard({ fact }: { fact: PublicPhase2FeeFact }) {
  return (
    <article className="verdict-panel" aria-labelledby="phase2-fee-title">
      <p className="eyebrow"><Check size={16} aria-hidden="true" /> Verified statement fact</p>
      <h2 id="phase2-fee-title">Processing fee charges shown on this statement</h2>
      <p className="phase2-fee-amount">{printedCharge(fact)}</p>
      <p className="body-copy">This is one charge amount verified from the statement’s fee section and summary.
        It is not a complete analysis of your processing costs.</p>
      <p className="file-meta"><Info size={14} aria-hidden="true" /> Statement period shown:
        {` ${fact.printedStatementPeriod.start} to ${fact.printedStatementPeriod.end}`}.
        The dates when individual fees were earned or posted are not established.</p>
    </article>
  );
}

export function Phase2FeeFactResult({ fact, onStartOver }: {
  fact: PublicPhase2FeeFact; onStartOver: () => void;
}) {
  return (
    <section className="results-shell" aria-label="Limited statement result">
      <div className="results-topbar"><span className="complete-badge">One fact verified · Full analysis unavailable</span></div>
      <Phase2FeeFactCard fact={fact} />
      <button className="start-over-inline" type="button" onClick={onStartOver}>Analyze another statement</button>
    </section>
  );
}
