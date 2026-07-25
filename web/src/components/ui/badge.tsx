import * as React from "react";
import { cn } from "../../lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "positive" | "opportunity" | "warning" | "danger" | "limited" | "blocked";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cn("rr-v1-badge", `rr-v1-badge-${tone}`, className)} {...props} />;
}
