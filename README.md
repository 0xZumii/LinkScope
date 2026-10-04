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
  worker, stripped of scripts/forms/frames/event handlers, and dropped into a
  `<iframe sandbox="">` with scripts and same-origin access disabled.
- **Two trigger modes** — `Shift + hover` (unobtrusive) or a configurable hover
  delay.
- **No credentials for the preview fetch** — the sandbox fetch uses
  `credentials: 'omit'`, so it never pulls your logged-in session into the preview.
- **Zero build step** — plain JS/CSS, load it unpacked.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `link-preview-sandbox` folder.
4. Open any page, hold **Shift**, and hover a link.

## Settings

Click the toolbar icon to configure:

| Setting | Default | Notes |
| --- | --- | --- |
| Enabled | on | Master toggle |
| Trigger | Shift + hover | or "Hover delay" |
| Hover delay | 600 ms | used in delay mode |
| Render page preview | on | turn off to only show link + redirects |

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
  background.js   service worker: webRequest chain capture + capped HTML fetch
  content.js      hover detection, shadow-DOM overlay, sanitizer, sandboxed iframe
  popup.html/js   settings UI (chrome.storage.sync)
```

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

- Sites that require login render as a login page (by design — no credentials).
- A page's own CSP can restrict what its `srcdoc` iframe loads; some styling may
  not appear. The metadata + redirect chain still work.
- JavaScript-rendered SPAs will show little content without scripts (by design).
- `webRequest` is observational only in MV3; that is all this extension needs.

## Ideas for v2

- Screenshot the preview via `chrome.tabs.captureVisibleTab` in a background tab.
- Cache previews per URL in `chrome.storage.session`.
- Show a diff summary of redirect "families" (e.g., link shortener → ad tracker).
- Opt-in "block this destination" from the preview panel.
