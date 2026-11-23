import React, { useCallback, useRef, useState } from 'react';

export interface HoverScrollTextProps {
  /** Single-line text content to render and glide on hover when overflowing */
  text: string;
  /** Optional classes applied to the inner text element (typography, color, hover underline, etc.) */
  className?: string;
  /** Optional classes applied to the outer clipping wrapper */
  containerClassName?: string;
  /** Native tooltip text (defaults to `text`) */
  title?: string;
  /** Calm horizontal glide speed in pixels per second (default: 65) */
  speedPxPerSec?: number;
  /** Optional click handler on the text element */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** Semantic wrapper tag (defaults to 'span') */
  as?: 'span' | 'div';
}

/**
 * Reusable single-line truncated text primitive that measures overflow on hover
 * and smoothly glides horizontally (`translateX`) only when content overflows its container.
 * Uses compositor-only `transform`, respects `prefers-reduced-motion`, and adds zero idle observers.
 */
export const HoverScrollText: React.FC<HoverScrollTextProps> = ({
  text,
  className = '',
  containerClassName = '',
  title,
  speedPxPerSec = 65,
  onClick,
  as = 'span'
}) => {
  const containerRef = useRef<HTMLSpanElement | HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  const handleEnter = useCallback(() => {
    const container = containerRef.current;
    const inner = textRef.current;
    if (!container || !inner) return;

    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const overflow = Math.ceil(inner.scrollWidth - container.clientWidth);
    if (overflow > 2) {
      setOverflowPx(overflow + 8);
      setIsScrolling(true);
    } else {
      setOverflowPx(0);
      setIsScrolling(false);
    }
  }, []);

  const handleLeave = useCallback(() => {
    setIsScrolling(false);
    setOverflowPx(0);
  }, []);

  const safeSpeed = speedPxPerSec > 0 ? speedPxPerSec : 65;
  const durationSec =
    overflowPx > 0 ? Math.min(6, Math.max(0.65, overflowPx / safeSpeed)) : 0.24;

  const transformStyle: React.CSSProperties =
    isScrolling && overflowPx > 0
      ? {
          transform: `translate3d(-${overflowPx}px, 0, 0)`,
          transitionProperty: 'transform',
          transitionDuration: `${durationSec.toFixed(2)}s`,
          transitionTimingFunction: 'cubic-bezier(0.37, 0, 0.63, 1)',
          transitionDelay: '180ms',
          willChange: 'transform'
        }
      : {
          transform: 'translate3d(0, 0, 0)',
          transitionProperty: 'transform',
          transitionDuration: '240ms',
          transitionTimingFunction: 'ease-out',
          transitionDelay: '0ms'
        };

  const ContainerTag = as;

  return (
    <ContainerTag
      ref={containerRef as any}
      title={title ?? text}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={onClick}
      className={`block min-w-0 max-w-full overflow-hidden whitespace-nowrap ${containerClassName}`}
    >
      <span
        ref={textRef}
        style={transformStyle}
        className={`${
          isScrolling ? 'inline-block whitespace-nowrap' : 'block truncate'
        } ${className}`}
      >
        {text}
      </span>
    </ContainerTag>
  );
};

export default HoverScrollText;
