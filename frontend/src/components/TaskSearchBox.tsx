'use client';
import { useState } from 'react';

export function TaskSearchBox({ onSearch }: { onSearch: (query: string) => void }) {
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
        placeholder="Describe your task... (e.g. 'Find the best yield for USDC on Arbitrum and summarize the risks')"
        value={query}
        onChange={handleChange}
        className="w-full bg-transparent border-none text-xl p-0 h-24 placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none resize-none font-medium leading-relaxed"
      />
    </div>
  );
}
