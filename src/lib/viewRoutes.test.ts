import { describe, it, expect } from "vitest";
import { viewFromPath, pathFromView, viewHasUrl, PATH_TO_VIEW } from "./viewRoutes";

describe("viewFromPath", () => {
  it("maps every documented path to its view", () => {
    for (const [path, view] of Object.entries(PATH_TO_VIEW)) {
      expect(viewFromPath(path)).toBe(view);
    }
  });

  it("strips trailing slash before matching", () => {
    expect(viewFromPath("/teach/")).toBe("teach");
    expect(viewFromPath("/biostat-quest/")).toBe("home");
  });

  it("does NOT map / (apex) to home — apex serves the marketing landing", () => {
    expect(viewFromPath("/")).toBeNull();
  });

  it("returns null for unmapped paths", () => {
    expect(viewFromPath("/nonexistent")).toBeNull();
    expect(viewFromPath("/teach/some/nested/thing")).toBeNull();
  });
});

describe("pathFromView", () => {
  it("returns canonical path for every view that has a URL", () => {
    expect(pathFromView("home")).toBe("/biostat-quest");
    expect(pathFromView("teach")).toBe("/teach");
    expect(pathFromView("admin")).toBe("/admin");
    expect(pathFromView("diagnostic")).toBe("/diagnostic");
    expect(pathFromView("results")).toBe("/diagnostic/results");
  });

  it("returns null for transient-state views with no URL", () => {
    // play/select/result need a caseId in the URL — deferred to Phase 6.
    expect(pathFromView("play")).toBeNull();
    expect(pathFromView("select")).toBeNull();
    expect(pathFromView("result")).toBeNull();
    expect(pathFromView("onboarding")).toBeNull();
  });
});

describe("viewHasUrl", () => {
  it("true for views in the map, false otherwise", () => {
    expect(viewHasUrl("home")).toBe(true);
    expect(viewHasUrl("teach")).toBe(true);
    expect(viewHasUrl("admin")).toBe(true);
    expect(viewHasUrl("play")).toBe(false);
    expect(viewHasUrl("onboarding")).toBe(false);
  });
});

describe("path/view round-trip", () => {
  it("path → view → path is identity for every mapped path", () => {
    for (const path of Object.keys(PATH_TO_VIEW)) {
      const view = viewFromPath(path)!;
      expect(pathFromView(view)).toBe(path);
    }
  });
});
