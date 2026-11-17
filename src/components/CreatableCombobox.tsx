import React from 'react';

export const CreatableCombobox = ({ value, onChange, onCreateOption, options, placeholder, className }: any) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || '');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt: string) => 
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );
  
  filteredOptions.sort((a: string, b: string) => {
    const aStarts = a.toLowerCase().startsWith(inputValue.toLowerCase());
    const bStarts = b.toLowerCase().startsWith(inputValue.toLowerCase());
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.localeCompare(b);
  });
  
  const trimmedInput = String(inputValue || '').trim();
  const showCreateOption =
    trimmedInput.length > 0 &&
    !options.some((opt: string) => String(opt || '').trim().toLowerCase() === trimmedInput.toLowerCase());

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && showCreateOption) {
            e.preventDefault();
            setInputValue(trimmedInput);
            if (onCreateOption) onCreateOption(trimmedInput);
            else onChange(trimmedInput);
            setIsOpen(false);
          }
        }}
        className={className}
        placeholder={placeholder}
      />
      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 && filteredOptions.map((opt: string) => (
            <div
              key={opt}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-800 text-slate-200"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(opt);
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
          {showCreateOption && (
            <div
              className="px-3 py-2 text-sm cursor-pointer bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 border-t border-slate-800"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(trimmedInput);
                if (onCreateOption) onCreateOption(trimmedInput);
                else onChange(trimmedInput);
                setIsOpen(false);
              }}
            >
              + Create "{trimmedInput}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
