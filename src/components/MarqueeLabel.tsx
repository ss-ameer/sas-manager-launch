import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface MarqueeLabelProps {
  children?: ReactNode;
  text?: string;
  badge?: ReactNode;
  className?: string;
  textClassName?: string;
  title?: string;
  htmlFor?: string;
  required?: boolean;
}

export const MarqueeLabel: React.FC<MarqueeLabelProps> = ({
  children,
  text,
  badge,
  className = "flex items-center justify-between h-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 min-w-0 w-full cursor-default select-none",
  textClassName = "",
  title,
  htmlFor,
  required,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [scrollDist, setScrollDist] = useState(0);

  const calculateOverflow = () => {
    if (containerRef.current && contentRef.current) {
      const cWidth = containerRef.current.clientWidth;
      const sWidth = contentRef.current.scrollWidth;
      if (sWidth > cWidth + 2) {
        setIsOverflowing(true);
        setScrollDist(sWidth - cWidth);
      } else {
        setIsOverflowing(false);
        setScrollDist(0);
      }
    }
  };

  useEffect(() => {
    calculateOverflow();
    const handleResize = () => calculateOverflow();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [text, children]);

  const rawText = text || (typeof children === 'string' ? children : undefined);
  const tooltipText = title || rawText;

  const duration = Math.max(2.5, scrollDist / 25);

  return (
    <label
      htmlFor={htmlFor}
      className={className}
      title={tooltipText}
      onMouseEnter={() => {
        calculateOverflow();
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 overflow-hidden h-full flex items-center pr-1"
      >
        <span
          ref={contentRef}
          style={
            isHovered && isOverflowing
              ? ({
                  '--scroll-dist': `-${scrollDist}px`,
                  '--marquee-duration': `${duration}s`,
                  animation: `marquee-slide-back-forth var(--marquee-duration) ease-in-out infinite`,
                } as React.CSSProperties)
              : undefined
          }
          className={`whitespace-nowrap transition-transform duration-200 inline-flex items-center ${textClassName} ${
            !isHovered && isOverflowing ? 'truncate block w-full' : ''
          }`}
        >
          {text || children}
          {required && <span className="text-rose-500 font-bold ml-0.5 shrink-0">*</span>}
        </span>
      </div>
      {badge && <div className="shrink-0 ml-1.5 flex items-center">{badge}</div>}
    </label>
  );
};
