import React, { useCallback, useRef, useState } from 'react';

export interface HoverScrollTextProps {
  /** Single-line text content to render and glide on hover when overflowing */
  text?: string | null;
  /** Optional ReactNode children (used when `children` is provided instead of `text`) */
  children?: React.ReactNode;
  /** Optional classes applied to the text element (or outer container when `containerClassName` is omitted) */
  className?: string;
  /** Optional classes applied specifically to the outer clipping wrapper */
  containerClassName?: string;
  /** Native tooltip text (defaults to `text` when string) */
  title?: string;
  /** Calm horizontal glide speed in pixels per second (default: 65) */
  speedPxPerSec?: number;
  /** Optional click handler on the container element */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** Semantic wrapper tag (defaults to 'span') */
  as?: 'span' | 'div' | 'h3' | 'h4' | 'p';
}

/**
 * Canonical single-line truncated text primitive that measures overflow on hover/focus
 * and smoothly glides horizontally (`translate3d`) ONLY when content overflows its container.
 * Uses compositor-only `transform`, respects `prefers-reduced-motion`, and adds zero idle observers.
 */
export const HoverScrollText: React.FC<HoverScrollTextProps> = ({
  text,
  children,
  className = '',
  containerClassName = '',
  title,
  speedPxPerSec = 65,
  onClick,
  as = 'span'
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
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
  const displayContent = children !== undefined ? children : (text ?? '');
  const resolvedTitle = title !== undefined ? title : typeof text === 'string' ? text : undefined;
  const hasExplicitContainerClass = Boolean(containerClassName);

  return (
    <ContainerTag
      ref={containerRef as any}
      title={resolvedTitle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={onClick}
      className={`block min-w-0 max-w-full overflow-hidden whitespace-nowrap ${
        hasExplicitContainerClass ? containerClassName : className
      }`}
    >
      <span
        ref={textRef}
        style={transformStyle}
        className={`${
          isScrolling ? 'inline-block whitespace-nowrap' : 'block truncate'
        } ${hasExplicitContainerClass ? className : ''}`}
      >
        {displayContent}
      </span>
    </ContainerTag>
  );
};

export default HoverScrollText;
