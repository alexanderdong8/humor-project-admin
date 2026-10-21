import type { CSSProperties, ReactNode } from "react";
import { compact } from "@/lib/format";
import styles from "./charts.module.css";

/** Categorical slots in fixed order (validated palette, see globals.css). */
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/** A clean axis maximum: 1, 2, 5, 10, 20, 50… at or above the data's max. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * pow >= max) return step * pow;
  return 10 * pow;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A "Show the numbers" disclosure, so no chart is the only way to read its data. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className={styles.table}>
      <summary>Show the numbers</summary>
      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={typeof cell === "number" ? "mono" : undefined}>
                    {typeof cell === "number" ? compact(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Stacked columns over time. Each column is one period; segments stack from
 * the baseline with a 2px surface gap between them.
 */
export function StackedColumns({
  columns,
  series,
  height = 180,
  labelEvery = 7,
}: {
  columns: { label: string; values: number[]; tip: string }[];
  series: string[];
  height?: number;
  labelEvery?: number;
}) {
  const totals = columns.map((c) => c.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 0));
  return (
    <div className={styles.plot}>
      <div className={styles.yAxis} style={{ height }} aria-hidden="true">
        <span>{compact(max)}</span>
        <span>{compact(max / 2)}</span>
        <span>0</span>
      </div>
      <div className={styles.plotArea}>
        <div className={styles.columns} style={{ height }}>
          <span className={styles.gridline} style={{ bottom: "50%" }} />
          <span className={styles.gridline} style={{ bottom: "100%" }} />
          {columns.map((col, i) => (
            <div key={col.label} className={styles.column} data-tip={col.tip} tabIndex={totals[i] > 0 ? 0 : -1}>
              <div className={styles.stack} style={{ height: `${(totals[i] / max) * 100}%` }}>
                {col.values.map((v, s) =>
                  v > 0 ? (
                    <span key={s} style={{ flexGrow: v, background: SERIES[s] }} aria-label={`${series[s]}: ${v}`} />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {columns.map((col, i) => (
            // Count back from the newest column so it's always labeled and spacing stays even.
            <span key={col.label}>{(columns.length - 1 - i) % labelEvery === 0 ? col.label : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single-series columns with an optional reference line (e.g. what chance alone would give). */
export function Columns({
  items,
  reference,
  height = 170,
  format = (v: number) => compact(v),
}: {
  items: { label: string; value: number; tip: string; note?: string }[];
  reference?: { value: number; label: string };
  height?: number;
  format?: (v: number) => string;
}) {
  const max = niceMax(Math.max(...items.map((i) => i.value), reference?.value ?? 0));
  return (
    <div className={styles.bigColumns}>
      <div className={styles.bigColumnsArea} style={{ height }}>
        {reference && (
          <span className={styles.reference} style={{ bottom: `${(reference.value / max) * 100}%` }}>
            <span>{reference.label}</span>
          </span>
        )}
        {items.map((item) => (
          <div key={item.label} className={styles.bigColumn} data-tip={item.tip} tabIndex={0}>
            <span className={styles.bigValue}>{format(item.value)}</span>
            <span className={styles.bigBar} style={{ height: `${(item.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className={styles.bigLabels}>
        {items.map((item) => (
          <span key={item.label}>
            {item.label}
            {item.note && <small>{item.note}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars, value at the tip. */
export function HBars({
  rows,
  color = SERIES[0],
}: {
  rows: { label: ReactNode; value: number; display?: string; tip: string; key: string }[];
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className={styles.hbars}>
      {rows.map((row) => (
        <li key={row.key} data-tip={row.tip} tabIndex={0}>
          <span className={styles.hLabel}>{row.label}</span>
          <span className={styles.hTrack}>
            <span className={styles.hBar} style={{ width: `${(row.value / max) * 100}%`, background: color }} />
            <span className={`${styles.hValue} mono`}>{row.display ?? compact(row.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number) {
  return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
}

/** Weekday × hour activity, one blue ramp from "none" to "busiest". */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; n: number }[] }) {
  const grid = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.n]));
  const max = Math.max(...cells.map((c) => c.n), 1);
  const step = (n: number) => (n === 0 ? 0 : Math.min(5, 1 + Math.floor(((n - 1) / max) * 5)));
  return (
    <div className={styles.heat}>
      <div className={styles.heatGrid} role="img" aria-label="Activity by weekday and hour">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={styles.heatHour}>
            {h % 6 === 0 ? hourLabel(h) : ""}
          </span>
        ))}
        {DAYS.map((day, d) => (
          <div key={day} className={styles.heatRow}>
            <span className={styles.heatDay}>{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = grid.get(`${d + 1}:${h}`) ?? 0;
              return (
                <span
                  key={h}
                  className={styles.heatCell}
                  style={{ background: `var(--seq-${step(n)})` } as CSSProperties}
                  data-tip={`${day} ${hourLabel(h)}m: ${n} ${n === 1 ? "action" : "actions"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.heatKey} aria-hidden="true">
        Quiet
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} style={{ background: `var(--seq-${s})` }} />
        ))}
        Busy
      </div>
    </div>
  );
}

/** One bar split into parts, labeled underneath (shares of a whole). */
export function SplitBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className={styles.split}>
      <div className={styles.splitBar}>
        {parts.map((p, i) => (
          <span
            key={p.label}
            style={{ flexGrow: p.value, background: SERIES[i % SERIES.length] }}
            data-tip={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
          />
        ))}
      </div>
      <ul className={styles.splitKey}>
        {parts.map((p, i) => (
          <li key={p.label}>
            <span className={styles.swatch} style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />
            <span>{p.label}</span>
            <strong className="mono">{Math.round((p.value / total) * 100)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dots on two linear axes (x and y both start at 0). */
export function Scatter({
  points,
  xLabel,
  yLabel,
  xMax,
  yMax = 100,
  ySuffix = "%",
}: {
  points: { x: number; y: number; tip: string; key: string }[];
  xLabel: string;
  yLabel: string;
  xMax?: number;
  yMax?: number;
  ySuffix?: string;
}) {
  const xm = niceMax(xMax ?? Math.max(...points.map((p) => p.x), 1));
  return (
    <div className={styles.scatter}>
      <span className={styles.scatterY}>{yLabel}</span>
      <div className={styles.scatterPlot}>
        <span className={styles.gridline} style={{ bottom: "50%" }} />
        <span className={styles.gridline} style={{ bottom: "100%" }} />
        <span className={styles.scatterTick} style={{ bottom: "100%" }}>
          {yMax}
          {ySuffix}
        </span>
        <span className={styles.scatterTick} style={{ bottom: "50%" }}>
          {yMax / 2}
          {ySuffix}
        </span>
        <span className={styles.scatterTick} style={{ bottom: "0%" }}>
          0
        </span>
        {points.map((p) => (
          <span
            key={p.key}
            className={styles.dot}
            style={{ left: `${(p.x / xm) * 100}%`, bottom: `${(p.y / yMax) * 100}%` }}
            data-tip={p.tip}
            tabIndex={0}
          />
        ))}
      </div>
      <div className={styles.scatterX} aria-hidden="true">
        <span>0</span>
        <span>{xm / 2}</span>
        <span>{xm}</span>
      </div>
      <span className={styles.scatterXLabel}>{xLabel}</span>
    </div>
  );
}

/** A label, a big number, and an optional line of context. */
export function StatTile({ label, value, note }: { label: string; value: number | string; note?: ReactNode }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{typeof value === "number" ? compact(value) : value}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}
