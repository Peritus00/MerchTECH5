/**
 * Pending actions queue - stores failed fire-and-forget writes and replays on reconnect.
 * Used for analytics tracking, demographics, and other non-critical writes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const QUEUE_KEY = 'MERCHTECH_PENDING_ACTIONS';
const MAX_QUEUE_SIZE = 100;

export interface QueuedAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  timestamp: number;
}

async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setQueue(items: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE_SIZE)));
  } catch (e) {
    console.warn('PendingActionsQueue: Failed to persist queue', e);
  }
}

export async function enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  });
  await setQueue(queue);
}

export async function flushQueue(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      const config = {
        method: action.method,
        url: action.endpoint,
        data: action.payload,
      };
      await api.request(config);
      flushed++;
    } catch (e) {
      remaining.push(action);
    }
  }

  await setQueue(remaining);
  return flushed;
}
