# LinkScope

A Manifest V3 Chrome extension: **hover a link to preview it in a sandboxed,
script-free frame, and see the redirect chain before you click.**

<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="LinkScope logo" />
</p>

## Features

- **Redirect chain inspection** — every hop is listed with its HTTP status and
  cross-origin hops are highlighted, so you can spot shorteners, trackers and
  silent redirects to a different domain.
- **Sandboxed rendering** — the target page's HTML is fetched by the background
  worker, stripped of scripts/forms/frames/event handlers, and rendered in an
  `<iframe sandbox="">` (blob URL, own origin) with scripts and same-origin
  access disabled.
- **Summary-card fallback** — if the page's real content is JavaScript-rendered
  (X, many SPAs), a card built from its OpenGraph metadata is shown instead of a
  blank frame.
- **Screenshot fallback** — if there is neither renderable HTML nor metadata, the
  page is loaded in a temporary background tab, photographed, and the tab is
  closed. Shows how a JS-heavy page actually looks.
- **Per-site memory** — remembers whether a host needed a summary card or a
  screenshot, so a known site renders the same way instead of being re-guessed
  on every hover. Clearable from the popup.
- **Bot-wall detection** — Cloudflare-style "Just a moment…" interstitials are
  recognised and explained instead of appearing as a blank frame.
- **Two trigger modes** — plain `hover` (default) with a configurable delay, or
  `Shift + hover` if you prefer an explicit modifier.
- **No credentials for the preview fetch** — the sandbox fetch uses
  `credentials: 'omit'`, so it never pulls your logged-in session into the preview.
- **Zero build step** — plain JS/CSS, load it unpacked.

## How a link is rendered

The target's HTML is fetched by the background worker and sanitized, then one of
**four** representations is chosen. Hard signals are checked first, then whether
there is real content to show, and only then per-site memory:

1. **Bot-wall notice.** A Cloudflare-style interstitial ("Just a moment…", an
   otherwise empty 4xx shell) is recognised and explained instead of being shown
   as a blank frame.
2. **Sandboxed frame.** If the page has readable HTML — or looks like a sign-in
   page — its content renders in an `<iframe sandbox="">` with scripts, forms and
   frames disabled. Login pages always frame, so the sandbox warning is visible;
   forms cannot submit and the destination sees nothing you type.
3. **Summary card.** A client-rendered shell (X, many SPAs) has little readable
   HTML but usually carries OpenGraph tags. Those become a title + description +
   image card rather than a blank frame.
4. **Screenshot.** A shell with no usable metadata is loaded in a temporary
   background tab, photographed, and the tab closed — so JS-heavy pages still
   show how they actually look.

### Why a `blob:` URL instead of `srcdoc`

The frame is populated by writing the sanitized HTML to a `blob:` URL and using
that as the iframe `src`, rather than setting `srcdoc`. A `srcdoc` document is
created inside the host page's browsing context, so the **host page's CSP applies
to it** — and a strict policy that blocks third-party assets stops the previewed
page's own stylesheets, fonts and images from loading, leaving it unstyled or
blank. A `blob:` URL loads as its own document with its own (empty) CSP, so the
rewritten absolute asset URLs can load. `srcdoc` is kept only as a fallback for
when `Blob`/`URL.createObjectURL` is unavailable.

### Per-site memory

The card-vs-screenshot choice is the only genuinely ambiguous one, so that is
where LinkScope learns. It remembers which of the two worked for each site,
keyed by **host + first path segment** (so `example.com/blog` and
`example.com/shop` are distinct, and shared hosts like `github.io` don't
collide), and reuses it on the next hover instead of re-guessing from a
content-length threshold.

Hard signals are never overridden: a bot wall or a sign-in form is always
detected fresh, and a page with plenty of readable HTML always frames — a stale
"card" memory can't hide content that is actually there. Memory lives in
`chrome.storage.local`, is capped at 500 entries (oldest evicted first), and can
be cleared from the popup.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `link-preview-sandbox` folder.
4. Open any `http(s)` page and hover a link for half a second.

## Settings

Click the toolbar icon to configure:

