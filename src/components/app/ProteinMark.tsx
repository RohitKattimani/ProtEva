import { cn } from "@/lib/utils";

export function ProteinMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" fill="none" className={cn("size-8", className)} aria-hidden="true"><path d="M8 7 24 12 8 20 24 25M8 7v13M24 12v13" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="24" cy="12" r="3" fill="currentColor"/><circle cx="8" cy="20" r="3" fill="currentColor"/><circle cx="24" cy="25" r="3" fill="currentColor"/></svg>;
}