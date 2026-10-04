# Changelog

All notable changes to LinkScope are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Repository: https://github.com/0xZumii/LinkScope

## [0.9.1] - 2026-10-04

### Changed

- Redrew the logo/icon: a single bold chain link inside a crosshair reticle
  (previously two offset links that read as overlapping circles at small sizes).
  Regenerated `icon-16/32/48/128.png`; the mark is legible down to 16px.

## [0.9.0] - 2026-10-04

### Added

- Soft-404 detection: sites that return HTTP 200 with an HTML "not found" page
  (link shorteners such as `t.co`, X, and others) are now explained as
  "Page not found" instead of rendering a generic failure.

### Fixed

- JavaScript app shells were being **framed** whenever they carried more than a
  couple hundred characters of boilerplate text, which pinned them to `frame`
  and skipped the card/screenshot fallback. Empty shells (empty body, many
  scripts) are now sent to the card/screenshot path regardless of boilerplate.

## [0.8.2] - 2026-10-04

### Changed

- Screenshots now render as a scaled-down thumbnail (46% width on a
  checkerboard) rather than being cropped to fill the panel, so you can see the
  whole captured page at a glance. Click the thumbnail to expand it to full
  panel width.

## [0.8.1] - 2026-10-04

### Fixed

- **Dragging now works.** The drag listener tested `composedPath()` for the
  header, but the overlay uses a *closed* shadow root, so shadow nodes are
  retargeted to the host and the header was never matched (clicks also leaked
  through to the page). The header now owns the drag listeners directly and the
  Copy/Open/✕ controls opt out.
- The window opens **centered** in the viewport instead of locking to the bottom
  of the screen.

### Changed

- Wider window (920px), and the preview body now flexes to fill the available
  height.
- The note/warning text under the preview was small and low-contrast; it is now
  larger and lighter (`12.5px`, brighter grey), and the URL line in the header
  is larger too.

## [0.8.0] - 2026-10-04

### Changed

- The preview is now a **floating window** rather than a hover card. It opens
  next to the link at roughly double the old size (780px), can be dragged by its
  header, and **no longer auto-hides** when the pointer moves off it or when the
  page scrolls. Close it with the ✕ button or Esc. Hovering another link loads
  into the same window at the same position.
- Removed the Pin button (redundant once the window stays open on its own).

## [0.7.0] - 2026-10-04

### Added

- **Isolated screenshots (default).** The screenshot fallback now loads a page in
  a temporary **Incognito** window, which has a fresh, memory-only cookie store,
  so it starts logged out and cannot use your session. Requires "Allow in
  Incognito" for the extension; if that's off, LinkScope says so rather than
  silently falling back to your session.

### Changed

- The "Load pages for screenshots" on/off toggle is now a **Live screenshots**
  choice: **Isolated** (Incognito, default), **Normal tab** (uses your session),
  or **Off**.

## [0.6.0] - 2026-10-04

### Added

- **"Load pages for screenshots" setting** (on by default). The screenshot
  fallback is the only preview path that loads a link live — scripts enabled,
  using your browser session — so it can now be switched off. JS-only pages then
  show a "no renderable preview" explanation instead of opening the link.

### Changed

- Corrected the privacy documentation. The credential-less `credentials: 'omit'`
  guarantee covers only the fetch-based frame/card paths; the README, store
  privacy policy, and the in-panel caption now state that the screenshot path
  loads the page live with your session.

## [0.5.3] - 2026-10-04

### Fixed

- The preview panel closed a moment after a screenshot finished. Focusing the
  temporary capture window (needed on Windows) makes the page receive a synthetic
  pointer/scroll event, which tripped the auto-hide. Auto-hide is now suspended
  while a capture is in flight and for a short grace period afterwards.

## [0.5.2] - 2026-10-04

### Fixed

- Screenshot fallback failed on Windows because `captureVisibleTab` refuses a
  window that isn't focused. The capture now retries with the temporary window
  focused and hands focus straight back to the window you were using.
- The failure/success note under the preview body was pushed out of view by a
  full-height placeholder; placeholders now size to their content so the
  explanation (including screenshot errors) is visible.
- Removed a CSP `base-uri` violation logged on strict-CSP host pages (Gmail,
  LinkedIn). The `<base>` tag is now injected as markup into the generated
  preview instead of being set on the parsed document, so it no longer trips the
  host page's policy.

## [0.5.1] - 2026-10-04

### Fixed

- Empty summary cards on client-rendered and interstitial pages (X, `t.co`,
  Telegram invites). A page `<title>` that is just the URL no longer counts as
  metadata, so these pages now fall through to the screenshot fallback instead
  of rendering a card with nothing in it.
- Per-site memory could pin a host to an empty card. A remembered "card" is now
  reused only while real metadata still exists, and "screenshot" is cached only
  after a capture actually succeeds. The memory format was bumped so stale
  entries are discarded on upgrade.

## [0.5.0] - 2026-10-04

### Added

- Per-site render memory: LinkScope remembers whether each site (keyed by host +
  first path segment) needed a summary card or a screenshot, and reuses it on the
  next hover instead of re-guessing from a content-length threshold. Capped at
  500 entries, oldest evicted first, stored in `chrome.storage.local`.
- "Remembered sites" row in the popup showing the learned-host count with a
  **Clear** action.

### Changed

- Memory now only resolves the ambiguous low-content choice (card vs.
  screenshot). Bot walls and sign-in forms are still detected fresh, and a page
  with plenty of readable HTML always renders as a frame.
- Fixed the popup's static hover-delay fallback to read `500` ms, matching the
  default setting and the docs.

## [0.4.0] - 2026-10-04

### Added

- Screenshot fallback: client-rendered pages with no OpenGraph metadata are
  loaded in a temporary background tab, captured, and the tab closed.
- `tabs` permission and the `<all_urls>` host grant required by
  `chrome.tabs.captureVisibleTab`.

## [0.3.2] - 2026-10-04

### Added

- `PREVIEW` badge on the sandboxed frame.
- Warning shown when a rendered page contains a sign-in form.

## [0.3.1] - 2026-10-04

### Added

- Bot-challenge detection: Cloudflare-style interstitials are recognised and
  explained instead of appearing as an empty card.

## [0.3.0] - 2026-10-04

### Added

- Invalidated-extension-context detection with a visible build marker, so it is
  obvious which content-script build a tab is actually running.

## [0.1.0] - 2026-10-03

### Added

- Initial release: hover a link to preview it in a sandboxed, script-free frame
  and inspect its redirect chain before clicking.
- Hover detection with a shadow-DOM overlay and configurable delay.
- Redirect-chain reconstruction from the observational `chrome.webRequest` API.
- HTML sanitizer that strips scripts, forms, frames and event handlers.
- Sandboxed rendering via a `blob:` URL (with `srcdoc` fallback) and an
  OpenGraph summary-card fallback for client-rendered pages.
- `Shift + hover` trigger mode and `credentials: 'omit'` preview fetches.
- LinkScope branding: logo and toolbar icons.