| Setting | Default | Notes |
| --- | --- | --- |
| Enabled | on | Master toggle |
| Trigger | Hover | or "Shift + hover" |
| Hover delay | 500 ms | how long the pointer must rest on a link |
| Render page preview | on | turn off to only show link + redirects |
| Remembered sites | — | count of learned hosts; **Clear** forgets them |

## How the redirect chain is captured

A plain `fetch` can't reveal intermediate redirects (`redirect: 'manual'`
returns an opaque response whose `Location` header is unreadable). Instead:

1. The background worker records extension-originated requests via the
   observational `chrome.webRequest` API
   (`onBeforeRequest` → `onBeforeRedirect` → `onCompleted`/`onErrorOccurred`).
2. It performs one `fetch(..., { redirect: 'follow', cache: 'no-store' })`.
3. Redirect events arriving for that request are assembled into an ordered chain.

If `webRequest` yields nothing but `fetch` still followed a redirect, the panel
degrades gracefully to showing just the start and end URLs.

## Architecture

```
manifest.json     MV3 manifest (name, icons, permissions)
assets/
  logo.svg        master logo (512x512)
  icon.svg        simplified mark source (128x128)
  icon-16/32/48/128.png  toolbar + store icons
src/
  background.js   service worker: webRequest chain capture, capped HTML fetch,
                  background-tab screenshot capture
  content.js      hover detection, shadow-DOM overlay, sanitizer, sandboxed iframe,
                  per-site render memory
  popup.html/js   settings UI (chrome.storage.sync); remembered-sites count and
                  clear action (chrome.storage.local)
```

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | remember settings and per-site render memory |
| `webRequest` | observe own requests to reconstruct redirect chains |
| `tabs` | open and close the temporary screenshot tab |
| `<all_urls>` (host) | fetch a hovered link on any site |

`<all_urls>` is required because `chrome.tabs.captureVisibleTab` (the screenshot
fallback) rejects `http://*/*` / `https://*/*` grants and refuses `activeTab`
(which only applies to a user-invoked tab, not a background one). The extension
never reads page content beyond the single URL you hover.

## Chrome Web Store

Store-ready copy and policies live in `store/`:

- `store/LISTING.md` — name, summary, detailed description, category.
- `store/PRIVACY.md` — data handling and per-permission justification.
- `store/SCREENSHOTS.md` — the 1280×800 screenshot shot list.

Version history is in `CHANGELOG.md`.

## Branding

The mark is a **viewfinder reticle around a chain link / aperture** — the link
represents the URL being inspected, the reticle represents scoping it out before
you commit. Palette:

| Role | Hex |
| --- | --- |
| Background | `#12151c` |
| Primary (emerald) | `#6fd3a3` |
| Accent (light mint) | `#a9e8c6` |
| Muted link (logo) | `#2f6b52` |

`assets/logo.svg` is the full mark; `assets/icon.svg` is the simplified version
used to generate the PNG icons (a complex mark turns to mush at 16px).

### Security model

| Risk | Mitigation |
| --- | --- |
| Scripts in previewed page run | `sandbox=""` (no `allow-scripts`) + scripts stripped |
| Preview reaches into the host page | closed shadow root + opaque iframe origin |
| Stealing your session | preview fetch uses `credentials: 'omit'` |
| Tracking via Referer | `referrerpolicy="no-referrer"` on the iframe |
| Clickjacking through the preview | `pointer-events:none` on links inside the frame |
| Huge/streaming responses | body read is capped (~900 KB) |
| Hanging requests | 9 s `AbortController` timeout |

### Known limitations

- **Only `http(s)` pages get the content script.** Content scripts do not run on
  `chrome://`, the Chrome Web Store, or `file://` pages unless you enable
  "Allow access to file URLs" for the extension.
- **Client-rendered pages need JavaScript.** Sites like X build their content
  with JS, which the preview disables by design. Where the served HTML is an
  empty shell, LinkScope falls back to a metadata card or a background-tab
  screenshot instead of showing a blank frame.
- Sites that require login render as a login page (by design — no credentials).
- `webRequest` is observational only in MV3; that is all this extension needs.

## Ideas for v2

- Cache previews per URL in `chrome.storage.session`.
- Show a diff summary of redirect "families" (e.g., link shortener → ad tracker).
- Opt-in "block this destination" from the preview panel.
