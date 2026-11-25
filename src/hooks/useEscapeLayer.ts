import { useEffect, useId, useRef } from 'react';
import { registerEscapeLayer } from '../utils/escapeStack';

/**
 * Registers an active modal, drawer, studio, or blocking dialog on the central
 * LIFO Escape stack while `active` is true.
 *
 * The `onEscape` callback is stored in a ref so parent re-renders never
 * unregister/re-register the layer or scramble LIFO ordering within a tier.
 * Returning `false` from `onEscape` vetoes dismissal without allowing Escape
 * to fall through to any overlay underneath.
 */
export function useEscapeLayer(
  active: boolean,
  onEscape: () => boolean | void,
  priority: number
): void {
  const layerId = useId();
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    return registerEscapeLayer({
      id: layerId,
      priority,
      onEscape: () => onEscapeRef.current()
    });
  }, [active, priority, layerId]);
}
