# Changelog

All notable changes to LinkScope are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
