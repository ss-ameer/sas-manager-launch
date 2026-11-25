/**
 * Central LIFO Escape Key Stack Manager.
 *
 * Coordinates Escape-key dismissal across layered drawers, full-screen studios,
 * nested modals, and blocking dialogs so pressing Escape ALWAYS targets only
 * the single topmost active overlay.
 *
 * Priority tiers mirror the canonical z-index scale in `src/constants/zIndex.ts`:
 *  - ESCAPE_PRIORITY_DRAWER (60)          -> Primary detail drawers & workspace modals
 *  - ESCAPE_PRIORITY_STUDIO (80)          -> Full-screen studios & cross-cutting drawers
 *  - ESCAPE_PRIORITY_ELEVATED_DRAWER (90) -> Elevated drawers launched over a studio/activity drawer
 *  - ESCAPE_PRIORITY_NESTED_MODAL (100)   -> Child / global entity modals
 *  - ESCAPE_PRIORITY_BLOCKING_DIALOG (120)-> Blocking confirmations, mandatory locks & media viewers
 *
 * Resolution rules:
 *  1. Highest `priority` wins; ties break by highest registration `order` (LIFO).
 *  2. Only the topmost layer's `onEscape()` callback is invoked.
 *  3. Returning `false` from `onEscape()` vetoes dismissal AND still consumes
 *     the Escape key so lower layers behind a busy or mandatory modal are NEVER closed.
 *  4. A single `window` `keydown` listener is attached lazily only while the stack
 *     is non-empty, and detached automatically when the stack empties.
 *  5. Events with `defaultPrevented === true` or `isComposing === true` are ignored
 *     so inline editors (e.g. Quick Edit inputs, @mention popovers, IME composition)
 *     keep first-chance Escape handling.
 */

export const ESCAPE_PRIORITY_DRAWER = 60;
export const ESCAPE_PRIORITY_STUDIO = 80;
export const ESCAPE_PRIORITY_ELEVATED_DRAWER = 90;
export const ESCAPE_PRIORITY_NESTED_MODAL = 100;
export const ESCAPE_PRIORITY_BLOCKING_DIALOG = 120;

export interface EscapeLayerEntry {
  id: string;
  priority: number;
  onEscape: () => boolean | void;
  order: number;
}

export interface EscapeLayerRegistration {
  id: string;
  priority: number;
  onEscape: () => boolean | void;
}

export interface EscapeDispatchResult {
  handled: boolean;
  vetoed: boolean;
  layerId: string | null;
}

let layers: EscapeLayerEntry[] = [];
let nextOrder = 0;
let isWindowListenerAttached = false;

function compareLayersTopFirst(a: EscapeLayerEntry, b: EscapeLayerEntry): number {
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return b.order - a.order;
}

function getTopLayer(): EscapeLayerEntry | undefined {
  if (layers.length === 0) return undefined;
  let top = layers[0];
  for (let i = 1; i < layers.length; i += 1) {
    if (compareLayersTopFirst(layers[i], top) < 0) {
      top = layers[i];
    }
  }
  return top;
}

function handleWindowKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (e.defaultPrevented || e.isComposing) return;

  const result = dispatchTopEscapeLayer();
  if (result.handled) {
    e.preventDefault();
  }
}

function attachWindowListenerIfNeeded(): void {
  if (isWindowListenerAttached) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', handleWindowKeyDown);
  isWindowListenerAttached = true;
}

function detachWindowListenerIfEmpty(): void {
  if (!isWindowListenerAttached || layers.length > 0) return;
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleWindowKeyDown);
  isWindowListenerAttached = false;
}

/**
 * Registers an active Escape layer and returns a cleanup function that removes it.
 * Re-registering with an existing `id` replaces the previous entry and assigns a fresh LIFO order.
 */
export function registerEscapeLayer(registration: EscapeLayerRegistration): () => void {
  const order = ++nextOrder;
  const entry: EscapeLayerEntry = {
    id: registration.id,
    priority: registration.priority,
    onEscape: registration.onEscape,
    order
  };

  layers = [...layers.filter((item) => item.id !== registration.id), entry];
  attachWindowListenerIfNeeded();

  let isUnregistered = false;
  return () => {
    if (isUnregistered) return;
    isUnregistered = true;
    layers = layers.filter((item) => item !== entry);
    detachWindowListenerIfEmpty();
  };
}

/**
 * Invokes ONLY the topmost registered Escape layer (highest priority, then LIFO order).
 * Never falls through to lower layers, even when the topmost layer returns `false` (veto).
 */
export function dispatchTopEscapeLayer(): EscapeDispatchResult {
  const top = getTopLayer();
  if (!top) {
    return { handled: false, vetoed: false, layerId: null };
  }

  const outcome = top.onEscape();
  return {
    handled: true,
    vetoed: outcome === false,
    layerId: top.id
  };
}

/**
 * Returns a read-only snapshot of active layers ordered top-to-bottom
 * (index 0 is the layer that will receive the next Escape key).
 */
export function getEscapeStackSnapshot(): ReadonlyArray<Readonly<EscapeLayerEntry>> {
  return [...layers].sort(compareLayersTopFirst).map((entry) => Object.freeze({ ...entry }));
}

/**
 * Clears all active layers and detaches the global listener (intended for unit test isolation).
 */
export function resetEscapeStackForTests(): void {
  layers = [];
  nextOrder = 0;
  detachWindowListenerIfEmpty();
}
