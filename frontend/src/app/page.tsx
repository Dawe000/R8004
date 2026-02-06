'use client';
import { useState } from 'react';
import { TaskSearchBox } from '@/components/TaskSearchBox';
import { AgentRoutesList } from '@/components/AgentRoutesList';
import { useAgentMatching } from '@/hooks/useAgentMatching';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const [query, setQuery] = useState('');
  const { data: agents, isLoading, error } = useAgentMatching(query);

  return (
    <main className="min-h-screen flex flex-col items-center p-8 bg-background">
      <div className="max-w-4xl w-full space-y-12">
        <header className="text-center space-y-4 py-12">
          <h1 className="text-6xl font-extrabold tracking-tight text-primary">
            EthOxford <span className="text-secondary">Agents</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The intelligent intent layer for agent tasks. Describe what you need, and we'll route it to the best autonomous agent.
          </p>
        </header>

        <div className="flex justify-center">
          <TaskSearchBox onSearch={setQuery} />
        </div>

        {isLoading && (
          <div className="space-y-4 max-w-2xl mx-auto w-full">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center p-8 border border-error/20 bg-error/5 rounded-3xl text-error max-w-2xl mx-auto">
            <h3 className="font-semibold text-lg">Failed to load agents</h3>
            <p>Our market maker is currently unreachable. Please try again later.</p>
          </div>
        )}

        {agents && agents.length > 0 && (
          <div className="flex justify-center">
            <AgentRoutesList agents={agents} />
          </div>
        )}

        {agents && agents.length === 0 && (
          <div className="text-center p-12 bg-secondary/5 rounded-3xl max-w-2xl mx-auto border border-secondary/10">
            <p className="text-lg text-muted-foreground">
              No agents found matching "{query}". Try a different task description.
            </p>
          </div>
        )}

        {!query && !isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
            {[
              { title: "Sentiment Analysis", desc: "Check social media sentiment for any token." },
              { title: "Price Prediction", desc: "Get AI-driven market forecasts." },
              { title: "Yield Strategies", desc: "Find the best DeFi yield opportunities." }
            ].map((feature, i) => (
              <div key={i} className="p-6 bg-secondary/5 rounded-2xl border border-secondary/10">
                <h3 className="font-bold text-lg mb-2 text-primary">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}