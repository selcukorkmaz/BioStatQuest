// @vitest-environment jsdom
//
// Rendering contract for the predict-then-see panel. The engine is tested
// separately in src/lib/simulate.test.ts; what matters here is that each
// simulation kind actually draws something, that the numbers on screen are the
// numbers the simulation produced, and that the caption tells the learner the
// right story about their own prediction.

import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SimulationReveal } from "./SimulationReveal";
import { runSimulation, type SimSpec } from "../lib/simulate";

afterEach(() => cleanup());

const shapes = (container: HTMLElement) => ({
  svgs: container.querySelectorAll("svg[role='img']").length,
  rects: container.querySelectorAll("rect").length,
  lines: container.querySelectorAll("line").length,
  circles: container.querySelectorAll("circle").length,
});

describe("SimulationReveal — clt", () => {
  const spec: SimSpec = { kind: "clt", seed: 4242, population: "skewed", n: 200, reps: 400 };

  it("draws both histograms and labels which is which", () => {
    const { container } = render(<SimulationReveal spec={spec} />);
    const s = shapes(container);
    expect(s.svgs).toBe(2);
    expect(s.rects).toBe(52); // 26 bins per panel
    expect(screen.getByLabelText(/Individual values \(skewed\)/)).toBeTruthy();
    expect(screen.getByLabelText(/Means of samples of n = 200/)).toBeTruthy();
  });

  it("shows the numbers the simulation actually produced", () => {
    const r = runSimulation(spec);
    if (r.kind !== "clt") throw new Error("wrong kind");
    const { container } = render(<SimulationReveal spec={spec} />);
    const text = container.textContent ?? "";
    expect(text).toContain(r.popSd.toFixed(2));
    expect(text).toContain(r.meanSd.toFixed(3));
    expect(text).toContain(r.predictedSe.toFixed(3));
  });

  it("says the means have settled at large n and have not at small n", () => {
    const big = render(<SimulationReveal spec={spec} />);
    expect(big.container.textContent).toMatch(/already close to symmetric/);
    cleanup();
    const small = render(<SimulationReveal spec={{ ...spec, n: 5 } as SimSpec} />);
    expect(small.container.textContent).toMatch(/still visibly skewed/);
  });
});

describe("SimulationReveal — ci_coverage", () => {
  const spec: SimSpec = { kind: "ci_coverage", seed: 77, n: 30, reps: 100, mu: 120, sigma: 15 };

  it("draws one line per interval plus the true-mean marker", () => {
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(shapes(container).lines).toBe(101);
  });

  it("reports the miss count the simulation produced, and marks the misses in red", () => {
    const r = runSimulation(spec);
    if (r.kind !== "ci_coverage") throw new Error("wrong kind");
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(container.textContent).toContain(String(r.missed));
    const red = container.querySelectorAll("line[stroke='#f43f5e']").length;
    expect(red, "one red line per missing interval").toBe(r.missed);
  });

  it("tells the learner that a miss is not a mistake", () => {
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(container.textContent).toMatch(/is what "95% confidence" MEANS/);
  });
});

describe("SimulationReveal — multiplicity", () => {
  const spec: SimSpec = { kind: "multiplicity", seed: 9, m: 40, alpha: 0.05 };

  it("draws one dot per test and highlights the false positives", () => {
    const r = runSimulation(spec);
    if (r.kind !== "multiplicity") throw new Error("wrong kind");
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(shapes(container).circles).toBe(40);
    expect(container.querySelectorAll("circle[fill='#f43f5e']").length).toBe(r.hits);
    expect(container.textContent).toContain(String(r.hits));
  });

  it("states plainly that every null in the picture is true", () => {
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(container.textContent).toMatch(/there is no effect anywhere in this\s+simulation/);
  });
});

describe("SimulationReveal — collider", () => {
  const spec: SimSpec = { kind: "collider", seed: 31, n: 400 };

  it("plots every subject and distinguishes the conditioned-on subset", () => {
    const r = runSimulation(spec);
    if (r.kind !== "collider") throw new Error("wrong kind");
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(shapes(container).circles).toBe(400);
    expect(container.querySelectorAll("circle[fill='#f43f5e']").length).toBe(r.selectedCount);
  });

  it("shows both correlations, so the manufactured one is visible next to the real one", () => {
    const r = runSimulation(spec);
    if (r.kind !== "collider") throw new Error("wrong kind");
    const { container } = render(<SimulationReveal spec={spec} />);
    expect(container.textContent).toContain(r.rAll.toFixed(2));
    expect(container.textContent).toContain(r.rSel.toFixed(2));
    expect(container.textContent).toMatch(/generated INDEPENDENTLY/);
  });
});

describe("SimulationReveal — shared shell", () => {
  it("always announces itself as a post-answer reveal", () => {
    const { container } = render(<SimulationReveal spec={{ kind: "collider", seed: 1, n: 100 }} />);
    expect(container.textContent).toMatch(/^What actually happens/);
  });

  it("renders nothing for an unrecognised spec rather than crashing the question", () => {
    const { container } = render(<SimulationReveal spec={{ kind: "nope" } as unknown as SimSpec} />);
    expect(container.firstChild).toBeNull();
  });
});
