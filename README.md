# exacttools

A static, SEO-first collection of browser-based developer utilities. Every tool runs **100% client-side** — no backend, no accounts, no cookies, and no data ever leaves the browser. Built with Astro, React islands, Tailwind CSS v4, and MDX.

The working name (`exacttools`) lives in one place: `src/config.ts` (plus the matching `site` URL in `astro.config.mjs` and `public/robots.txt`).

## Local development

Requires Node.js 20+.

```sh
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # static production build to dist/
npm run preview    # serve the production build locally
npm run check      # astro + TypeScript diagnostics
npm run test:e2e   # browser smoke test (32 checks) — needs `npm run preview` running
```

The e2e test drives the built site with Playwright using the system Edge/Chrome (`channel: 'msedge'` in `scripts/smoke.mjs`) — no browser download required.

## Project layout

```
src/
  components/
    ToolShell.astro      # shared page shell: breadcrumb, title, tool, collapsed guide/FAQ, related
    AdSlot.astro         # reserved, flag-gated empty containers (ADS_ENABLED=false)
    tools/               # one self-contained React island per tool + shared ui.tsx
  content/tools/*.mdx    # per-tool frontmatter (SEO meta, FAQ) + article body
  layouts/Base.astro     # head/meta/JSON-LD, theme script, header/footer, easter-egg script
  lib/                   # shared browser-side utilities (XML engine)
  pages/
    index.astro          # homepage: tool card grid
    tools/[slug].astro   # generated from the content collection
    404.astro
  styles/tokens.css      # the entire design system ("Strictly Precise" — see docs/DESIGN.md)
```

### Adding a tool

1. Create the React island in `src/components/tools/MyTool.tsx` (use `useSweep`/`OutputPane`/`CopyButton` from `./ui`).
2. Register its slug in `src/components/tools/index.ts`.
3. Add `src/content/tools/my-tool.mdx` with frontmatter (`no` = next sort number) and the article.

## Deploying to Cloudflare Pages

1. Push the repository to GitHub/GitLab.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Settings:
   - **Build command:** `astro build`
   - **Build output directory:** `dist`
   - No environment variables required.
4. After the first deploy, set the production domain, then update `SITE_URL` in `src/config.ts`, the `SITE_URL` constant in `astro.config.mjs`, and the sitemap line in `public/robots.txt` to match, and redeploy (canonical URLs, OG tags, and the sitemap derive from it).

Analytics: a commented Plausible snippet sits in `src/layouts/Base.astro` — uncomment and set `data-domain` when ready. There is intentionally **no** ad code; `AdSlot.astro` only reserves flag-gated empty containers.
