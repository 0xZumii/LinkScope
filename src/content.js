// LinkScope — content script
//
// Hover (or Shift+hover) a link to open a preview overlay:
//   - link metadata (title, final URL, status)
//   - the redirect chain, with cross-origin hops flagged
//   - a sandboxed, script-free render of the target's HTML
//
// The overlay lives in a closed shadow root so page styles/scripts can't touch it.

(() => {
  'use strict';

  if (window.top !== window) return; // top frame only
  const HOST_ID = 'lps-root';
  if (document.getElementById(HOST_ID)) return;

  const DEFAULTS = {
    enabled: true,
    mode: 'shift', // 'shift' | 'delay'
    delayMs: 600,
    fetchPreview: true,
  };

  let settings = { ...DEFAULTS };
  try {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = { ...DEFAULTS, ...stored };
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }
    });
  } catch {
    /* storage unavailable — run with defaults */
  }

  // --- state ---------------------------------------------------------------
  let host = null;
  let shadow = null;
  let panel = null;
  let pinned = false;
  let activeLink = null;
  let hoverTimer = null;
  let hideTimer = null;
  let requestToken = 0;
  const pointer = { x: 0, y: 0 };

  // --- link detection ------------------------------------------------------
  function resolveLink(target) {
    const anchor = target instanceof Element ? target.closest('a[href]') : null;
    if (!anchor) return null;
    const href = anchor.href;
    if (!/^https?:/i.test(href)) return null;
    // Ignore in-page anchors and links that just reload the current view.
    if (href.split('#')[0] === location.href.split('#')[0] && anchor.getAttribute('href')?.startsWith('#')) {
      return null;
    }
    if (anchor.dataset.lpsSkip === '1') return null;
    return { el: anchor, href };
  }

  function linkAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? resolveLink(el) : null;
  }

  // --- overlay lifecycle ---------------------------------------------------
  function ensureOverlay() {
    if (host && host.isConnected) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-lps', 'overlay');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.append(style);

    panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('hidden', '');
    panel.innerHTML = SHELL_HTML;
    shadow.append(panel);

    panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    panel.addEventListener('mouseleave', () => {
      if (!pinned) scheduleHide(220);
    });

    (document.body || document.documentElement).appendChild(host);
    wirePanelEvents();
  }

  function destroyOverlay() {
    if (host) host.remove();
    host = null;
    shadow = null;
    panel = null;
    pinned = false;
    activeLink = null;
  }

  function scheduleHide(ms) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!pinned) destroyOverlay();
    }, ms);
  }

  function showOverlay(link) {
    ensureOverlay();
    activeLink = link;

    const rect = link.el.getBoundingClientRect();
    const margin = 10;

    // Measure while laid out but invisible, so the fit test uses real sizes.
    panel.classList.add('measuring');
    panel.removeAttribute('hidden');
    const width = panel.offsetWidth || 480;
    const height = panel.offsetHeight || 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = Math.min(Math.max(rect.left, margin), vw - width - margin);
    let top = rect.bottom + margin;
    if (top + height > vh - margin) {
      const above = rect.top - margin - height;
      top = above > margin ? above : Math.max(margin, vh - height - margin);
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.classList.remove('measuring');
    pinned = false;
    setPinUI();
  }

  function schedulePreview(link) {
    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);
    hoverTimer = setTimeout(() => {
      if (!link.el.isConnected) return;
      showOverlay(link);
      loadPreview(link.href);
    }, 130);
  }

  function cancelPending() {
    clearTimeout(hoverTimer);
  }

  // --- preview request -----------------------------------------------------
  async function loadPreview(url) {
    ensureOverlay();
    const token = ++requestToken;
    setState('loading', url);

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'LPS_PREVIEW', url });
    } catch (err) {
      result = { ok: false, error: String(err?.message || err) };
    }
    if (token !== requestToken || !panel) return; // a newer request won
    renderResult(result, url);
  }

  // --- rendering -----------------------------------------------------------
  function setState(state, url) {
    panel.dataset.state = state;
    q('#lps-requested').textContent = prettyUrl(url);
    q('#lps-requested').title = url;
    q('#lps-verdict').textContent = state === 'loading' ? 'Checking…' : '';
    q('#lps-verdict').className = 'verdict';
    q('#lps-title').textContent = 'Loading preview…';
    q('#lps-final').textContent = '';
    q('#lps-chain').replaceChildren(chainRow('Fetching redirects…'));
    q('#lps-body').replaceChildren();
    q('#lps-body').append(el('div', { class: 'placeholder' }, 'Resolving…'));
    q('#lps-open').href = url;
  }

  function renderResult(result, requestedUrl) {
    const ok = result && result.ok;
    const finalUrl = result?.finalUrl || requestedUrl;
    const redirected = ok && (result?.chain?.hopCount > 0 || result?.redirected);

    q('#lps-requested').textContent = prettyUrl(requestedUrl);
    q('#lps-requested').title = requestedUrl;
    q('#lps-final').textContent = redirected ? `→ ${prettyUrl(finalUrl)}` : '';
    q('#lps-final').title = finalUrl;
    q('#lps-open').href = finalUrl;

    // Verdict badge
    const verdict = q('#lps-verdict');
    if (!ok) {
      verdict.textContent = result?.error || 'Failed';
      verdict.className = 'verdict bad';
    } else if (redirected) {
      verdict.textContent = `${result.chain.hopCount} redirect${result.chain.hopCount === 1 ? '' : 's'}`;
      verdict.className = 'verdict warn';
    } else {
      verdict.textContent = result.status ? `HTTP ${result.status}` : 'Direct';
      verdict.className = 'verdict good';
    }

    // Title from the fetched HTML (parsed inertly).
    q('#lps-title').textContent = ok ? extractTitle(result.html) || prettyUrl(finalUrl) : prettyUrl(requestedUrl);

    // Redirect chain
    renderChain(result?.chain, requestedUrl, finalUrl, ok);

    // Body
    renderBody(result, requestedUrl, ok);
  }

  function renderChain(chain, requestedUrl, finalUrl, ok) {
    const container = q('#lps-chain');
    container.replaceChildren();
    if (!chain || !chain.steps?.length) {
      container.append(chainRow(prettyUrl(requestedUrl)));
      return;
    }
    if (chain.partial) {
      container.append(chainRow('Intermediate hops unavailable — endpoints shown.'));
    }
    chain.steps.forEach((step, i) => {
      const row = el('div', { class: 'hop' + (step.crossOrigin ? ' cross' : '') });
      row.append(el('span', { class: 'hop-num' }, String(i)));
      const status = el(
        'span',
        { class: 'hop-status ' + statusClass(step.status) },
        step.status ? String(step.status) : '—',
      );
      const urlEl = el('span', { class: 'hop-url', title: step.url }, prettyUrl(step.url));
      row.append(status, urlEl);
      if (step.crossOrigin) row.append(el('span', { class: 'hop-tag' }, 'new host'));
      if (step.error) row.append(el('span', { class: 'hop-tag bad' }, step.error));
      container.append(row);
    });
  }

  function renderBody(result, requestedUrl, ok) {
    const body = q('#lps-body');
    body.replaceChildren();

    if (!ok) {
      body.append(
        el('div', { class: 'placeholder' }, result?.error || 'Could not fetch this link.'),
        note('Preview blocked or unreachable. The link may require authentication, block automated requests, or be offline.'),
      );
      return;
    }

    if (!settings.fetchPreview) {
      body.append(note('Page rendering is disabled in settings. Link and redirect info is still shown.'));
      return;
    }

    const type = result.contentType || '';
    if (!result.html) {
      body.append(note(type ? `Not a renderable page (${escapeText(type)}).` : 'No page content returned.'));
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-frame';
    iframe.setAttribute('sandbox', ''); // no scripts, no same-origin, no forms
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('loading', 'lazy');
    iframe.srcdoc = sanitizeHtml(result.html, result.finalUrl || requestedUrl);
    body.append(iframe);
    body.append(
      note('Rendered in a sandboxed frame with scripts, forms and frames disabled. Some styling may not load.'),
    );
  }

  // --- DOM helpers ---------------------------------------------------------
  function q(selector) {
    return panel.querySelector(selector);
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  function note(text) {
    return el('div', { class: 'note' }, text);
  }

  function chainRow(text) {
    return el('div', { class: 'hop muted' }, text);
  }

  function wirePanelEvents() {
    q('#lps-close').addEventListener('click', () => destroyOverlay());
    q('#lps-pin').addEventListener('click', () => {
      pinned = !pinned;
      setPinUI();
    });
    q('#lps-copy').addEventListener('click', async (event) => {
      const url = q('#lps-open').href;
      try {
        await navigator.clipboard.writeText(url);
        event.currentTarget.textContent = 'Copied';
        setTimeout(() => {
          if (event.currentTarget) event.currentTarget.textContent = 'Copy URL';
        }, 1200);
      } catch {
        /* clipboard blocked */
      }
    });
  }

  function setPinUI() {
    const btn = q('#lps-pin');
    if (!btn) return;
    btn.textContent = pinned ? 'Unpin' : 'Pin';
    btn.classList.toggle('active', pinned);
  }

  // --- sanitizer -----------------------------------------------------------
  // Parses with DOMParser (inert — no script execution), strips anything active,
  // resolves relative URLs against the final URL, then returns a string for the
  // sandboxed iframe's srcdoc.
  function sanitizeHtml(rawHtml, baseUrl) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    } catch {
      return '<!doctype html><title>Preview</title><p>Could not parse page.</p>';
    }

    doc
      .querySelectorAll('script, noscript, iframe, frame, frameset, object, embed, applet, form, base, meta[http-equiv="refresh"], link[rel="preload"], link[rel="prefetch"]')
      .forEach((node) => node.remove());

    for (const node of doc.querySelectorAll('*')) {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
        } else if (name === 'srcdoc') {
          node.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && /^\s*(javascript|data):/i.test(attr.value)) {
          node.removeAttribute(attr.name);
        } else if (name === 'style' && /expression\s*\(/i.test(attr.value)) {
          node.removeAttribute(attr.name);
        }
      }
    }

    // Resolve relative URLs so the orphaned document can load assets.
    const base = doc.createElement('base');
    base.href = baseUrl;
    doc.head.prepend(base);

    // Disable link navigation inside the preview (clicks do nothing).
    const guard = doc.createElement('style');
    guard.textContent = 'a{pointer-events:none;cursor:default!important}';
    doc.head.append(guard);

    return `<!doctype html>${doc.documentElement.outerHTML}`;
  }

  function extractTitle(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = doc.querySelector('title')?.textContent?.trim();
      if (title) return title.slice(0, 200);
      const og = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
      return og ? og.slice(0, 200) : '';
    } catch {
      return '';
    }
  }

  // --- formatting ----------------------------------------------------------
  function prettyUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname === '/' ? '' : u.pathname;
      return `${u.host}${path}${u.search}`.slice(0, 160);
    } catch {
      return url.slice(0, 160);
    }
  }

  function statusClass(status) {
    if (!status) return 'muted';
    if (status >= 200 && status < 300) return 'good';
    if (status >= 300 && status < 400) return 'warn';
    return 'bad';
  }

  function escapeText(value) {
    return String(value).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  }

  // --- global listeners ----------------------------------------------------
  document.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true, capture: true });

  document.addEventListener('mouseover', (e) => {
    if (!settings.enabled) return;
    const link = resolveLink(e.target);
    if (!link || link.el === activeLink?.el) return;

    if (settings.mode === 'shift') {
      if (!e.shiftKey) return;
      schedulePreview(link); // brief confirm delay to avoid flicker while moving
      return;
    }

    // Delay mode: open after the pointer rests on the link.
    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);
    hoverTimer = setTimeout(() => {
      if (link.el.isConnected) {
        showOverlay(link);
        loadPreview(link.href);
      }
    }, settings.delayMs);
  }, true);

  document.addEventListener('mouseout', (e) => {
    const link = resolveLink(e.target);
    if (!link) return;
    if (link.el === activeLink?.el) {
      cancelPending();
      if (!pinned) scheduleHide(200);
    } else {
      cancelPending();
    }
  }, true);

  // Shift pressed while already hovering a link.
  document.addEventListener('keydown', (e) => {
    if (!settings.enabled || e.key !== 'Shift' || settings.mode !== 'shift') return;
    if (panel && !panel.hasAttribute('hidden')) return;
    const link = linkAtPoint(pointer.x, pointer.y);
    if (link) {
      showOverlay(link);
      loadPreview(link.href);
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hasAttribute('hidden')) {
      destroyOverlay();
    }
  }, true);

  // Hide stale previews when the page moves underneath them.
  window.addEventListener('scroll', () => {
    if (panel && !pinned && !panel.hasAttribute('hidden')) scheduleHide(120);
  }, { passive: true, capture: true });

  // --- static markup -------------------------------------------------------
  const SHELL_HTML = `
    <div class="header">
      <div class="titles">
        <div class="title" id="lps-title"></div>
        <div class="requested" id="lps-requested"></div>
        <div class="final" id="lps-final"></div>
      </div>
      <span class="verdict" id="lps-verdict"></span>
      <div class="actions">
        <button id="lps-pin" title="Keep this preview open">Pin</button>
        <button id="lps-copy" title="Copy final URL">Copy URL</button>
        <a id="lps-open" target="_blank" rel="noopener noreferrer nofollow" title="Open in a new tab">Open</a>
        <button id="lps-close" title="Close (Esc)">&#10005;</button>
      </div>
    </div>
    <div class="section">
      <div class="section-label">Redirect chain</div>
      <div class="chain" id="lps-chain"></div>
    </div>
    <div class="section body-section">
      <div class="section-label">Sandboxed preview</div>
      <div class="body" id="lps-body"></div>
    </div>
  `;

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel {
      position: fixed;
      width: 480px;
      max-width: calc(100vw - 20px);
      background: #12151c;
      color: #e7ebf3;
      border: 1px solid #2b3242;
      border-radius: 12px;
      box-shadow: 0 18px 50px rgba(0,0,0,.55);
      font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .panel[hidden] { display: none; }
    /* Laid out for measurement, but invisible. */
    .panel.measuring { visibility: hidden; pointer-events: none; }
    .header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      background: #171b24;
      border-bottom: 1px solid #262d3d;
    }
    .titles { min-width: 0; flex: 1; }
    .title {
      font-weight: 600;
      font-size: 13.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .requested, .final {
      font-size: 11.5px;
      color: #8b96ab;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .final { color: #6fd3a3; }
    .verdict {
      flex: none;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: #232a38;
      color: #aeb8cc;
      white-space: nowrap;
    }
    .verdict.good { background: #12351f; color: #6fd3a3; }
    .verdict.warn { background: #3a2f14; color: #f0c15c; }
    .verdict.bad { background: #3a1c1c; color: #f08c8c; }
    .actions { display: flex; align-items: center; gap: 4px; flex: none; }
    .actions button, .actions a {
      font: inherit;
      font-size: 11.5px;
      color: #cbd4e4;
      background: #222a38;
      border: 1px solid #303848;
      border-radius: 7px;
      padding: 4px 8px;
      cursor: pointer;
      text-decoration: none;
    }
    .actions button:hover, .actions a:hover { background: #2b3446; }
    .actions button.active { background: #2f4a3a; border-color: #3f6b52; color: #a9e8c6; }
    .section { padding: 9px 12px; border-bottom: 1px solid #202634; }
    .section:last-child { border-bottom: none; }
    .section-label {
      font-size: 10px;
      letter-spacing: .09em;
      text-transform: uppercase;
      color: #6d7789;
      margin-bottom: 6px;
    }
    .chain { display: flex; flex-direction: column; gap: 3px; max-height: 132px; overflow: auto; }
    .hop { display: flex; align-items: center; gap: 7px; font-size: 12px; }
    .hop.muted { color: #7f8a9e; }
    .hop-num {
      flex: none;
      width: 16px; height: 16px;
      display: grid; place-items: center;
      font-size: 9.5px;
      border-radius: 50%;
      background: #2a3346;
      color: #94a2ba;
    }
    .hop-status {
      flex: none;
      font-size: 10.5px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 5px;
      background: #242c3b;
      color: #9aa6bb;
    }
    .hop-status.good { color: #6fd3a3; }
    .hop-status.warn { color: #f0c15c; }
    .hop-status.bad { color: #f08c8c; }
    .hop-url { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hop.cross .hop-url { color: #f0c15c; }
    .hop-tag {
      flex: none;
      font-size: 9.5px;
      padding: 1px 5px;
      border-radius: 5px;
      background: #3a2f14;
      color: #f0c15c;
    }
    .hop-tag.bad { background: #3a1c1c; color: #f08c8c; }
    .body-section { padding-bottom: 10px; }
    .body { height: 320px; max-height: 46vh; overflow: hidden; border-radius: 8px; background: #0c0f15; }
    .preview-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .placeholder {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 16px;
      text-align: center;
      color: #7f8a9e;
    }
    .note { font-size: 11px; color: #6d7789; padding: 6px 2px; }
  `;

  // Expose a tiny test hook for manual debugging in the console.
  window.__lps = { sanitizeHtml: (html, base) => sanitizeHtml(html, base) };
})();
