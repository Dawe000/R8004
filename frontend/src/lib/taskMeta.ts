export const TASK_DISPATCH_META_KEY = 'r8004_task_meta';

export interface TaskDispatchMeta {
  agentId: string;
  runId: string;
  updatedAt: string;
}

type TaskDispatchMetaMap = Record<string, TaskDispatchMeta>;

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

export function upsertTaskDispatchMeta(taskId: string, meta: Omit<TaskDispatchMeta, 'updatedAt'>): void {
  const map = loadMetaMap();
  map[taskId] = {
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  saveMetaMap(map);
}

export function getTaskDispatchMeta(taskId: string): TaskDispatchMeta | null {
  const map = loadMetaMap();
  return map[taskId] || null;
}
