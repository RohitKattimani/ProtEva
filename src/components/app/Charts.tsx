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

export function ObjectiveChart({ data, height = 220 }: { data: GenerationStat[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="generation" {...axisProps} />
        <YAxis domain={[0, 1]} {...axisProps} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="bestScore"
          name="Best score"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="averageScore"
          name="Population average"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DiversityChart({ data, height = 180 }: { data: GenerationStat[]; height?: number }) {
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
        <YAxis domain={[0, 1]} {...axisProps} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="diversity"
          name="Sequence diversity"
          stroke="var(--color-chart-5)"
          strokeWidth={2}
          fill="url(#diversityFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
