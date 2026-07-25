import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({ className, children, ...props }: Dialog.DialogContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="rr-v1-sheet-overlay" />
      <Dialog.Content className={cn("rr-v1-sheet-content", className)} {...props}>
        {children}
        <Dialog.Close className="rr-v1-sheet-close" aria-label="Close details">
          <X size={18} aria-hidden="true" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rr-v1-sheet-header", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: Dialog.DialogTitleProps) {
  return <Dialog.Title className={cn("rr-v1-sheet-title", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: Dialog.DialogDescriptionProps) {
  return <Dialog.Description className={cn("rr-v1-sheet-description", className)} {...props} />;
}
