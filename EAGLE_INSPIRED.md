# Eagle-Inspired Features for Karakeep

Mapping Eagle.cool features to Karakeep context. Bookmarks (links, repos, gists, tweets) are the "assets." Not tackling all at once — this is a checklist.

Status: `[ ]` todo · `[~]` partial · `[x]` done

## 1. Tag system improvements

- [ ] **Tag source/origin** — distinguish AI tags from GitHub topics from user-added. Options:
  - Add `"github"` / `"rss"` to `tagsOnBookmarks.attachedBy` enum (currently `"ai" | "human"`). Migration needed.
  - UI: color chips by origin.
- [ ] **Tag categories / hierarchy** — nested tags (`lang/typescript`, `topic/debugger`). Either namespace in name (cheap) or a `parentId` field (proper tree).
- [ ] **Auto-tagging** — Eagle auto-tags everything in a folder on add. Map to: when bookmark lands in a list, apply list's default tags.
- [ ] **Tag renaming across all bookmarks** — bulk rename without orphaning.

## 2. Organization

- [ ] **Hierarchical lists** — lists already exist (`bookmarkLists`). Confirm nesting works; improve UI.
- [ ] **Smart lists** (Eagle smart folders) — saved searches / filters that auto-update. Rule-based: `source=github AND language=rust` → list.
- [ ] **Ratings** — 1–5 star field on bookmarks for priority/quality filtering.
- [ ] **Duplicate detection** — already has link dedup by URL; add content-similarity check for same repo across forks or near-duplicate articles.
- [ ] **Annotations on images** — currently only HTML highlights. Extend to image assets (screenshots, gists with preview).

## 3. Browsing & preview

- [~] **Grid view** — exists. Need Eagle-style masonry (Pinterest layout) instead of fixed-height grid.
- [ ] **Hover preview** — on hover, show full-size image / animated GIF / first README image for repos. No click needed.
- [ ] **Spacebar preview** — keyboard nav through grid, spacebar to expand.
- [ ] **Random mode** — "shuffle" button to rediscover bookmarks.
- [ ] **Layout toggle per bookmark type** — list view for articles, grid for visual content.

## 4. Search

- [~] **Keyword search** — Meilisearch already indexes. Good.
- [ ] **Color search** — extract dominant color from bookmark image, let user filter by palette.
- [ ] **Semantic / AI search** — embed bookmark content, search by meaning. Use local embedding model (Ollama `nomic-embed-text` or similar).
- [ ] **Multi-dimensional filters** — combine source + tags + date + language in one filter bar.
- [ ] **"Find similar to this"** — per-bookmark button → semantic neighbors.

## 5. AI-powered

- [~] **Local LLM support** — `OLLAMA_BASE_URL` already supported. Need to configure + pick default tag/summary model.
- [ ] **AI tags on github-sourced bookmarks** — currently crawler is skipped for `source=github`, so AI tagger never runs. Trigger AI tagging directly in github worker using README content as input.
- [ ] **AI summary per repo** — short blurb generated from README (cached, separate from GitHub's one-liner description).
- [ ] **Auto-categorize** — "which list should this new bookmark go to?" suggestion based on existing list contents.
- [ ] **Weekly digest email** — AI summary of what was added, highlights.

## 6. Visual UI polish

- [x] **README rendering** — done via `@uiw/react-markdown-preview` (Phase 1).
- [ ] **Card color chips** — dominant color stripe on card edge.
- [ ] **Drag-drop between lists** — reorder / move without menu.
- [ ] **Focus zoom** — click image in preview → lightbox with pan/zoom.
- [ ] **Dark mode polish** — verify GitHub README renderer theme matches app theme exactly.

## 7. Workflow automation (Rule Engine already exists)

- [~] **Rule engine** — `ruleEngineRules` table exists. Extend with:
  - [ ] More triggers (on sync, on tag added, on rating set)
  - [ ] More actions (auto-add to list, auto-summarize, notify)

## 8. Format support (Karakeep is bookmark-first, not file-first)

- [x] **Web bookmarks** — core product.
- [x] **GitHub repos** — Phase 1.
- [ ] **Gists** — roadmap Phase 1 item. Renderer needed.
- [ ] **YouTube / video bookmarks** — auto-fetch metadata + embed preview.
- [ ] **Font previews** — probably skip; not Karakeep's audience.
- [ ] **Audio** — skip.

## 9. Security & sharing

- [ ] **Password-locked lists** — sensitive bookmarks behind PIN.
- [ ] **Public shareable lists** — roadmap Phase 4 item.
- [ ] **Export** — awesome-list markdown generator (Phase 4).

## 10. Plugins / extensibility

- [~] **Plugin system** — already at `packages/plugins/` (search, queue, ratelimit). Expand to:
  - [ ] Content-type plugins (new bookmark source = new plugin)
  - [ ] UI plugins (custom card renderers per source)

## Priority ordering (suggestion)

1. Tag origin (`attachedBy: "github"`) — unblocks clean AI tagging
2. AI tagging + summary for github bookmarks via Ollama
3. Masonry grid + hover preview
4. Smart lists (saved filters)
5. Semantic search
6. Everything else
