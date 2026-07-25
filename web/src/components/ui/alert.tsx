import * as React from "react";
import { cn } from "../../lib/utils";

type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "warning" | "critical";
};

export function Alert({ className, tone = "info", ...props }: AlertProps) {
  return <div role="status" className={cn("rr-v1-alert", `rr-v1-alert-${tone}`, className)} {...props} />;
}
