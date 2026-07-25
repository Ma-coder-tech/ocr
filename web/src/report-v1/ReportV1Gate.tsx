import type { ReactNode } from "react";
import { guardSingleStatementReportV1 } from "./reportV1Guard";
import { ReportV1Screen } from "./ReportV1Screen";

type ReportV1GateProps = {
  reportV1: unknown;
  onStartOver: () => void;
  children: ReactNode;
};

export function ReportV1Gate({ reportV1, onStartOver, children }: ReportV1GateProps) {
  const guarded = guardSingleStatementReportV1(reportV1);
  if (guarded.ok) return <ReportV1Screen report={guarded.report} onStartOver={onStartOver} />;
  return <>{children}</>;
}
