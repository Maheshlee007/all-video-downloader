/** Extension pages may run in tabs, side panels or offscreen documents. */
export function isExtensionPage(
  sender: { id?: string; url?: string },
  extensionId: string,
): boolean {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.hostname === extensionId;
  } catch {
    return false;
  }
}
