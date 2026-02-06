'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function TaskSearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Describe your task... (e.g., 'What's the sentiment on $BTC today?')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 h-14 text-lg rounded-3xl"
        />
      </div>
    </form>
  );
}
