import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm";
};

export function Button({ className, variant = "primary", size = "default", ...props }: ButtonProps) {
  return <button className={cn("rr-v1-button", `rr-v1-button-${variant}`, `rr-v1-button-${size}`, className)} {...props} />;
}
