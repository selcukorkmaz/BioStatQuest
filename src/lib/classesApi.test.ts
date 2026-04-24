import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createClass,
  inviteToClass,
  listMyClasses,
  acceptInvite,
  joinByCode,
  updateMember,
  setClassArchived,
  hasAnyInstructorRole,
  getClassInsights,
  type Err,
} from "./classesApi";

// In strict:false TS, `if (!r.ok)` doesn't reliably narrow Result<T> to Err
// for property access. Use this helper at error sites to cast cleanly.
const asErr = <T,>(r: { ok: boolean }): Err => r as unknown as Err;

// Minimal localStorage shim with a Supabase-shaped auth-token row, so the
// classesApi getJwt() helper can find a JWT to attach. Recreated per-test
// to keep state from leaking between cases.
function setupAuth(jwt: string | null) {
  const store: Record<string, string> = {};
  if (jwt) {
    store["sb-test-auth-token"] = JSON.stringify({ access_token: jwt });
  }
  // happy-dom / jsdom may not be present — fall back to a hand-rolled stub.
  (globalThis as any).localStorage = {
    length: Object.keys(store).length,
    key: (i: number) => Object.keys(store)[i] || null,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  // The library checks `typeof window !== "undefined"` — provide one.
  (globalThis as any).window = globalThis;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as any;
  setupAuth("test-jwt-token");
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).localStorage;
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function err(status: number, body: unknown) {
  return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("auth header attachment", () => {
  it("attaches Authorization: Bearer <jwt> from the sb-*-auth-token row", async () => {
    fetchMock.mockResolvedValueOnce(ok({ classes: [] }));
    await listMyClasses();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-jwt-token");
  });

  it("returns ok:false with 'not signed in' when no JWT present", async () => {
    setupAuth(null);
    const r = await listMyClasses();
    expect(r.ok).toBe(false);
    expect(asErr(r).error).toBe("not signed in");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createClass", () => {
  it("POSTs to /api/classes/create with JSON body", async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: "c1", code: "ABC123", name: "Biostat 101" }));
    const r = await createClass({ name: "Biostat 101", institution_name: "Trakya" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.code).toBe("ABC123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/classes/create");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "Biostat 101", institution_name: "Trakya" });
  });

  it("propagates server-side error message on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(err(400, { error: "name required" }));
    const r = await createClass({ name: "" });
    expect(r.ok).toBe(false);
    expect(asErr(r).error).toBe("name required");
    expect(asErr(r).status).toBe(400);
  });

  it("falls back to 'HTTP <status>' when server returns no error message", async () => {
    fetchMock.mockResolvedValueOnce(err(500, {}));
    const r = await createClass({ name: "x" });
    expect(r.ok).toBe(false);
    expect(asErr(r).error).toBe("HTTP 500");
  });

  it("returns ok:false with 'network error' on fetch reject", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await createClass({ name: "x" });
    expect(r.ok).toBe(false);
    expect(asErr(r).error).toBe("ECONNREFUSED");
  });
});

describe("inviteToClass", () => {
  it("posts class_id, email, role and returns invite metadata", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      invite_id: "i1", expires_at: "2026-05-01T00:00:00Z",
      join_url: "https://biostatquest.com/join?token=xxx", email_sent: true,
    }));
    const r = await inviteToClass({ class_id: "c1", email: "s@u.edu", role: "student" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email_sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ class_id: "c1", email: "s@u.edu", role: "student" });
  });
});

describe("listMyClasses", () => {
  it("GETs /api/classes/mine and returns the typed list", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      classes: [{
        id: "c1", name: "Biostat 101", role: "instructor", subscription_status: "active",
        archived_at: null, code: "ABC123", member_count: 12,
      }],
    }));
    const r = await listMyClasses();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.classes[0].role).toBe("instructor");
      expect(r.data.classes[0].member_count).toBe(12);
    }
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});

describe("acceptInvite", () => {
  it("posts token + consent and returns class info", async () => {
    fetchMock.mockResolvedValueOnce(ok({ class_id: "c1", class_name: "Biostat 101", role: "student" }));
    const r = await acceptInvite({ token: "abc123", consent: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.class_name).toBe("Biostat 101");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "abc123", consent: true });
  });
});

describe("joinByCode", () => {
  it("posts code + consent", async () => {
    fetchMock.mockResolvedValueOnce(ok({ class_id: "c1", class_name: "Biostat 101" }));
    const r = await joinByCode({ code: "6DC45E", consent: true });
    expect(r.ok).toBe(true);
  });
});

describe("updateMember", () => {
  it("posts the action and returns the new role", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, role: "co-instructor" }));
    const r = await updateMember({ class_id: "c1", user_id: "u2", action: "promote" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.role).toBe("co-instructor");
  });

  it("propagates 403 with the server error", async () => {
    fetchMock.mockResolvedValueOnce(err(403, { error: "only instructors can manage members" }));
    const r = await updateMember({ class_id: "c1", user_id: "u2", action: "remove" });
    expect(r.ok).toBe(false);
    expect(asErr(r).error).toContain("instructors");
  });
});

describe("setClassArchived", () => {
  it("posts the boolean and returns the new archived_at timestamp", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, archived_at: "2026-04-25T00:00:00Z" }));
    const r = await setClassArchived({ class_id: "c1", archived: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.archived_at).toBeTruthy();
  });
});

describe("getClassInsights", () => {
  it("encodes class_id into the query string", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      summary: { total_members: 0, consented_members: 0, active_7d: 0, inactive_14d: 0 },
      members: [], per_method: [], per_case: [], per_member_method: [],
    }));
    await getClassInsights("c with spaces");
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe("/api/classes/insights?class_id=c%20with%20spaces");
  });
});

describe("hasAnyInstructorRole", () => {
  it("returns true when at least one membership has role instructor or co-instructor", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      classes: [
        { id: "c1", name: "X", role: "student", subscription_status: "active", archived_at: null },
        { id: "c2", name: "Y", role: "co-instructor", subscription_status: "active", archived_at: null },
      ],
    }));
    expect(await hasAnyInstructorRole()).toBe(true);
  });

  it("returns false when every membership is student-only", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      classes: [
        { id: "c1", name: "X", role: "student", subscription_status: "active", archived_at: null },
      ],
    }));
    expect(await hasAnyInstructorRole()).toBe(false);
  });

  it("returns false when listMyClasses fails (defensive default)", async () => {
    // Network failure shouldn't show the Teach tab to a non-instructor.
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await hasAnyInstructorRole()).toBe(false);
  });
});
