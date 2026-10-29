import { test, expect, describe } from "bun:test";
import {
  DEFAULT_SHORTCUTS,
  isValidAccelerator,
  resolveShortcuts,
  findConflicts,
} from "@interview-copilot/shared";

describe("shortcuts model (Phase 19.1)", () => {
  test("defaults are all valid accelerators", () => {
    for (const acc of Object.values(DEFAULT_SHORTCUTS)) {
      expect(isValidAccelerator(acc)).toBe(true);
    }
  });
  test("rejects a bare key with no modifier", () => {
    expect(isValidAccelerator("A")).toBe(false);
    expect(isValidAccelerator("CommandOrControl+Shift+A")).toBe(true);
  });
  test("resolveShortcuts keeps valid overrides, drops invalid", () => {
    const m = resolveShortcuts({ ask: "Alt+Shift+Q", clear: "notvalid" });
    expect(m.ask).toBe("Alt+Shift+Q");
    expect(m.clear).toBe(DEFAULT_SHORTCUTS.clear); // invalid override ignored
  });
  test("findConflicts detects a duplicate binding", () => {
    const m = resolveShortcuts({ ask: "CommandOrControl+Shift+M" }); // same as toggle-visibility
    const conflicts = findConflicts(m);
    expect(conflicts.length).toBeGreaterThan(0);
  });
  test("no conflicts in the defaults", () => {
    expect(findConflicts(DEFAULT_SHORTCUTS).length).toBe(0);
  });
});
