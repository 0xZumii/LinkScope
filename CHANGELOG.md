# Changelog

All notable changes to LinkScope are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
