import { create } from 'zustand';
import type { Snapshot } from '../core/types';
import { empty, request } from './api';
export const useStore = create<Snapshot & { refresh: () => Promise<void> }>((set) => ({
  ...empty,
  refresh: async () => set(await request<Snapshot>({ type: 'snapshot' })),
}));
