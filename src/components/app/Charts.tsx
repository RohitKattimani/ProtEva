import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GenerationStat } from "@/lib/protein/types";

const axisProps = {
  stroke: "var(--color-muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-foreground)",
} as const;

/**
 * A y-domain that actually contains the series being drawn.
 *
 * A fixed [0, 1] axis is wrong for live runs: a single generation of target
 * preferences around -0.07 gets pinned to the bottom of the axis and the marks
 * become invisible. Padding is derived from the data instead, and a degenerate
 * range (one generation, or every value equal) is widened so the points are not
 * glued to an axis edge.
 */
export function scoreDomain(
  data: GenerationStat[],
  keys: readonly (keyof GenerationStat)[],
  { min = -Infinity }: { min?: number } = {},
): [number, number] {
  const values = data
    .flatMap((row) => keys.map((key) => Number(row[key])))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return [0, 1];

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo;
  if (span < 1e-9) {
    const pad = Math.max(Math.abs(hi) * 0.1, 0.05);
    lo -= pad;
    hi += pad;
  } else {
    lo -= span * 0.15;
    hi += span * 0.15;
  }
  // Proportions such as diversity cannot go below zero, even when the padding would.
  if (min > lo) lo = min;
  // Clamping must never invert the axis (possible if every value sits below the floor).
  if (hi <= lo) hi = lo + Math.max(Math.abs(lo), 1) * 0.1;
  return [lo, hi];
}

/** Tick labels with enough precision for the current domain, never bare floats. */
export function tickFormatter(domain: [number, number]) {
  const span = domain[1] - domain[0];
  const digits = span >= 10 ? 0 : span >= 1 ? 1 : span >= 0.1 ? 2 : 3;
  return (value: number) => value.toFixed(digits);
}

export function ObjectiveChart({
  data,
  height = 220,
}: {
  data: GenerationStat[];
  height?: number;
}) {
  const domain = scoreDomain(data, ["bestScore", "averageScore"]);
  const formatTicks = tickFormatter(domain);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="generation" {...axisProps} />
        <YAxis domain={domain} {...axisProps} tickFormatter={formatTicks} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="bestScore"
          name="Best score"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: "var(--color-chart-1)", stroke: "var(--color-card)" }}
        />
        <Line
          type="monotone"
          dataKey="averageScore"
          name="Population average"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 4, strokeWidth: 2, fill: "var(--color-chart-2)", stroke: "var(--color-card)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DiversityChart({
  data,
  height = 180,
}: {
  data: GenerationStat[];
  height?: number;
}) {
  const domain = scoreDomain(data, ["diversity"], { min: 0 });
  const formatTicks = tickFormatter(domain);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="diversityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-5)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="generation" {...axisProps} />
        <YAxis domain={domain} {...axisProps} tickFormatter={formatTicks} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="diversity"
          name="Sequence diversity"
          stroke="var(--color-chart-5)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: "var(--color-chart-5)", stroke: "var(--color-card)" }}
          fill="url(#diversityFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
