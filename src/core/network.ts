import { safeUrl } from './url';
export async function mediaFetch(
  input: string,
  init: RequestInit = {},
  limit = 8 * 1024 * 1024,
): Promise<{ data: Uint8Array; url: string; mime: string }> {
  const url = safeUrl(input);
  const controller = new AbortController();
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () => controller.abort(new Error('Request timed out after 45 seconds.')),
    45000,
  );
  try {
    // Redirects are refused: never follow an unvalidated target into a private network.
    const response = await fetch(url, {
      ...init,
      signal,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok)
      throw new Error(
        `HTTP ${response.status}: media is unavailable or requires site authentication.`,
      );
    if (init.headers && new Headers(init.headers).has('Range') && response.status !== 206)
      throw new Error('The server ignored a required byte-range request.');
    const length = Number(response.headers.get('content-length'));
    if (length > limit) throw new Error('Resource exceeds the supported size limit.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response body.');
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) throw new Error('Resource exceeds the supported size limit.');
        parts.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    const data = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      data.set(p, offset);
      offset += p.length;
    }
    return { data, url: response.url || url, mime: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}
