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
  page is loaded in a temporary tab and photographed. By default this is an
  **Incognito** tab (logged out, fresh memory-only cookies); it can be set to a
  normal tab or turned off.
- **Per-site memory** — remembers whether a host needed a summary card or a
  screenshot, so a known site renders the same way instead of being re-guessed
  on every hover. Clearable from the popup.
- **Bot-wall detection** — Cloudflare-style "Just a moment…" interstitials are
  recognised and explained instead of appearing as a blank frame.
- **Two trigger modes** — plain `hover` (default) with a configurable delay, or
  `Shift + hover` if you prefer an explicit modifier.
- **A floating preview window** — the overlay opens near the link, is draggable by
  its header, and stays put while you scroll or read. Close it with the **✕** or
  **Esc**.
- **No credentials for the fetch** — the frame/card paths use
  `credentials: 'omit'`, so they never pull your logged-in session into the
  preview. The screenshot path is the exception (it loads the page live) and is
  documented below.
- **Zero build step** — plain JS/CSS, load it unpacked.

## How a link is rendered

The target's HTML is fetched by the background worker and sanitized, then one of
**four** representations is chosen. Hard signals are checked first, then whether
there is real content to show, and only then per-site memory:

1. **Bot-wall notice.** A Cloudflare-style interstitial ("Just a moment…", an
   otherwise empty 4xx shell) or an HTML "not found" page (a soft 404, common on
   link shorteners) is recognised and explained instead of being shown as a blank
   frame.
2. **Sandboxed frame.** If the page has readable HTML — or looks like a sign-in
   page — its content renders in an `<iframe sandbox="">` with scripts, forms and
   frames disabled. Login pages always frame, so the sandbox warning is visible;
   forms cannot submit and the destination sees nothing you type.
3. **Summary card.** A client-rendered shell (X, many SPAs) has little readable
   HTML but usually carries OpenGraph tags. Those become a title + description +
   image card rather than a blank frame.
4. **Screenshot.** A shell with no usable metadata is loaded live in a temporary
   tab and photographed. This is the only path that runs the page's JavaScript,
   so it is configurable (see Privacy): **Isolated** (default) loads it in a
   temporary **Incognito** window so it starts logged out; **Normal tab** uses
   your session; **Off** disables it entirely.

A JavaScript *app shell* — an empty `<body>` with scripts, even if it carries
some header/footer boilerplate — is treated as "no content" and goes to the
card/screenshot path rather than being framed.

### The preview window

The preview opens centered in the viewport as a floating window (920px wide, or
as large as the viewport allows). Once open it stays put: moving the pointer away
**does not** close it, and neither does scrolling. It opens once and then stays
where it is, so hovering a second link loads its preview into the same window at
the same spot. Drag it anywhere by its header. Close it with the **✕** button or
**Esc**. (This replaced the old behavior where the panel hid as soon as the
pointer left the link.)

Screenshots render as a small thumbnail on a checkerboard so the whole captured
page is visible at a glance; click the thumbnail to expand it.

### Privacy: the fetch paths vs. the screenshot path

The frame and card paths never use your credentials: the background worker
fetches the HTML with `credentials: 'omit'`, and everything is rendered with
scripts disabled. Those paths cannot act as you.

The screenshot path is different by necessity — a script-free sandbox cannot
render a JavaScript app, so one has to be loaded for real. The **Live
screenshots** setting controls how:

| Setting | What it does | Session used? |
| --- | --- | --- |
| **Isolated** (default) | Loads the page in a temporary **Incognito** window, which has a fresh, memory-only cookie store, so it starts **logged out**; captures and closes it | No |
| **Normal tab** | Loads the page in a temporary tab using your normal profile | Yes |
| **Off** | Never loads the page; JS-only pages show a "no renderable preview" note | — |

In Incognito mode the page's scripts still run, but without your cookies, so it
cannot act as you or read your accounts. It can still set *incognito* cookies
and fire anonymous analytics, and the tab is closed immediately after capture.
Incognito isolation requires a one-time permission: open `chrome://extensions`,
find LinkScope → **Details**, and enable **Allow in Incognito**. If that's off,
LinkScope reports it and falls back to showing the "no renderable preview" note
rather than silently using your session — switch to **Normal tab** if you'd
rather allow it with your session.

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
"card" memory can't hide content that is actually there. A remembered card is
reused only while the page still has real metadata (an image, description, or a
genuine title), so a page that loses its OpenGraph tags falls through to a
screenshot rather than an empty card. Memory lives in `chrome.storage.local`, is
capped at 500 entries (oldest evicted first), and can be cleared from the popup.

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
| Live screenshots | Isolated | Incognito temp tab (logged out) / Normal tab (uses your session) / off |
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
(which only applies to a user-invoked tab, not a background one). Besides the
single URL you hover, the extension only opens that URL live for the screenshot
fallback (see the **Live screenshots** setting).

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
| Scripts in the sandboxed frame run | `sandbox=""` (no `allow-scripts`) + scripts stripped |
| Preview reaches into the host page | closed shadow root + opaque iframe origin |
| Stealing your session via the fetch | frame/card fetch uses `credentials: 'omit'` |
| Tracking via Referer | `referrerpolicy="no-referrer"` on the iframe |
| Clickjacking through the preview | `pointer-events:none` on links inside the frame |
| Huge/streaming responses | body read is capped (~900 KB) |
| Hanging requests | 9 s `AbortController` timeout |
| **Screenshot path runs the page live** | temporary tab, closed immediately; **Isolated** default loads it in Incognito (logged out); "Off" disables it |

### Known limitations

- **Only `http(s)` pages get the content script.** Content scripts do not run on
  `chrome://`, the Chrome Web Store, or `file://` pages unless you enable
  "Allow access to file URLs" for the extension.
- **Client-rendered pages need JavaScript.** Sites like X build their content
  with JS, which the preview disables by design. Where the served HTML is an
  empty shell, LinkScope falls back to a metadata card or a live-tab screenshot
  instead of showing a blank frame.
- **Screenshots load the page for real.** Because a script-free sandbox can't
  render a JS app, the screenshot fallback loads the link. The default is an
  Incognito tab (logged out); **Normal tab** uses your session; **Off** disables
  the path. Incognito isolation needs "Allow in Incognito" enabled for the
  extension.
- Sites that require login render as a login page (by design — no credentials).
- `webRequest` is observational only in MV3; that is all this extension needs.

## Ideas for v2

- Cache previews per URL in `chrome.storage.session`.
- Show a diff summary of redirect "families" (e.g., link shortener → ad tracker).
- Opt-in "block this destination" from the preview panel.
