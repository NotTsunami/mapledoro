"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

/** A react-chartjs-2 chart, typed loosely so panels can pass their own data/options shapes. */
export type ChartComponent = ComponentType<{ data: unknown; options: unknown }>;

type ChartModule = typeof import("chart.js");
type ChartName = "Bar" | "Line";

/**
 * Loads chart.js and react-chartjs-2 the first time a chart panel renders.
 *
 * Together they are ~180 KB, and every panel that uses them is conditional
 * (nothing simulated yet, nothing tracked with income, no drops logged), so the
 * cost is only worth paying once the panel is actually on screen. `registerables`
 * picks the scales and elements that panel needs, since chart.js only draws what
 * has been registered.
 *
 * Returns `null` until the modules land, and stays `null` if the chunk fails to
 * load, which renders the panel as nothing rather than breaking the page.
 */
export function useLazyChart<N extends ChartName>(
  names: readonly N[],
  registerables: (chart: ChartModule) => Parameters<ChartModule["Chart"]["register"]>,
): Record<N, ChartComponent> | null {
  const [charts, setCharts] = useState<Record<N, ChartComponent> | null>(null);
  // Captured on first render: the loader below runs once and must not re-run when
  // a caller passes fresh inline arrays/closures on later renders.
  const argsRef = useRef({ names, registerables });

  useEffect(() => {
    let alive = true;
    const { names: wanted, registerables: pick } = argsRef.current;

    async function load(): Promise<void> {
      const [chartModule, reactChart] = await Promise.all([
        import("chart.js"),
        import("react-chartjs-2"),
      ]);
      chartModule.Chart.register(...pick(chartModule));
      if (!alive) return;
      const resolved = {} as Record<N, ChartComponent>;
      for (const name of wanted) resolved[name] = reactChart[name] as ChartComponent;
      setCharts(resolved);
    }

    void load().catch(() => {
      // Chunk failed to load; leave `charts` null so the panel renders nothing.
    });

    return () => {
      alive = false;
    };
  }, []);

  return charts;
}
