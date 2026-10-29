/**
 * Phase 19.1 — configurable global/overlay shortcuts. Shared model so the
 * extension (chrome commands) and the Electron overlay (globalShortcut) agree
 * on action ids and defaults. Pure + testable.
 */

export type ShortcutAction =
  | "toggle-visibility"
  | "ask"
  | "screenshot"
  | "clear"
  | "scroll-answer"
  | "nudge-up"
  | "nudge-down"
  | "nudge-left"
  | "nudge-right"
  | "toggle-shield"
  | "toggle-click-through"
  | "switch-mode";

export type ShortcutMap = Record<ShortcutAction, string>;

/** Defaults mirror MeetAssist's Ctrl/Cmd+Shift+ M/A/S/E/X/C + arrow nudge. */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  "toggle-visibility": "CommandOrControl+Shift+M",
  ask: "CommandOrControl+Shift+A",
  screenshot: "CommandOrControl+Shift+S",
  clear: "CommandOrControl+Shift+C",
  "scroll-answer": "CommandOrControl+Shift+Space",
  "nudge-up": "CommandOrControl+Shift+Up",
  "nudge-down": "CommandOrControl+Shift+Down",
  "nudge-left": "CommandOrControl+Shift+Left",
  "nudge-right": "CommandOrControl+Shift+Right",
  "toggle-shield": "CommandOrControl+Shift+E",
  "toggle-click-through": "CommandOrControl+Shift+X",
  "switch-mode": "CommandOrControl+Shift+D",
};

const KEY_RE =
  /^(CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super)(\+(CommandOrControl|Command|Control|Ctrl|Alt|Option|Shift|Super))*\+([A-Za-z0-9]|Up|Down|Left|Right|Space|Tab|Enter|Esc)$/;

/** A valid accelerator has at least one modifier + a key. */
export function isValidAccelerator(acc: string): boolean {
  return KEY_RE.test(acc.trim());
}

/** Merge a partial user override onto the defaults, dropping invalid entries. */
export function resolveShortcuts(overrides?: Partial<ShortcutMap>): ShortcutMap {
  const out: ShortcutMap = { ...DEFAULT_SHORTCUTS };
  if (!overrides) return out;
  for (const [k, v] of Object.entries(overrides) as [ShortcutAction, string][]) {
    if (v && isValidAccelerator(v)) out[k] = v;
  }
  return out;
}

/** Detect a duplicate binding (two actions on the same accelerator). */
export function findConflicts(map: ShortcutMap): Array<[string, ShortcutAction[]]> {
  const byAcc = new Map<string, ShortcutAction[]>();
  for (const [action, acc] of Object.entries(map) as [ShortcutAction, string][]) {
    const list = byAcc.get(acc) ?? [];
    list.push(action);
    byAcc.set(acc, list);
  }
  return [...byAcc.entries()].filter(([, actions]) => actions.length > 1);
}
