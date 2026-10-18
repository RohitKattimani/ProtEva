import { describe, expect, it } from "vitest";

import { scoreDomain, tickFormatter } from "./Charts";
import type { GenerationStat } from "@/lib/protein/types";

function stat(overrides: Partial<GenerationStat>): GenerationStat {
  return { generation: 0, bestScore: 0, averageScore: 0, diversity: 0, ...overrides };
}

describe("scoreDomain", () => {
  it("fits a single live generation instead of pinning it to a fixed 0-1 axis", () => {
    // One live generation: a real target preference around -0.07.
    const data = [stat({ bestScore: -0.069, averageScore: -0.101, diversity: 0.008 })];

    const domain = scoreDomain(data, ["bestScore", "averageScore"]);

    expect(domain[0]).toBeLessThan(-0.101);
    expect(domain[1]).toBeGreaterThan(-0.069);
    // The marks must not be glued to either edge of the axis.
    const [lo, hi] = domain;
    for (const value of [-0.069, -0.101]) {
      const fraction = (value - lo) / (hi - lo);
      expect(fraction).toBeGreaterThan(0.05);
      expect(fraction).toBeLessThan(0.95);
    }
  });

  it("widens a degenerate range so a flat series stays visible", () => {
    const data = [stat({ diversity: 0.4 }), stat({ diversity: 0.4 })];
    const [lo, hi] = scoreDomain(data, ["diversity"]);
    expect(lo).toBeLessThan(0.4);
    expect(hi).toBeGreaterThan(0.4);
    expect(hi - lo).toBeGreaterThan(0);
  });

  it("never lets a proportion fall below zero", () => {
    const data = [stat({ diversity: 0.008 })];
    const [lo] = scoreDomain(data, ["diversity"], { min: 0 });
    expect(lo).toBe(0);
  });

  it("never inverts the axis when every value sits below the floor", () => {
    const data = [stat({ diversity: -1 }), stat({ diversity: -0.5 })];
    const [lo, hi] = scoreDomain(data, ["diversity"], { min: 0 });
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(lo);
  });

  it("keeps a broad demo series readable and inside the plotted range", () => {
    const data = [stat({ bestScore: 0.32 }), stat({ bestScore: 0.71 }), stat({ bestScore: 0.94 })];
    const [lo, hi] = scoreDomain(data, ["bestScore"]);
    expect(lo).toBeLessThan(0.32);
    expect(hi).toBeGreaterThan(0.94);
  });

  it("falls back to 0-1 when there is no usable data", () => {
    expect(scoreDomain([], ["bestScore"])).toEqual([0, 1]);
  });
});

describe("tickFormatter", () => {
  it("keeps precision appropriate to the domain span", () => {
    expect(tickFormatter([-0.106, -0.064])(-0.088)).toBe("-0.088");
    expect(tickFormatter([0, 1])(0.5)).toBe("0.5");
    expect(tickFormatter([0, 200])(100)).toBe("100");
  });

  it("never prints a bare long float", () => {
    // This is the label the old fixed 0-1 axis produced for live data.
    expect(tickFormatter([-0.10119834542274475, 1])(-0.10119834542274475)).not.toContain("1983454");
  });
});
