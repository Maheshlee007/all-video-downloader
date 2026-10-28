import { describe, expect, it } from 'vitest';
import { isExtensionPage } from '../src/core/messages';
const id = 'abcdefghijklmnopabcdefghijklmnop';
describe('extension message authorization', () => {
  it.each(['index.html', 'offscreen.html'])(
    'allows the extension page %s even when opened in a tab',
    (path) => {
      const sender = { id, url: `chrome-extension://${id}/${path}`, tab: { id: 42 } };
      expect(isExtensionPage(sender, id)).toBe(true);
    },
  );
  it('allows an extension side panel without a tab', () => {
    expect(isExtensionPage({ id, url: `chrome-extension://${id}/index.html` }, id)).toBe(true);
  });
  it.each([
    { id, url: 'https://example.com/page' },
    { id: 'another-extension', url: `chrome-extension://${id}/index.html` },
    { id, url: 'chrome-extension://another-extension/index.html' },
    { id, url: `https://${id}/index.html` },
    { id },
    { id, url: 'invalid' },
  ])('rejects a webpage, foreign extension or missing origin: %j', (sender) => {
    expect(isExtensionPage(sender, id)).toBe(false);
  });
});
