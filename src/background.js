// LinkScope — background service worker (Manifest V3)
//
// Jobs:
//   1. Observe extension-originated network requests to reconstruct redirect chains.
//   2. On request, fetch a target URL and return capped, sanitizable HTML + the chain.
//   3. On request, capture a screenshot of a target URL in an offscreen tab
//      (used when the HTML has no previewable content, e.g. heavy SPAs).
//
// Security notes:
//   - We only ever fetch user-visible http(s) URLs, with credentials omitted.
//   - The returned HTML is NEVER executed here; the content script sanitizes it
//     and drops it into a fully sandboxed iframe (no scripts, opaque origin).
//   - Screenshots are taken in a temporary, background window that is always
//     closed again; no listener or storage is left behind.

const EXT_ORIGIN = chrome.runtime.getURL('');

const FETCH_TIMEOUT_MS = 9000;
const MAX_BODY_BYTES = 900 * 1024; // cap raw HTML we shuttle to the page
const MAX_TRACKED_REQUESTS = 64;

const SHOT_WINDOW_WIDTH = 1000;
const SHOT_WINDOW_HEIGHT = 720;
const SHOT_LOAD_TIMEOUT_MS = 12000;
const SHOT_SETTLE_MS = 900; // let fonts/paint settle after load
const SHOT_FOCUS_SETTLE_MS = 300; // after focusing, before capture

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

// ---------------------------------------------------------------------------
// Screenshot capture
// ---------------------------------------------------------------------------
//
// For client-rendered pages the fetched HTML is an empty shell, so a camera
// roll of the real page is more useful than the source. We open the URL in a
// small, unfocused window, wait for it to settle, capture the visible tab, and
// always tear the window down again.
//
// Notes / limits:
//   - captureVisibleTab captures the *active* tab of a window, so the tab must
//     be focused. We use a separate window to avoid disturbing the user's.
//   - The captured image includes whatever the page actually rendered, so it
//     reflects the anonymous (cookie-less) view only if the window is isolated.
//     Chrome shares the profile session, so logged-in sites may look signed in.

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureScreenshot(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: 'Unsupported URL scheme.' };

  let win = null;
  let tabId = null;
  let focusedForCapture = false;
  let previousWindowId = null;

  // Remember the window to hand focus back to if we have to steal it.
  try {
    const previous = await chrome.windows.getLastFocused();
    previousWindowId = previous?.id ?? null;
  } catch {
    /* getLastFocused can fail when no Chrome window is focused */
  }

  try {
    win = await chrome.windows.create({
      url,
      type: 'popup',
      focused: false,
      state: 'normal',
      width: SHOT_WINDOW_WIDTH,
      height: SHOT_WINDOW_HEIGHT,
      top: 0,
      left: 0,
    });
    if (!win || !win.tabs || !win.tabs.length) {
      throw new Error('Could not open a capture window.');
    }
    tabId = win.tabs[0].id;
    const windowId = win.id;

    // Wait for the tab to finish loading.
    const loaded = await waitForTabComplete(tabId, SHOT_LOAD_TIMEOUT_MS);
    if (!loaded) {
      // Still capture: partial pages beat nothing.
    }
    await sleep(SHOT_SETTLE_MS);

    const dataUrl = await captureVisible(windowId, () => {
      focusedForCapture = true;
    });

    return {
      ok: true,
      dataUrl,
      finalUrl: win.tabs[0].url || url,
      capturedAt: Date.now(),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    // Always clean up, regardless of outcome.
    try {
      if (win && win.id != null) await chrome.windows.remove(win.id);
      else if (tabId != null) await chrome.tabs.remove(tabId);
    } catch {
      /* window may already be gone */
    }
    // If we had to take focus to capture, give it back.
    if (focusedForCapture && previousWindowId != null) {
      try {
        await chrome.windows.update(previousWindowId, { focused: true });
      } catch {
        /* previous window may have been closed */
      }
    }
  }
}

// captureVisibleTab refuses to capture a window that isn't focused on some
// platforms (notably Windows), even when an explicit windowId is supplied. Try
// the quiet path first; if it fails, focus the capture window just long enough
// to grab the frame. `onFocus` lets the caller know focus must be restored.
async function captureVisible(windowId, onFocus) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (firstErr) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      onFocus?.();
      await sleep(SHOT_FOCUS_SETTLE_MS);
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (secondErr) {
      throw new Error(String(secondErr?.message || secondErr || firstErr?.message || firstErr));
    }
  }
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      resolve(result);
    };

    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    const onRemoved = (id) => {
      if (id === tabId) finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    // It may already be complete before we attached the listener.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        finish(false);
        return;
      }
      if (tab && tab.status === 'complete') finish(true);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'LPS_PREVIEW') {
    handlePreview(message.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // keep the message channel open for the async response
  }
  if (message?.type === 'LPS_SCREENSHOT') {
    captureScreenshot(message.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
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
