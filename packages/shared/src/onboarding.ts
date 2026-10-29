/**
 * Phase 21.1 — first-run onboarding "seen" flag. Pure storage helpers so the
 * web setup screen and the extension both gate the same way and it is testable.
 */
const KEY = "ic_onboarding_seen";

export function hasSeenOnboarding(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(KEY, "1");
  } catch {
    /* non-fatal */
  }
}

export function resetOnboarding(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}

/** The onboarding steps shown on the one-screen "how it works". */
export const ONBOARDING_STEPS: Array<{ title: string; body: string }> = [
  { title: "Pick your role", body: "Interviewer gets follow-up questions; Interviewee gets answer drafts." },
  { title: "Pick a provider & model", body: "Kiro, Claude or Cursor — uses your existing local CLI login, no API key." },
  { title: "Turn on captions", body: "In Google Meet / Teams-web, enable the meeting's live captions so Copilot can read the conversation." },
  { title: "Assist stays private", body: "Suggestions show only to you in the widget — never posted to the meeting." },
];
