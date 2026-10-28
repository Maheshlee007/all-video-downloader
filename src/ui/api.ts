import type { Request, Snapshot } from '../core/types';
export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
export async function request<T>(message: Request): Promise<T> {
  if (!isExtension) {
    if (message.type === 'snapshot') return { candidates: [], jobs: [] } as T;
    throw new Error('Load the built extension in Chrome to use media detection and downloads.');
  }
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension did not respond.');
  return response.value;
}
export async function grant(url: string) {
  if (!isExtension) return;
  const origin = new URL(url).origin + '/*';
  // Call directly from a click handler to preserve Chrome's user gesture.
  if (!(await chrome.permissions.request({ origins: [origin] })))
    throw new Error('Site access was declined. You can try again when you are ready.');
}
export async function activeTab() {
  if (!isExtension) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}
export const empty: Snapshot = { candidates: [], jobs: [] };
