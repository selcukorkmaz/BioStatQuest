// The "and here is what actually happens" panel.
//
// Rendered only AFTER the learner has committed to a prediction, inside the
// feedback block. Everything it draws comes from src/lib/simulate.ts, which is
// pure and seeded — this file only turns numbers into shapes.

import * as React from "react";
import { runSimulation, isSimSpec, type SimSpec, type Bin } from "../lib/simulate";

const C = {
  pop: "#94a3b8",
  means: "#8b5cf6",
  good: "#10b981",
  bad: "#f43f5e",
  axis: "#334155",
  label: "#94a3b8",
  accent: "#06b6d4",
  amber: "#fbbf24",
};

const W = 520;

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-slate-400 leading-relaxed mt-2">{children}</div>;
}

function Bars({ bins, color, height, label }: { bins: Bin[]; color: string; height: number; label: string }) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  const pad = 26;
  const bw = (W - 2 * pad) / bins.length;
  const lo = bins[0].x0, hi = bins[bins.length - 1].x1;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={label}>
      {bins.map((b, i) => {
        const h = (b.count / max) * (height - 30);
        return (
          <rect key={i} x={pad + i * bw} y={height - 18 - h} width={Math.max(1, bw - 1)} height={h}
            fill={color} fillOpacity={0.75} />
        );
      })}
      <line x1={pad} y1={height - 18} x2={W - pad} y2={height - 18} stroke={C.axis} />
      <text x={pad} y={height - 5} fill={C.label} fontSize="10">{lo.toFixed(2)}</text>
      <text x={W - pad} y={height - 5} fill={C.label} fontSize="10" textAnchor="end">{hi.toFixed(2)}</text>
      <text x={pad} y={12} fill={color} fontSize="11" fontWeight="600">{label}</text>
    </svg>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mono text-sm font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

