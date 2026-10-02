import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  title?: string;
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ content, title, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-flex items-center align-middle ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label={title || 'Information'}
        className="p-1 rounded-full text-text-dim hover:text-accent focus:text-accent focus:outline-none transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 rounded-lg bg-surface-2 border border-border text-xs text-text-main shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          {title && <div className="font-bold text-accent mb-1">{title}</div>}
          <div className="font-normal text-text-muted leading-relaxed">{content}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-border" />
        </div>
      )}
    </div>
  );
};
