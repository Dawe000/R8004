export const TASK_DISPATCH_META_KEY = 'r8004_task_meta';

export interface TaskDispatchMeta {
  agentId: string;
  runId: string;
  updatedAt: string;
}

type TaskDispatchMetaMap = Record<string, TaskDispatchMeta>;

function buildTaskMetaKey(chainId: number, taskId: string): string {
  return `${chainId}:${taskId}`;
}

function loadMetaMap(): TaskDispatchMetaMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TASK_DISPATCH_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TaskDispatchMetaMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMetaMap(map: TaskDispatchMetaMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASK_DISPATCH_META_KEY, JSON.stringify(map));
}

export function upsertTaskDispatchMeta(
  chainId: number,
  taskId: string,
  meta: Omit<TaskDispatchMeta, 'updatedAt'>
): void {
  const map = loadMetaMap();
  map[buildTaskMetaKey(chainId, taskId)] = {
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  saveMetaMap(map);
}

export function getTaskDispatchMeta(chainId: number, taskId: string): TaskDispatchMeta | null {
  const map = loadMetaMap();
  const chainScoped = map[buildTaskMetaKey(chainId, taskId)];
  if (chainScoped) return chainScoped;

  const legacy = map[taskId];
  if (legacy) {
    console.warn(
      `[taskMeta] Using legacy task dispatch metadata key for task ${taskId}; re-dispatch on chain ${chainId} to persist chain-scoped metadata.`
    );
    return legacy;
  }

  return null;
}
