'use client';
import { useState } from 'react';

interface TaskSearchBoxProps {
  onSearch: (query: string) => void;
  readOnly?: boolean;
  expanded?: boolean;
}

export function TaskSearchBox({ onSearch, readOnly = false, expanded = false }: TaskSearchBoxProps) {
  const [query, setQuery] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setQuery(val);
    // Debounce or just pass up on blur/submit? For now, let's keep it simple.
    // The parent might expect 'onSearch' to be triggered. 
    // Since we removed the form submit, we can trigger onSearch on change or blur.
    // For this UI, let's just update local state and let the parent access it 
    // (Note: The current parent implementation expects onSearch to be called to update ITS state).
    onSearch(val); 
  };

  return (
    <div className="w-full">
      <textarea
        placeholder="Describe your task... (e.g. 'Find me an agent for market analysis')"
        value={query}
        onChange={handleChange}
        readOnly={readOnly}
        className={`w-full bg-transparent border-none text-xl p-0 ${expanded ? 'h-full min-h-[220px]' : 'h-24'} placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none resize-none font-medium leading-relaxed ${
          readOnly ? 'cursor-not-allowed opacity-70' : ''
        }`}
      />
    </div>
  );
}
