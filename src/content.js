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
    mode: 'delay', // 'delay' (plain hover) | 'shift' (Shift + hover)
    delayMs: 500,
    fetchPreview: true,
  };

  // Bump this whenever the content script changes. It is shown in the panel
  // header so it's obvious which build a tab is actually running — content
  // scripts only update when the extension and the page are both reloaded.
  const BUILD = 'v0.3.1+blob';

  let settings = { ...DEFAULTS };
  try {
    if (isContextAlive()) {
      chrome.storage.sync.get(DEFAULTS, (stored) => {
        if (!isContextAlive()) return;
        settings = { ...DEFAULTS, ...stored };
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const [key, change] of Object.entries(changes)) {
          settings[key] = change.newValue;
        }
      });
    }
  } catch {
    /* storage unavailable — run with defaults */
  }

  // --- extension-context guard ---------------------------------------------
  // After the extension is reloaded/updated, content scripts already running in
  // open tabs lose their `chrome.runtime` binding. Detect that so we can show a
  // clear message instead of a raw "cannot read sendMessage" error.
  function isContextAlive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function contextLostMessage() {
    return 'This page is running an older copy of LinkScope and its connection to the extension was closed. Reload the page to reconnect.';
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
    // A fixed, full-viewport, layout-neutral container. Without an explicit size
    // the host collapses to 0x0 and clips the shadow panel inside it.
    host.style.cssText = [
      'all:initial',
      'position:fixed',
      'inset:0',
      'width:100vw',
      'height:100vh',
      'z-index:2147483647',
      'pointer-events:none', // let clicks through except on the panel itself
      'display:block',
    ].join(';');
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
    // In delay mode the user chose the delay; in shift mode react quickly
    // since the modifier already signals intent.
    const wait = settings.mode === 'shift' ? 120 : Math.max(120, settings.delayMs);
    hoverTimer = setTimeout(() => {
      if (!link.el.isConnected) return;
      // The pointer may have moved off while we waited.
      const now = linkAtPoint(pointer.x, pointer.y);
      if (settings.mode === 'delay' && now?.href !== link.href) return;
      showOverlay(link);
      loadPreview(link.href);
    }, wait);
  }

  function cancelPending() {
    clearTimeout(hoverTimer);
  }

  // --- preview request -----------------------------------------------------
  async function loadPreview(url) {
    ensureOverlay();
    const token = ++requestToken;
    setState('loading', url);

    if (!isContextAlive()) {
      renderResult({ ok: false, error: contextLostMessage() }, url);
      return;
    }

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'LPS_PREVIEW', url });
    } catch (err) {
      const message = isContextAlive()
        ? String(err?.message || err)
        : contextLostMessage();
      result = { ok: false, error: message };
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

    const sanitized = sanitizeHtml(result.html, result.finalUrl || requestedUrl);
    const finalUrl = result.finalUrl || requestedUrl;
    const readable = readableLength(sanitized);
    const meta = extractMeta(result.html, finalUrl);

    // Bot-challenge / block pages (Cloudflare "Just a moment...", similar) return
    // a 4xx with no useful content and no OpenGraph tags. Surface that clearly
    // rather than rendering a blank frame or an empty card.
    const challenge = detectChallenge(result, sanitized);
    if (challenge) {
      body.append(
        el('div', { class: 'placeholder' }, challenge.title),
        note(challenge.detail),
      );
      return;
    }

    // Client-rendered pages (X, many SPAs) serve an empty shell whose real
    // content only exists as OpenGraph metadata. Show a metadata card instead of
    // a blank frame — but only when there is actually metadata to show.
    const MIN_READABLE = 200;
    const hasMeta = Boolean(meta.title || meta.description || meta.image);
    if (readable < MIN_READABLE && hasMeta) {
      renderMetaCard(
        meta,
        finalUrl,
        'This page renders its content with JavaScript, which is disabled in the preview. Showing its summary instead.',
      );
      return;
    }

    // Little content and no metadata: explain instead of showing an empty frame.
    if (readable < MIN_READABLE) {
      body.append(
        el('div', { class: 'placeholder' }, 'No previewable content'),
        note(
          result.status
            ? `The server returned HTTP ${result.status} with very little readable content. It may block automated requests.`
            : 'The server returned very little readable content. It may require JavaScript or block automated requests.',
        ),
      );
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-frame';
    iframe.setAttribute('sandbox', ''); // no scripts, no same-origin, no forms
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('loading', 'eager');

    // Render via a blob: URL rather than srcdoc.
    //
    // Why: a srcdoc document is created inside the host page's browsing context,
    // so the host page's CSP applies to it. On sites with a strict policy that
    // blocks third-party assets, the external stylesheets/fonts/images of the
    // previewed page never load and the frame can look unstyled or blank. A
    // blob: URL loads as its own document with its own (empty) CSP, so the
    // rewritten absolute asset URLs in the sanitized HTML can load.
    //
    // A page whose content is client-rendered is handled above by the metadata
    // card, since scripts are disabled by design.
    let blobUrl = null;
    try {
      blobUrl = URL.createObjectURL(new Blob([sanitized], { type: 'text/html' }));
      iframe.src = blobUrl;
    } catch {
      // Blob unavailable — fall back to srcdoc.
      iframe.srcdoc = sanitized;
    }

    body.append(iframe);
    body.append(
      note('Rendered in a sandboxed frame with scripts, forms and frames disabled. Some styling may not load.'),
    );

    // Release the blob once the frame has loaded (keep it for buggy loaders).
    if (blobUrl) {
      iframe.addEventListener('load', () => {
        // Revoke on the next macrotask so the load is fully committed.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      }, { once: true });
    }
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

    // Resolve relative URLs so the orphaned document can load assets. Do this
    // by rewriting attributes directly: a blob: document has an opaque origin,
    // so an injected <base> is not always honoured.
    const ABSOLUTE_ATTRS = ['src', 'href', 'poster', 'srcset', 'action', 'data-src'];
    for (const node of doc.querySelectorAll('*')) {
      for (const attrName of ABSOLUTE_ATTRS) {
        if (!node.hasAttribute(attrName)) continue;
        const value = node.getAttribute(attrName);
        if (!value || value.startsWith('#') || /^(data|blob|javascript|mailto|tel):/i.test(value)) continue;
        try {
          if (attrName === 'srcset') {
            node.setAttribute(
              attrName,
              value
                .split(',')
                .map((part) => {
                  const [u, ...rest] = part.trim().split(/\s+/);
                  try {
                    return [new URL(u, baseUrl).href, ...rest].join(' ');
                  } catch {
                    return part.trim();
                  }
                })
                .join(', '),
            );
          } else {
            node.setAttribute(attrName, new URL(value, baseUrl).href);
          }
        } catch {
          /* leave malformed values alone */
        }
      }
    }

    // Belt-and-braces <base> as well.
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

  // Pull OpenGraph/Twitter metadata. This is the only useful content available
  // for client-rendered pages (X, many news sites) whose body is built by JS.
  function extractMeta(html, baseUrl) {
    const meta = { title: '', description: '', image: '', siteName: '' };
    if (!html) return meta;
    let doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
      return meta;
    }
    const content = (selector) => doc.querySelector(selector)?.getAttribute('content')?.trim() || '';

    meta.title =
      content('meta[property="og:title"]') ||
      content('meta[name="twitter:title"]') ||
      doc.querySelector('title')?.textContent?.trim() ||
      '';
    meta.description =
      content('meta[property="og:description"]') ||
      content('meta[name="description"]') ||
      content('meta[name="twitter:description"]') ||
      '';
    meta.image =
      content('meta[property="og:image"]') ||
      content('meta[name="twitter:image"]') ||
      content('meta[itemprop="image"]') ||
      '';
    meta.siteName = content('meta[property="og:site_name"]') || '';

    if (meta.image) {
      try {
        meta.image = new URL(meta.image, baseUrl).href;
      } catch {
        meta.image = '';
      }
    }
    meta.title = meta.title.slice(0, 200);
    meta.description = meta.description.slice(0, 400);
    return meta;
  }

  // Identify interstitial bot-challenge / block pages. These return 4xx with a
  // short, script-driven page and no useful metadata, so they would otherwise
  // render as a blank frame or an empty card.
  function detectChallenge(result, sanitizedHtml) {
    const status = result.status || 0;
    const text = (() => {
      try {
        const doc = new DOMParser().parseFromString(sanitizedHtml, 'text/html');
        return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      } catch {
        return '';
      }
    })();
    const raw = (result.html || '').toLowerCase();

    const cloudflare =
      text.includes('just a moment') ||
      text.includes('enable javascript and cookies to continue') ||
      text.includes('checking your browser') ||
      raw.includes('cdn-cgi/challenge-platform') ||
      raw.includes('__cf_chl');

    const otherBotWall =
      status === 403 &&
      (text.includes('attention required') ||
        text.includes('access denied') ||
        text.includes('request blocked') ||
        text.includes('verify you are human'));

    if (cloudflare) {
      return {
        title: 'Blocked by a bot check',
        detail:
          'This site is behind a Cloudflare-style challenge ("Just a moment…"). The preview cannot run the JavaScript that would clear it, so there is nothing to render. Opening the link in a tab will work normally.',
      };
    }
    if (otherBotWall) {
      return {
        title: `Blocked (HTTP ${status})`,
        detail:
          'The site refused the automated request. It may block non-browser traffic or require a login. Opening the link directly will usually work.',
      };
    }
    return null;
  }

  // Rough measure of how much readable content the sanitized page has. Used to
  // decide whether to show the rendered frame or the metadata card.
  function readableLength(html) {
    if (!html) return 0;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
      return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().length;
    } catch {
      return 0;
    }
  }

  function renderMetaCard(meta, finalUrl, reason) {
    const body = q('#lps-body');
    body.replaceChildren();

    const card = el('div', { class: 'card' });
    if (meta.image) {
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = meta.image;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());
      card.append(img);
    }
    const text = el('div', { class: 'card-text' });
    if (meta.siteName) text.append(el('div', { class: 'card-site' }, meta.siteName));
    text.append(el('div', { class: 'card-title' }, meta.title || prettyUrl(finalUrl)));
    if (meta.description) text.append(el('div', { class: 'card-desc' }, meta.description));
    card.append(text);
    body.append(card, note(reason));
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

  // Single source of truth for "which link is under the pointer". Using
  // mousemove + elementFromPoint is far more robust than mouseover on SPAs
  // (X, YouTube, etc.) where nodes are re-rendered while the pointer sits still.
  let lastHovered = null;

  function onPointerMove(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!settings.enabled) return;

    const overPanel = isPointOverPanel(e.clientX, e.clientY);
    if (overPanel) {
      lastHovered = null;
      clearTimeout(hoverTimer);
      return;
    }

    const link = linkAtPoint(e.clientX, e.clientY);
    const key = link?.href || null;

    if (key === lastHovered) return; // still on the same link (or still on none)
    lastHovered = key;

    if (!link) {
      clearTimeout(hoverTimer);
      if (activeLink && !pinned && !isPointOverPanel(e.clientX, e.clientY)) scheduleHide(180);
      return;
    }

    if (link.el === activeLink?.el) return;

    if (settings.mode === 'shift') {
      if (!e.shiftKey) return; // wait for Shift
      schedulePreview(link);
      return;
    }

    clearTimeout(hideTimer);
    schedulePreview(link);
  }

  document.addEventListener('mousemove', onPointerMove, { passive: true, capture: true });

  // Holding Shift while already hovering a link should open it immediately.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Shift' || !settings.enabled) return;
    if (settings.mode !== 'shift') return;
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

  function isPointOverPanel(x, y) {
    if (!host || !panel || panel.hasAttribute('hidden')) return false;
    const r = panel.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

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
      <div class="section-label">Redirect chain <span class="build" title="Content-script build">${BUILD}</span></div>
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
      pointer-events: auto; /* host is pointer-events:none; re-enable here */
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
    .build {
      float: right;
      font-size: 9px;
      letter-spacing: 0;
      text-transform: none;
      color: #4c5669;
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
    .body { height: 320px; max-height: 46vh; overflow: auto; border-radius: 8px; background: #0c0f15; }
    .preview-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    .card { display: block; }
    .card-img {
      display: block;
      width: 100%;
      max-height: 180px;
      object-fit: cover;
      background: #1a1f2b;
    }
    .card-text { padding: 12px 12px 4px; }
    .card-site {
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #6fd3a3;
      margin-bottom: 5px;
    }
    .card-title { font-size: 14px; font-weight: 600; line-height: 1.35; color: #e7ebf3; }
    .card-desc { margin-top: 7px; font-size: 12.5px; line-height: 1.5; color: #aab4c6; }
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
