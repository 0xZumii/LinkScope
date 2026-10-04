# Store screenshots

The Chrome Web Store wants **1280×800** (or 640×400) PNG/JPEG screenshots, 1–5
of them, plus a **440×280** small promo tile. This file is the shot list and the
steps to reproduce each one.

## Prerequisites

- Build/version: `0.5.0` (manifest version).
- Load the extension unpacked (`chrome://extensions` → Load unpacked).
- Start with a clean profile or clear memory first, so "Remembered sites" reads
  `0 hosts` for the settings shot.
- Capture at a fixed **1280×800** viewport (DevTools → Device toolbar → Responsive
  → 1280×800), or crop to it after. Chrome's screenshot tools:
  `Ctrl+Shift+P` → "Capture screenshot" / "Capture full size screenshot".

## Shot 1 — Hover preview on a real page (hero image)

- Open a content-rich article (e.g. a news/blog post with text and images).
- Hover a link until the overlay appears: sandboxed frame + `Preview` badge +
  redirect chain beneath.
- Goal: show the frame, the badge, and the chain in one image.

## Shot 2 — Redirect chain with a cross-origin hop

- Use a redirecting link: a shortener, or
  `https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.org%2Ffinal`.
- Hover it and let the chain resolve.
- Goal: show multiple hops, their HTTP statuses, and the cross-origin hop
  highlighted. This is the differentiator — make it prominent.

## Shot 3 — Summary-card fallback

- Hover a link to a JavaScript-rendered page that carries OpenGraph tags (an X
  post, a YouTube page, etc.).
- Goal: show the title/description/image card with the sandboxed-note beneath.

## Shot 4 — Bot-wall notice (optional)

- Hover a link that returns a Cloudflare-style interstitial.
- Goal: show the "blocked by a bot check" explanation instead of a blank frame.

## Shot 5 — Settings popup

- Click the toolbar icon.
- Goal: show all controls, especially the **Remembered sites** row with a count
  and the green **Clear** link, so reviewers see the memory feature.

## Promo tile (440×280)

- Brand mark + wordmark on the `#12151c` background, using the emerald
  `#6fd3a3` accent. Suggested text: "Preview links before you click."
- Source art: `assets/logo.svg`, `assets/icon.svg`.

## After capturing

1. Check each image is exactly 1280×800 and under the store's file-size limit.
2. Save them under `store/screenshots/` (create the folder) with names
   `01-hover-preview.png` … `05-settings.png`.
3. Upload in that order; the first is the listing's lead image.
