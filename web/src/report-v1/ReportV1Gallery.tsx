import { useState } from "react";
import { Button } from "../components/ui/button";
import { reportV1Fixtures } from "./reportV1Fixtures";
import { ReportV1Screen } from "./ReportV1Screen";
import type { ReportStateCode } from "./reportV1Types";

const states = Object.keys(reportV1Fixtures) as ReportStateCode[];

export function ReportV1Gallery() {
  const [state, setState] = useState<ReportStateCode>("healthy_with_opportunities");
  return (
    <div>
      <div className="rr-v1-gallery-switcher" aria-label="Development report state gallery">
        {states.map((item) => (
          <Button key={item} type="button" variant={item === state ? "primary" : "secondary"} size="sm" onClick={() => setState(item)}>
            {item.replaceAll("_", " ")}
          </Button>
        ))}
      </div>
      <ReportV1Screen report={reportV1Fixtures[state]} onStartOver={() => setState("healthy_with_opportunities")} />
    </div>
  );
}
