# LinkScope — Privacy

LinkScope is a link-preview extension. It never sends your data to the developer,
and the sandboxed frame/card preview never uses your session. The optional
screenshot fallback is the one path that loads a page live, and it is described
in full below.

## Short version

- **Nothing is collected or sent to the developer.** No analytics, no telemetry,
  no accounts, no remote servers.
- **Settings** are stored in `chrome.storage.sync` (and sync via your Google
  account if you have sync enabled).
- **Per-site render memory** is stored in `chrome.storage.local` on your device.
- The frame/card preview is fetched **directly by your browser without
  credentials** (`credentials: 'omit'`).
- The **screenshot fallback is the exception**: it loads the page for real. By
  default it uses a temporary **Incognito** tab (logged out, memory-only
  cookies); it can be set to a normal tab or turned off.

## What LinkScope processes, and where

| Data | Purpose | Where it goes |
| --- | --- | --- |
| The URL you hover | Fetch the page to build the preview and redirect chain | Your browser → the destination site. Nothing is sent to the developer. |
| The destination's HTML | Sanitized and rendered in a sandboxed frame | Stays in your browser; discarded when the preview closes |
| Settings (enabled, trigger, delay, render preview, live screenshots) | Remember your preferences | `chrome.storage.sync` |
| Per-site render memory (host + first path segment → card/screenshot, timestamp) | Render known sites consistently | `chrome.storage.local` (capped at 500 entries; clearable) |
| The page as rendered live (screenshot fallback only) | Photograph a JavaScript-only page | Loaded in a temporary tab (Incognito by default) and closed; the still image stays in your browser and is discarded when the preview closes |
| The hovered link's **registrable domain** (only if Domain info is enabled) | Look up registrar/dates (RDAP) and CT subdomains | Sent to `rdap.org` and `crt.sh`. Nothing is sent to the developer. |

LinkScope does not read or transmit the content of pages you visit beyond the
single link you explicitly hover.

## Network behavior

When you hover a link, the background service worker issues one `fetch()` to that
URL with `credentials: 'omit'`, `redirect: 'follow'` and `cache: 'no-store'`.
Because credentials are omitted, the request never carries your cookies, and the
destination cannot tie the fetch-based preview to a logged-in session.

If **Domain info** is enabled, LinkScope additionally sends the hovered link's
**registrable domain** (e.g. `example.com`, not the full URL) to `rdap.org` and
`crt.sh` to fetch registrar/registration data and Certificate Transparency
subdomains. These requests also omit credentials and are cached locally for an
hour. If Domain info is off, no such lookups happen. The look-alike (homograph)
guard is purely local and sends nothing.

For JavaScript-only pages with no previewable HTML or metadata, LinkScope can
instead load the URL **live** in a temporary tab, wait for it to render, capture
a screenshot, and close the tab. The **Live screenshots** setting controls this:

- **Isolated (default)** — the tab is created in an **Incognito** window, which
  has a fresh, memory-only cookie store, so the page starts **logged out** and
  cannot use your session. Incognito isolation requires the user to enable
  **Allow in Incognito** for the extension; if it is not enabled, LinkScope does
  not silently fall back to your session — it shows a "no renderable preview"
  note instead.
- **Normal tab** — the page is loaded in a temporary tab using your normal
  profile. It runs with your session, exactly as if you had opened it.
- **Off** — the page is never loaded live; JS-only pages show a note.

In all cases the tab is closed immediately after capture. Even in isolated mode
the page's scripts run, so it can set *incognito* cookies and fire anonymous
analytics; it cannot read your logged-in accounts.

## Permissions and why each is needed

- **`storage`** — persist your settings and the per-site render memory.
- **`webRequest`** — observe the extension's *own* preview fetches to reconstruct
  the redirect chain. Observational only: LinkScope does not block, modify, or
  inspect your normal browsing traffic.
- **`tabs`** — open a temporary tab to screenshot JavaScript-only pages and then
  close it.
- **Access to all sites (`<all_urls>`)** — a hovered link can point anywhere, so
  the extension must be able to fetch it on any site. `captureVisibleTab` (used
  for the screenshot fallback) rejects narrower `http://*/*` grants and does not
  work with `activeTab`, which is why the broad host permission is required.
- **`rdap.org` and `crt.sh`** — only used when the user enables **Domain info**,
  to look up registrar/dates (RDAP) and Certificate Transparency subdomains for
  the hovered link's registrable domain. These calls never carry credentials.

## Data sharing

None. LinkScope does not sell, share, or transfer data to third parties. It does
not use data for advertising, creditworthiness, or lending purposes.

## Data retention and deletion

- Settings live in `chrome.storage.sync` until you change them.
- Per-site memory lives in `chrome.storage.local` until you clear it with
  **Remembered sites → Clear** in the popup, or uninstall the extension.
- Uninstalling the extension removes both stores from the browser.

## Remote code

LinkScope does not download or execute remote code. All JavaScript ships inside
the extension package and runs under Chrome's Manifest V3 rules.

## Changes

Any change to these practices will be reflected in this document and in the
extension's changelog.

## Contact

Replace with your support email or repository issues URL before publishing.
