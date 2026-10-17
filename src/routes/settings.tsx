import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/app/AppShell";
import { Pill } from "@/components/app/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isDemoMode } from "@/lib/protein/api";
import { DEFAULT_CONFIG } from "@/lib/protein/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settings · ProtEva" },
      {
        name: "description",
        content: "Backend connection, default search bounds and demo-mode behaviour for ProtEva.",
      },
      { property: "og:title", content: "Settings · ProtEva" },
      { property: "og:description", content: "Backend connection and default search bounds." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const [warnings, setWarnings] = useState(true);
  const [compact, setCompact] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" description="Workspace preferences and backend connection." />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Backend connection</CardTitle>
          <CardDescription>
            Set VITE_API_BASE_URL to point the same interface at the FastAPI service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Pill tone={isDemoMode ? "warning" : "success"}>
              {isDemoMode ? "Demo mode · MockApiClient" : "Connected · HttpApiClient"}
            </Pill>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api">API base URL</Label>
            <Input
              id="api"
              readOnly
              value={(import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "not configured"}
              className="bg-surface font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Read from the build environment. Failed backend requests are surfaced as errors and
              never replaced with demonstration data.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Default search bounds</CardTitle>
          <CardDescription>Applied to new experiments in the wizard</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-[11px] text-muted-foreground sm:grid-cols-2">
          {Object.entries(DEFAULT_CONFIG).map(([key, value]) => (
            <span key={key}>
              {key} = {String(value)}
            </span>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Interface</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Show validation warnings inline</p>
              <p className="text-[11px] text-muted-foreground">
                Frontend checks only; scientific validation happens in the backend.
              </p>
            </div>
            <Switch checked={warnings} onCheckedChange={setWarnings} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Compact tables</p>
              <p className="text-[11px] text-muted-foreground">Denser rows in candidate views.</p>
            </div>
            <Switch checked={compact} onCheckedChange={setCompact} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
