import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Cpu,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ProteinMark } from "./ProteinMark";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/experiments/new", label: "New Experiment", icon: Plus },
  { to: "/candidates", label: "Candidate Library", icon: Boxes },
  { to: "/agents", label: "Agent Activity", icon: Cpu },
  { to: "/documentation", label: "Documentation", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function DemoBadge() {
  return (
    <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10px] font-medium tracking-[0.12em] text-warning">
      DEMO MODE · SIMULATED DATA
    </span>
  );
}

function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = ["ProtEva", ...parts.map((p) => p.replace(/-/g, " "))];
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb}-${i}`} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground/50">/</span>}
          <span
            className={cn(
              "truncate capitalize",
              i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {crumb}
          </span>
        </span>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const sidebar = (
    <div
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-[212px]",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Link to="/" aria-label="ProtEva home" className="shrink-0 text-accent"><ProteinMark className="size-7" /></Link>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium">ProtEva</p>
            <p className="truncate text-[10px] text-muted-foreground">RESEARCH WORKBENCH</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map((item) => {
          const path: string = item.to;
          const active = path === "/experiments" ? pathname === path || (pathname.startsWith(path + "/") && pathname !== "/experiments/new") : pathname === path;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--color-primary)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" /> Collapse
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="workbench flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen md:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full">{sidebar}</div>
          <button
            aria-label="Close navigation"
            className="flex-1 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search experiments, candidates…"
                className="h-8 w-44 bg-surface pl-8 text-xs lg:w-64"
              />
            </div>
            <DemoBadge />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                  <Bell className="size-4" />
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications (simulated)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex-col items-start gap-0.5">
                  <span className="text-xs font-medium">Auditor flagged 3 rankings</span>
                  <span className="text-[11px] text-muted-foreground">
                    EXP-1044 · differences inside reported uncertainty
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex-col items-start gap-0.5">
                  <span className="text-xs font-medium">EXP-1045 failed at generation 3</span>
                  <span className="text-[11px] text-muted-foreground">
                    Simulated sampling worker unreachable
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="workbench-main min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="workbench-page-header mb-7 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-medium lg:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
