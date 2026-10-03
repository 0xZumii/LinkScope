// Link Preview Sandbox — background service worker (Manifest V3)
//
// Two jobs:
//   1. Observe extension-originated network requests to reconstruct redirect chains.
//   2. On request, fetch a target URL and return capped, sanitizable HTML + the chain.
//
// Security notes:
//   - We only ever fetch user-visible http(s) URLs, with credentials omitted.
//   - The returned HTML is NEVER executed here; the content script sanitizes it
//     and drops it into a fully sandboxed iframe (no scripts, opaque origin).

const EXT_ORIGIN = chrome.runtime.getURL('');

const FETCH_TIMEOUT_MS = 9000;
const MAX_BODY_BYTES = 900 * 1024; // cap raw HTML we shuttle to the page
const MAX_TRACKED_REQUESTS = 64;

/** @type {Map<number, RequestRecord>} */
const chains = new Map();

// Count of in-flight preview fetches. Used as a fallback signal for identifying
// our own requests when `initiator` is not populated by Chrome.
let inFlight = 0;

/**
 * @typedef {{
 *   requestId: number,
 *   chain: string[],
 *   redirects: Array<{ from: string, to: string, statusCode: number, statusLine?: string }>,
 *   statusCode: number,
 *   finalUrl?: string,
 *   done: boolean,
 *   error?: string,
 *   startedAt: number
 * }} RequestRecord
 */

function isPreviewRequest(details) {
  if (details.initiator && details.initiator.startsWith(EXT_ORIGIN)) return true;
  // Fallback: Chrome sometimes omits `initiator` for service-worker fetches.
  return inFlight > 0 && details.tabId === -1;
}

function pruneChains() {
  if (chains.size <= MAX_TRACKED_REQUESTS) return;
  const entries = [...chains.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
  for (let i = 0; i < entries.length - MAX_TRACKED_REQUESTS; i += 1) {
    chains.delete(entries[i][0]);
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isPreviewRequest(details)) return;
    chains.set(details.requestId, {
      requestId: details.requestId,
      chain: [details.url],
      redirects: [],
      statusCode: 0,
      done: false,
      startedAt: Date.now(),
    });
    pruneChains();
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (!isPreviewRequest(details)) return;
    const rec = chains.get(details.requestId);
    if (!rec) return;
    rec.redirects.push({
      from: details.url,
      to: details.redirectUrl,
      statusCode: details.statusCode,
      statusLine: details.statusLine,
    });
    if (rec.chain[rec.chain.length - 1] !== details.redirectUrl) {
      rec.chain.push(details.redirectUrl);
    }
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isPreviewRequest(details)) return;
    const rec = chains.get(details.requestId);
    if (!rec) return;
    rec.done = true;
    rec.statusCode = details.statusCode;
    rec.finalUrl = details.url;
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!isPreviewRequest(details)) return;
    const rec = chains.get(details.requestId);
    if (!rec) return;
    rec.done = true;
    rec.error = details.error;
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

// ---------------------------------------------------------------------------
// Preview fetching
// ---------------------------------------------------------------------------

function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

async function readCapped(response, cap) {
  if (!response.body) {
    const text = await response.text();
    return text.slice(0, cap);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total >= cap) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8').decode(merged);
}

function buildChain(before, requestedUrl, finalUrl, wasRedirected) {
  const fresh = [...chains.values()]
    .filter((rec) => !before.has(rec.requestId))
    .sort((a, b) => b.chain.length - a.chain.length);

  // Prefer the chain whose root is the URL we asked for.
  const best = fresh.find((rec) => rec.chain[0] === requestedUrl) || fresh[0] || null;

  const urls = best ? [...best.chain] : [requestedUrl];
  if (finalUrl && urls[urls.length - 1] !== finalUrl) urls.push(finalUrl);

  const steps = urls.map((url, i) => {
    const redirect = best?.redirects.find((r) => r.from === url);
    let status = 0;
    if (redirect) status = redirect.statusCode;
    else if (i === urls.length - 1 && best) status = best.statusCode;
    return {
      url,
      status,
      crossOrigin: i > 0 ? !sameOrigin(urls[i - 1], url) : false,
      error: i === urls.length - 1 ? best?.error || null : null,
    };
  });

  return {
    steps,
    hopCount: Math.max(0, urls.length - 1),
    // If webRequest gave us nothing but fetch followed a redirect, we at least
    // know the endpoints even though intermediate hops are unknown.
    partial: !best && wasRedirected,
  };
}

async function handlePreview(rawUrl) {
  const requestedUrl = normalizeUrl(rawUrl);
  if (!requestedUrl) return { ok: false, error: 'Unsupported URL scheme.' };

  const before = new Set(chains.keys());
  inFlight += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response = null;
  let html = '';
  let contentType = '';
  let status = 0;
  let finalUrl = requestedUrl;
  let error = null;

  try {
    response = await fetch(requestedUrl, {
      redirect: 'follow',
      credentials: 'omit',
      // Force a network round-trip so redirect hops are actually observed.
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    status = response.status;
    finalUrl = response.url || requestedUrl;
    contentType = response.headers.get('content-type') || '';
    const renderable =
      contentType === '' ||
      /text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType);
    if (renderable) html = await readCapped(response, MAX_BODY_BYTES);
  } catch (err) {
    error = err && err.name === 'AbortError' ? 'Request timed out.' : String(err?.message || err);
  } finally {
    clearTimeout(timer);
    inFlight = Math.max(0, inFlight - 1);
  }

  // Let any trailing webRequest events settle before reading the chain.
  await new Promise((r) => setTimeout(r, 120));

  return {
    ok: !error,
    error,
    requestedUrl,
    finalUrl,
    status,
    contentType,
    redirected: Boolean(response && response.redirected),
    html,
    chain: buildChain(before, requestedUrl, finalUrl, Boolean(response && response.redirected)),
    fetchedAt: Date.now(),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'LPS_PREVIEW') {
    handlePreview(message.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

// Housekeeping so long-lived sessions don't accumulate records.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, rec] of chains) {
    if (rec.done && rec.startedAt < cutoff) chains.delete(id);
  }
}, 30_000);
