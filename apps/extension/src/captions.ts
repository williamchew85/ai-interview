import type { CaptionSource } from "@interview-copilot/stt";
import type { TranscriptLine, Speaker } from "@interview-copilot/shared";

/**
 * Phase 12.1-12.3: read a meeting's OWN live captions from the DOM.
 * Each adapter observes its site's caption container with a MutationObserver
 * and emits transcript lines. Selectors are resilient (multiple candidates +
 * a configurable override) because meeting DOMs change often.
 */

export interface CaptionAdapterConfig {
  /** Optional CSS selector override if the built-in ones break. */
  containerSelector?: string;
  /** Your own display name, so your captions are tagged speaker="local". */
  selfName?: string;
}

/** Decide speaker from the caption's own speaker label vs the user's name. */
function classifySpeaker(name: string | undefined, selfName?: string): Speaker {
  if (!name) return "unknown";
  if (selfName && name.trim().toLowerCase() === selfName.trim().toLowerCase()) {
    return "local";
  }
  return "remote";
}

abstract class DomCaptionSource implements CaptionSource {
  abstract readonly id: string;
  protected abstract readonly selectors: string[];
  protected observer: MutationObserver | undefined;
  protected onLine: ((line: TranscriptLine) => void) | undefined;

  constructor(protected cfg: CaptionAdapterConfig = {}) {}

  /** Each adapter parses its container into { name, text } caption rows. */
  protected abstract parse(
    container: Element,
  ): Array<{ name?: string; text: string }>;

  protected findContainer(): Element | null {
    const sels = this.cfg.containerSelector
      ? [this.cfg.containerSelector, ...this.selectors]
      : this.selectors;
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  start(onLine: (line: TranscriptLine) => void): void {
    this.onLine = onLine;
    const tick = () => {
      const container = this.findContainer();
      if (!container) return;
      for (const row of this.parse(container)) {
        if (!row.text.trim()) continue;
        this.onLine?.({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          speaker: classifySpeaker(row.name, this.cfg.selfName),
          speakerName: row.name,
          text: row.text,
          // Captions are treated as final once the mutation settles; the
          // TranscriptBuffer merges re-renders of the same evolving line.
          final: true,
          ts: Date.now(),
        });
      }
    };
    this.observer = new MutationObserver(tick);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    tick();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.onLine = undefined;
  }

  /** Is the caption container present (captions turned on)? */
  captionsPresent(): boolean {
    return this.findContainer() !== null;
  }
}

/** Google Meet live captions. */
export class MeetCaptionSource extends DomCaptionSource {
  readonly id = "meet";
  protected readonly selectors = [
    '[jsname="dsyhDe"]', // known Meet captions region
    '[aria-label*="aptions" i]',
    'div[role="region"][aria-label*="aption" i]',
  ];

  protected parse(container: Element): Array<{ name?: string; text: string }> {
    // Meet renders rows with a speaker name node + a text node.
    const rows: Array<{ name?: string; text: string }> = [];
    const items = container.querySelectorAll("div");
    // Heuristic: a caption row has a short name element followed by text.
    const nameEls = container.querySelectorAll('[class*="zs7s8d"], span');
    if (nameEls.length) {
      for (const nameEl of Array.from(nameEls)) {
        const name = nameEl.textContent?.trim();
        const textEl = nameEl.nextElementSibling ?? nameEl.parentElement;
        const text = textEl?.textContent?.trim() ?? "";
        if (text && name && text !== name) rows.push({ name, text });
      }
    }
    if (!rows.length && items.length) {
      const text = container.textContent?.trim() ?? "";
      if (text) rows.push({ text });
    }
    return rows;
  }
}

/** Microsoft Teams (web) live captions. */
export class TeamsCaptionSource extends DomCaptionSource {
  readonly id = "teams";
  protected readonly selectors = [
    '[data-tid="closed-caption-renderer-wrapper"]',
    '[data-tid="closed-captions-renderer"]',
    '[aria-label*="aptions" i]',
  ];

  protected parse(container: Element): Array<{ name?: string; text: string }> {
    const rows: Array<{ name?: string; text: string }> = [];
    const chatItems = container.querySelectorAll(
      '[data-tid="closed-caption-text"], .ui-chat__item',
    );
    for (const item of Array.from(chatItems)) {
      const name =
        item
          .querySelector('[data-tid="author"], .ui-chat__message__author')
          ?.textContent?.trim() ?? undefined;
      const text =
        item
          .querySelector('[data-tid="closed-caption-text"]')
          ?.textContent?.trim() ??
        item.textContent?.trim() ??
        "";
      if (text) rows.push({ name, text });
    }
    if (!rows.length) {
      const text = container.textContent?.trim() ?? "";
      if (text) rows.push({ text });
    }
    return rows;
  }
}

/** Phase 12.3: pick the adapter for the current tab host. */
export function detectCaptionSource(
  cfg: CaptionAdapterConfig = {},
  host: string = location.host,
): DomCaptionSource | null {
  if (host.includes("meet.google.com")) return new MeetCaptionSource(cfg);
  if (host.includes("teams.microsoft.com") || host.includes("teams.live.com")) {
    return new TeamsCaptionSource(cfg);
  }
  return null;
}
