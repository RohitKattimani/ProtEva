import { cn } from "@/lib/utils";
import { STATUS_LABEL, statusTone } from "@/lib/protein/format";
import type { ExperimentStatus } from "@/lib/protein/types";

export function StatusBadge({
  status,
  className,
}: {
  status: ExperimentStatus;
  className?: string;
}) {
  const animated = !["completed", "failed", "cancelled"].includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight",
        statusTone(status),
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full bg-current", animated && "animate-pulse")}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "accent" | "warning" | "danger" | "success";
  className?: string;
}) {
  const tones = {
    muted: "border-border bg-muted text-muted-foreground",
    primary: "border-primary/40 bg-primary/10 text-primary",
    accent: "border-accent/40 bg-accent/10 text-accent",
    warning: "border-warning/40 bg-warning/10 text-warning",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-success/40 bg-success/10 text-success",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
