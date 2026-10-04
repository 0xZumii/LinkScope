# Chrome Web Store listing

Copy-paste fields for the Chrome Web Store developer dashboard.

## Product name (max 75)

```
LinkScope — Link Preview & Redirect Inspector
```

## Summary / short description (max 132)

```
Hover a link to preview it in a sandboxed, script-free frame and see every redirect before you click.
```

## Category

Primary: **Productivity**. Alternative: **Developer Tools** (redirect-chain
inspection is developer-ish, but the core use is everyday link safety).

## Language

English.

## Detailed description

```
LinkScope shows you where a link actually goes — before you click it.

Hover any link for half a second. LinkScope fetches the destination, renders its
HTML in a sandboxed, script-free frame, and lists the full redirect chain with the
HTTP status of every hop. Shorteners, tracking redirects, and silent hops to a
different domain are called out so you can decide whether a link is safe to open.

WHAT YOU GET

• Redirect chain inspection — every hop is listed with its HTTP status, and
  cross-origin hops are highlighted.
• Sandboxed rendering — the target's HTML is stripped of scripts, forms, frames
  and event handlers and shown in an <iframe sandbox=""> with scripts and
  same-origin access disabled.
• Summary-card fallback — if a page is JavaScript-rendered (X, many SPAs), its
  OpenGraph title, description and image are shown instead of a blank frame.
• Screenshot fallback — pages with neither usable HTML nor metadata are loaded in
  a temporary background tab, photographed, and the tab closed.
• Bot-wall detection — Cloudflare-style "Just a moment…" pages are recognised and
  explained instead of appearing blank.
• Per-site memory — LinkScope remembers whether a site needed a summary card or a
  screenshot, so known sites render the same way next time. Clear it any time.
• Two trigger modes — hover (with a configurable delay) or Shift + hover.

PRIVATE BY DESIGN

• The preview fetch uses credentials: 'omit' — your logged-in session is never
  pulled into the preview.
• Previews render with scripts disabled in an opaque-origin sandbox.
• Referrers are suppressed on the preview frame.
• Nothing is sent to the developer. There are no analytics, no accounts, and no
  remote servers. Settings and per-site memory stay in your browser.
• No build step, no third-party libraries: the whole extension is plain
  HTML/CSS/JS you can read.

PERMISSIONS, AND WHY

• storage — save your settings and per-site render memory.
• webRequest — observe the extension's own preview fetch to reconstruct the
  redirect chain (observational only; it does not read your browsing or block
  anything).
• tabs — open a temporary background tab to screenshot JS-only pages, then close
  it.
• Access to all sites — needed to fetch whichever link you hover, on any site.

Only http(s) links get a preview, only the single URL you hover is fetched, and
the result is discarded when the preview closes.

New in 0.5.0: per-site memory, so commonly previewed sites render instantly.
```

## Support / contact

- Support URL: replace with your repository issues page or a contact page.
- Homepage URL: replace with the repository URL.
- Privacy policy URL: host `PRIVACY.md` (see that file) and paste the URL here.

## Notes for the reviewer

- The extension has a single purpose: preview a hovered link and show its
  redirect chain.
- No remote code is fetched or executed. All logic ships in the package.
- `webRequest` is used in observational mode only (no blocking, no
  `webRequestBlocking`).
