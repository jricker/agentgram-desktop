// Design system debug toggle — press ⌘⇧D (or Ctrl+Shift+D) to swap every
// tokenized color for a garish distinctive value. Anything still looking
// normal after the toggle is NOT going through the design system — hunt it
// down and migrate it.
//
// State persists in localStorage under "agentgram:ds-debug".

const STORAGE_KEY = "agentgram:ds-debug";
const CLASS_NAME = "debug-tokens";

export function isDesignSystemDebugOn(): boolean {
  return document.documentElement.classList.contains(CLASS_NAME);
}

export function setDesignSystemDebug(on: boolean): void {
  document.documentElement.classList.toggle(CLASS_NAME, on);
  if (on) localStorage.setItem(STORAGE_KEY, "1");
  else localStorage.removeItem(STORAGE_KEY);
}

export function toggleDesignSystemDebug(): void {
  setDesignSystemDebug(!isDesignSystemDebugOn());
}

/** Call once at app start (before first render). Restores saved state and
 *  registers the ⌘⇧D / Ctrl+Shift+D global shortcut. */
export function initDesignSystemDebug(): void {
  if (localStorage.getItem(STORAGE_KEY) === "1") {
    document.documentElement.classList.add(CLASS_NAME);
  }
  window.addEventListener("keydown", (e) => {
    // Using e.code (physical key) so the shortcut works on non-US layouts
    // where e.key may map to a different character.
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.code === "KeyD") {
      e.preventDefault();
      toggleDesignSystemDebug();
      console.log(`[design-system] debug tokens: ${isDesignSystemDebugOn() ? "ON" : "OFF"}`);
    }
  });
}
