# Chrome Web Store submission checklist

Everything needed to publish LinkScope to the Chrome Web Store. Some steps are
manual (they need the Developer Dashboard or a browser); those are marked
**[you]**.

## 1. Package

- [ ] Version in `manifest.json` is bumped (`0.9.1` at time of writing).
- [ ] `chrome://extensions` → **Pack extension** with the repo root, or zip the
      extension files. **Do not** include `store/`, `tests/`, `.git/`, or
      `node_modules`. The zip should contain only:
      `manifest.json`, `assets/`, `src/`.
- [ ] Smoke-test the packed version: load it unpacked, then hover links on:
      a text article (frame), a JS app (card/screenshot), a `t.co` link
      (soft-404), and a redirect link (chain).

## 2. Listing assets

Ready-made, in this folder:

| Asset | File | Size |
| --- | --- | --- |
| Small promo tile | `promo/promo-440x280.png` | 440×280 |
| Social / OG image | `promo/social-1280x640.png` | 1280×640 |
| Store screenshots | `screenshots/` | 1280×800 |

- [ ] Produce the 5 screenshots per `SCREENSHOTS.md` and drop them in
      `screenshots/` as `01-…png` … `05-…png`. **[you]** (needs a live browser)
- [ ] Optionally the 1280×800 marquee is the first screenshot; keep the redirect
      chain one prominent.

## 3. Listing copy

From `LISTING.md` (already written, ready to paste):

- [ ] Name, summary, detailed description, category.
- [ ] Support URL: https://github.com/0xZumii/LinkScope/issues
- [ ] Homepage URL: https://github.com/0xZumii/LinkScope
- [ ] Privacy policy URL: host `PRIVACY.md` and paste the link. A GitHub
      blob/raw URL to `store/PRIVACY.md` is acceptable.

## 4. Privacy practices questionnaire

The dashboard asks for each permission and a data-use declaration. Answers:

| Permission | Single purpose / justification |
| --- | --- |
| `storage` | Save the user's settings and per-site render memory locally. |
| `webRequest` | Observe the extension's **own** preview fetches to reconstruct the redirect chain. Observational only; does not read or block normal browsing. |
| `tabs` | Open a temporary tab to screenshot JavaScript-only pages, then close it. |
| `<all_urls>` | A hovered link can point anywhere, so the preview fetch must work on any site. Also required by `captureVisibleTab` for the screenshot fallback. |

- [ ] Declare: no data sold, no data used for unrelated purposes, no remote code.
- [ ] The extension does **not** collect or transmit user data to the developer.

## 5. Submit

- [ ] Upload the zip.
- [ ] Fill the listing, upload the screenshots + promo tile.
- [ ] Complete the privacy questionnaire.
- [ ] Submit for review. MV3 + the above permissions typically reviews in a few
      days; the `webRequest` + `<all_urls>` combination may prompt a question —
      the justification above is the answer.

## Notes for the reviewer

- Single purpose: preview a hovered link and show its redirect chain.
- No remote code; all logic ships in the package.
- `webRequest` is observational (no `webRequestBlocking`).
- Incognito access is **optional** (the user enables "Allow in Incognito"); the
  extension works without it.
