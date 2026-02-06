import { useQuery } from '@tanstack/react-query';
import { matchAgents } from '@/lib/api/marketMaker';

export function useAgentMatching(query: string) {
  return useQuery({
    queryKey: ['agents', query],
    queryFn: () => matchAgents(query),
    enabled: query.length > 3,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}