export function SimulationReveal({ spec }: { spec: SimSpec }) {
  // A spec can arrive from persisted state written by an older build. Degrade to
  // no picture rather than taking the whole question down with it.
  const result = React.useMemo(() => (isSimSpec(spec) ? runSimulation(spec) : null), [JSON.stringify(spec)]);
  if (!result) return null;

  let body: React.ReactNode = null;

  if (result.kind === "clt") {
    const settled = Math.abs(result.meanSkew) < 0.5;
    body = (
      <>
        <Bars bins={result.popBins} color={C.pop} height={110} label={`Individual values (${result.population})`} />
        <Bars bins={result.meanBins} color={C.means} height={110} label={`Means of samples of n = ${result.n}`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Stat label="SD of values" value={result.popSd.toFixed(2)} color={C.pop} />
          <Stat label="SD of means" value={result.meanSd.toFixed(3)} color={C.means} />
          <Stat label="σ/√n predicts" value={result.predictedSe.toFixed(3)} color={C.accent} />
          <Stat label="Skew of means" value={result.meanSkew.toFixed(2)} color={settled ? C.good : C.amber} />
        </div>
        <Caption>
          Both panels come from the same population. The top one keeps its long tail no matter how much
          data you collect; the bottom one is what a sample MEAN of {result.n} does, and it is
          {settled ? " already close to symmetric" : " still visibly skewed — n is too small for the CLT to have finished its work"}.
          The spread fell from {result.popSd.toFixed(2)} to {result.meanSd.toFixed(3)}, against the
          σ/√n prediction of {result.predictedSe.toFixed(3)}.
        </Caption>
      </>
    );
  }

  if (result.kind === "ci_coverage") {
    const H = 210, padL = 8, padR = 8;
    const [lo, hi] = result.range;
    const toX = (v: number) => padL + ((v - lo) / (hi - lo)) * (W - padL - padR);
    const rowH = (H - 26) / result.intervals.length;
    body = (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={`${result.intervals.length} confidence intervals, ${result.missed} missing the true mean`}>
          {result.intervals.map((iv, i) => (
            <line key={i} x1={toX(iv.lo)} x2={toX(iv.hi)} y1={14 + i * rowH} y2={14 + i * rowH}
              stroke={iv.covers ? C.good : C.bad} strokeOpacity={iv.covers ? 0.5 : 1}
              strokeWidth={iv.covers ? 1.6 : 2.4} />
          ))}
          <line x1={toX(result.mu)} y1={6} x2={toX(result.mu)} y2={H - 12} stroke={C.amber} strokeWidth="1.5" strokeDasharray="4,3" />
          <text x={toX(result.mu) + 6} y={H - 2} fill={C.amber} fontSize="10">true mean = {result.mu}</text>
        </svg>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <Stat label="Intervals" value={String(result.intervals.length)} color={C.label} />
          <Stat label="Missed" value={String(result.missed)} color={C.bad} />
          <Stat label="Coverage" value={`${(100 - (result.missed / result.intervals.length) * 100).toFixed(0)}%`} color={C.good} />
        </div>
        <Caption>
          Each line is one study drawn from a population whose true mean we happen to know. The red ones
          missed it — {result.missed} of {result.intervals.length}. Nothing went wrong in those studies:
          missing about 1 in 20 is what "95% confidence" MEANS. In real life you get exactly one of these
          lines and no way to tell which colour it is.
        </Caption>
      </>
    );
  }

  if (result.kind === "multiplicity") {
    const H = 120, pad = 26;
    const toX = (p: number) => pad + p * (W - 2 * pad);
    const rows = Math.ceil(result.pvals.length / 30);
    body = (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={`${result.pvals.length} p-values under the null, ${result.hits} below alpha`}>
          <rect x={pad} y={16} width={toX(result.alpha) - pad} height={H - 46} fill={C.bad} fillOpacity={0.12} />
          {result.pvals.map((p, i) => (
            <circle key={i} cx={toX(p)} cy={26 + (i % Math.max(1, Math.ceil(result.pvals.length / rows))) * ((H - 56) / Math.max(1, Math.ceil(result.pvals.length / rows)))}
              r={3.2} fill={p < result.alpha ? C.bad : C.pop} fillOpacity={p < result.alpha ? 1 : 0.55} />
          ))}
          <line x1={pad} y1={H - 24} x2={W - pad} y2={H - 24} stroke={C.axis} />
          <line x1={toX(result.alpha)} y1={12} x2={toX(result.alpha)} y2={H - 24} stroke={C.bad} strokeWidth="1.5" strokeDasharray="4,3" />
          <text x={pad} y={H - 8} fill={C.label} fontSize="10">p = 0</text>
          <text x={toX(result.alpha) + 5} y={H - 8} fill={C.bad} fontSize="10">α = {result.alpha}</text>
          <text x={W - pad} y={H - 8} fill={C.label} fontSize="10" textAnchor="end">p = 1</text>
        </svg>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <Stat label="Tests run" value={String(result.pvals.length)} color={C.label} />
          <Stat label="Flagged as significant" value={String(result.hits)} color={C.bad} />
          <Stat label="Expected" value={result.expected.toFixed(1)} color={C.accent} />
        </div>
        <Caption>
          Every one of these {result.pvals.length} nulls is TRUE — there is no effect anywhere in this
          simulation. {result.hits === 0 ? "This run happened to produce none" : `${result.hits} still came out "significant"`},
          because a true null delivers a p-value uniformly between 0 and 1, and {(result.alpha * 100).toFixed(0)}% of
          that range sits below α by construction. Run it again and a different set lights up.
        </Caption>
      </>
    );
  }

  if (result.kind === "collider") {
    const H = 240, pad = 28;
    const xs = result.points.map((p) => p.x), ys = result.points.map((p) => p.y);
    const xl = Math.min(...xs), xh = Math.max(...xs), yl = Math.min(...ys), yh = Math.max(...ys);
    const toX = (v: number) => pad + ((v - xl) / (xh - xl)) * (W - 2 * pad);
    const toY = (v: number) => H - pad - ((v - yl) / (yh - yl)) * (H - 2 * pad);
    body = (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label="Two independent variables, before and after conditioning on their common effect">
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={C.axis} />
          <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke={C.axis} />
          {result.points.slice(0, 500).map((p, i) => (
            <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={p.sel ? 3 : 2.2}
              fill={p.sel ? C.bad : C.pop} fillOpacity={p.sel ? 0.95 : 0.3} />
          ))}
          <text x={pad + 4} y={pad + 2} fill={C.pop} fontSize="10">all subjects</text>
          <text x={pad + 4} y={pad + 16} fill={C.bad} fontSize="10">kept after conditioning</text>
          <text x={W - pad} y={H - pad + 14} fill={C.label} fontSize="10" textAnchor="end">exposure →</text>
        </svg>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <Stat label="r, everyone" value={result.rAll.toFixed(2)} color={C.good} />
          <Stat label="r, kept only" value={result.rSel.toFixed(2)} color={C.bad} />
          <Stat label="Kept" value={`${result.selectedCount} of ${result.points.length}`} color={C.label} />
        </div>
        <Caption>
          The two variables were generated INDEPENDENTLY — r = {result.rAll.toFixed(2)} across everyone, as it
          should be. Restrict to the subjects selected by their common effect (the red points) and
          r = {result.rSel.toFixed(2)}. Nothing caused anything; the association is an artefact of who got
          into the analysis, and it gets sharper, not weaker, as the sample grows.
        </Caption>
      </>
    );
  }

  if (!body) return null;

  return (
    <div className="mt-4 rounded-xl border border-violet-800/50 bg-slate-950/50 p-3">
      <div className="text-[10px] uppercase tracking-widest text-violet-300/80 font-bold mb-2">
        What actually happens
      </div>
      {body}
    </div>
  );
}
