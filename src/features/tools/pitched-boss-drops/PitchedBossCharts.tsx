"use client";

import { toolStyles } from "../tool-styles";
import type { AppTheme } from "../../../components/themes";
import { chartSeriesColor } from "../../../components/chartColors";
import { useLazyChart } from "../useLazyChart";
import type { PitchedBossDrop } from "./types";

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Chart data                                                         */
/* ------------------------------------------------------------------ */

function buildMonthlyData(drops: PitchedBossDrop[], theme: AppTheme) {
  const months = getLastNMonths(6);
  const labels = months.map(formatMonth);
  const charNames = Array.from(new Set(drops.map((d) => d.characterName)));

  const datasets = charNames.map((name) => {
    const color = chartSeriesColor(theme, name);
    return {
      label: name,
      data: months.map(
        (month) => drops.filter((d) => d.characterName === name && d.date.startsWith(month)).length,
      ),
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2.5,
    };
  });

  return { labels, datasets };
}

function lineOptions(theme: AppTheme) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { position: "bottom" as const, labels: { color: theme.muted, font: { size: 12, weight: 600 as const } } },
      tooltip: { mode: "index" as const, intersect: false },
    },
    scales: {
      x: { ticks: { color: theme.muted }, grid: { color: theme.border } },
      y: { beginAtZero: true, ticks: { color: theme.muted, stepSize: 1 }, grid: { color: theme.border } },
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/** Per-item totals live in the Collection grid, so the only chart here is the one
 *  the grid can't show: how the drops are spread over time, per character. */
export default function PitchedBossCharts({
  theme,
  drops,
}: {
  theme: AppTheme;
  drops: PitchedBossDrop[];
}) {
  const charts = useLazyChart(["Line"], (c) => [
    c.CategoryScale,
    c.LinearScale,
    c.PointElement,
    c.LineElement,
    c.Tooltip,
    c.Legend,
  ]);

  if (!charts) return null;
  const { Line } = charts;

  return (
    <div className="fade-in panel-card" style={toolStyles(theme).sectionPanel}>
      <h2 className="tool-panel-title" style={{ color: theme.text }}>Monthly Drops by Character</h2>
      <Line data={buildMonthlyData(drops, theme)} options={lineOptions(theme)} />
    </div>
  );
}
