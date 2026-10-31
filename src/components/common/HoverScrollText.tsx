import React, { useRef, useState, useCallback } from 'react';

export interface HoverScrollTextProps {
  text?: string | null;
  children?: React.ReactNode;
  className?: string;
  title?: string;
  as?: 'span' | 'div' | 'h3' | 'h4' | 'p';
  speedPxPerSec?: number;
}

/**
 * Reusable single-line text container that stays cleanly truncated at rest
 * and smoothly scrolls horizontally on hover ONLY when its content overflows.
 */
export const HoverScrollText: React.FC<HoverScrollTextProps> = ({
  text,
  children,
  className = '',
  title,
  as: Component = 'span',
  speedPxPerSec = 55
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [offsetPx, setOffsetPx] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const handleMouseEnter = useCallback(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const overflow = inner.scrollWidth - container.clientWidth;
    if (overflow > 4) {
      setOffsetPx(overflow + 8);
      setDurationSec(Math.max(1.2, Math.min(8, overflow / speedPxPerSec)));
    } else {
      setOffsetPx(0);
      setDurationSec(0);
    }
  }, [speedPxPerSec]);

  const handleMouseLeave = useCallback(() => {
    setOffsetPx(0);
    setDurationSec(0);
  }, []);

  const displayContent = children !== undefined ? children : text;
  const resolvedTitle = title !== undefined ? title : typeof text === 'string' ? text : undefined;

  return (
    <Component
      ref={containerRef as any}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={resolvedTitle}
      className={`block overflow-hidden whitespace-nowrap min-w-0 max-w-full ${
        offsetPx === 0 ? 'text-ellipsis' : ''
      } ${className}`}
    >
      <span
        ref={innerRef}
        style={
          offsetPx > 0
            ? {
                display: 'inline-block',
                transform: `translateX(-${offsetPx}px)`,
                transition: `transform ${durationSec.toFixed(2)}s ease-in-out`
              }
            : {
                display: 'inline',
                transform: 'translateX(0)',
                transition: 'transform 0.2s ease-out'
              }
        }
      >
        {displayContent}
      </span>
    </Component>
  );
};

export default HoverScrollText;
