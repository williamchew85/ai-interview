import type { Mode, ProviderId, ProviderInfo, RoleContext } from "./index.ts";

/**
 * Framework-free setup state shared by the web setup screen (Phase 6) and the
 * extension widget. Pure functions so both surfaces agree and both are testable.
 */
export interface SetupState {
  mode: Mode;
  provider: ProviderId;
  model: string;
  context: RoleContext;
}

export const DEFAULT_SETUP: SetupState = {
  mode: "interviewer",
  provider: "kiro",
  model: "",
  context: {},
};

/** The provider the user currently has selected, if present in the list. */
export function selectedProvider(
  providers: ProviderInfo[],
  id: ProviderId,
): ProviderInfo | undefined {
  return providers.find((p) => p.id === id);
}

/** First available provider, used to auto-correct an unavailable selection. */
export function firstAvailable(providers: ProviderInfo[]): ProviderInfo | undefined {
  return providers.find((p) => p.available);
}

/**
 * Given the live provider list and a desired state, return a corrected state:
 * - if the chosen provider is unavailable, switch to the first available one;
 * - if the chosen model is not in the provider's list, fall back to the
 *   provider default (or its first model).
 */
export function reconcile(
  providers: ProviderInfo[],
  state: SetupState,
): SetupState {
  if (!providers.length) return state;
  let provider = selectedProvider(providers, state.provider);
  if (!provider || !provider.available) {
    provider = firstAvailable(providers) ?? providers[0];
  }
  const models = provider?.models ?? [];
  let model = state.model;
  if (!models.some((m) => m.id === model)) {
    model = provider?.defaultModel ?? models[0]?.id ?? "";
  }
  return { ...state, provider: provider?.id ?? state.provider, model };
}

/** Can we actually run assist with this state? */
export function canAssist(
  providers: ProviderInfo[],
  state: SetupState,
): { ok: boolean; reason?: string } {
  const p = selectedProvider(providers, state.provider);
  if (!p) return { ok: false, reason: "No provider selected." };
  if (!p.available) {
    return { ok: false, reason: p.unavailableReason ?? `${p.displayName} is unavailable.` };
  }
  if (!state.model) return { ok: false, reason: "No model selected." };
  return { ok: true };
}

const STORAGE_KEY = "ic_setup";

/** Load from a Web Storage-like object (localStorage or a stub). */
export function loadSetup(storage: Pick<Storage, "getItem">): SetupState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETUP };
    return { ...DEFAULT_SETUP, ...(JSON.parse(raw) as Partial<SetupState>) };
  } catch {
    return { ...DEFAULT_SETUP };
  }
}

export function saveSetup(
  storage: Pick<Storage, "setItem">,
  state: SetupState,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* non-fatal */
  }
}
