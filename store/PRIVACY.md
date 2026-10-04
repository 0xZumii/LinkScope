# LinkScope — Privacy

LinkScope is a link-preview extension. It is built so that previewing a link does
not leak your browsing, your session, or your data to anyone — including the
developer.

## Short version

- **Nothing is collected or sent to the developer.** No analytics, no telemetry,
  no accounts, no remote servers.
- **Settings** are stored in `chrome.storage.sync` (and sync via your Google
  account if you have sync enabled).
- **Per-site render memory** is stored in `chrome.storage.local` on your device.
- A hovered link is fetched **directly by your browser** from the destination
  site, the same way clicking the link would.

## What LinkScope processes, and where

| Data | Purpose | Where it goes |
| --- | --- | --- |
| The URL you hover | Fetch the page to build the preview and redirect chain | Your browser → the destination site. Nothing is sent to the developer. |
| The destination's HTML | Sanitized and rendered in a sandboxed frame | Stays in your browser; discarded when the preview closes |
| Settings (enabled, trigger, delay, render preview) | Remember your preferences | `chrome.storage.sync` |
| Per-site render memory (host + first path segment → card/screenshot, timestamp) | Render known sites consistently | `chrome.storage.local` (capped at 500 entries; clearable) |

LinkScope does not read or transmit the content of pages you visit beyond the
single link you explicitly hover.

## Network behavior

When you hover a link, the background service worker issues one `fetch()` to that
URL with `credentials: 'omit'`, `redirect: 'follow'` and `cache: 'no-store'`.
Because credentials are omitted, the request never carries your cookies, and the
destination cannot tie the preview to a logged-in session. For pages with no
previewable HTML, LinkScope may open the URL in a temporary, background tab,
capture a screenshot, and immediately close the tab.

## Permissions and why each is needed

- **`storage`** — persist your settings and the per-site render memory.
- **`webRequest`** — observe the extension's *own* preview fetches to reconstruct
  the redirect chain. Observational only: LinkScope does not block, modify, or
  inspect your normal browsing traffic.
- **`tabs`** — open a temporary background tab to screenshot JavaScript-only
  pages and then close it.
- **Access to all sites (`<all_urls>`)** — a hovered link can point anywhere, so
  the extension must be able to fetch it on any site. `captureVisibleTab` (used
  for the screenshot fallback) rejects narrower `http://*/*` grants and does not
  work with `activeTab`, which is why the broad host permission is required.

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
