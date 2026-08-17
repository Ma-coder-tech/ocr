import { useState } from "react";
import { ReportV2Screen } from "./ReportV2Screen";
import { reportV2Fixtures, type ReportV2FixtureKey } from "./reportV2Fixtures";
import "./reportV2.css";

const scenarios: Array<{ key: ReportV2FixtureKey; label: string }> = [
  { key: "above_reference_findings", label: "Above reference · findings" },
  { key: "within_reference_findings", label: "Within reference · findings" },
  { key: "within_reference_clean", label: "Within reference · clean" },
  { key: "comparison_unavailable", label: "Comparison unavailable" },
  { key: "business_confirmation", label: "Business confirmation" },
  { key: "high_risk_within_range", label: "Higher risk · within range" },
  { key: "material_unresolved_fee", label: "Material unresolved fee" },
  { key: "unable_to_complete", label: "Unable to complete" },
];

export function ReportV2Gallery() {
  const [scenario, setScenario] = useState<ReportV2FixtureKey>("above_reference_findings");
  return (
    <div className="rr-v2-gallery">
      <aside className="rr-v2-gallery-controls" aria-label="Synthetic V2 report scenarios">
        <div><strong>V2 state gallery</strong><small>Development only · synthetic data</small></div>
        <label>
          Scenario
          <select value={scenario} onChange={(event) => setScenario(event.target.value as ReportV2FixtureKey)}>
            {scenarios.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </aside>
      <ReportV2Screen key={scenario} report={reportV2Fixtures[scenario]} onStartOver={() => setScenario("above_reference_findings")} />
    </div>
  );
}
