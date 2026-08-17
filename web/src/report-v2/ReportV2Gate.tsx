import type { ReactNode } from "react";
import { guardProductionReportV2 } from "./reportV2Guard";
import { ReportV2Screen } from "./ReportV2Screen";

type ReportV2GateProps = {
  enabled: boolean;
  productionReportV2: unknown;
  onStartOver: () => void;
  children: ReactNode;
};

export function ReportV2Gate({ enabled, productionReportV2, onStartOver, children }: ReportV2GateProps) {
  if (!enabled) return <>{children}</>;
  const guarded = guardProductionReportV2(productionReportV2);
  if (!guarded.ok) return <>{children}</>;
  return <ReportV2Screen report={guarded.report} onStartOver={onStartOver} />;
}
