# Karakeep Fork Roadmap

Vision: Turn Karakeep into a dev-oriented knowledge hub with GitHub-native features, social feed aggregation, Eagle-style visual UI, and AI-powered discovery.

## Phase 1: GitHub Native

Foundation — authenticated GitHub API access unlocks everything.

- [ ] **Fetch GitHub token on login** — call Logto Secret Vault API after OAuth, store token in Karakeep DB, handle refresh
- [ ] **Stars sync** — worker job fetching `/user/starred`, creates bookmarks with repo metadata (language, topics, description), runs on login + periodic cron
- [ ] **Gists** — new bookmark type for code snippets, fetch user gists via API, syntax-highlighted preview
- [ ] **Repo search** — search GitHub repos/code/topics from dashboard, one-click save to bookmarks
- [ ] **Activity feed** — show recent GitHub events (PRs, issues, releases from watched repos)

## Phase 2: Visual UI (Eagle-style)

Make it delightful — visual-first browsing and organizing.

- [ ] **Grid view overhaul** — masonry/Pinterest layout with rich preview cards
- [ ] **Visual thumbnails** — screenshot previews for links, code previews for gists
- [ ] **Color tags** — tags with color dots like Eagle, visual filtering
- [ ] **Drag-drop** — reorder within collections, drag between lists
- [ ] **Quick preview panel** — click to expand without leaving the grid (sidebar preview)
- [ ] **Board view** — kanban-style columns (e.g. "To Read", "Using", "Archive")

## Phase 3: Feed Aggregation

Comprehensive — all your dev sources in one place.

- [ ] **X/Twitter bookmarks** — OAuth with X API, sync saved tweets
- [ ] **RSS subscriptions** — add feeds, new items auto-bookmark with AI tags
- [ ] **Hacker News** — sync upvoted/saved stories
- [ ] **Reddit saves** — OAuth, sync saved posts
- [ ] **Instagram saves** — code/tech content (limited API, may need browser extension)
- [ ] **Unified feed view** — timeline across all sources, filterable by source

## Phase 4: Community & Publishing

Social — share your curated knowledge.

- [ ] **Public collections** — toggle a list as public, shareable URL
- [ ] **Awesome-list export** — generate markdown from a collection
- [ ] **Stack profiles** — "my stack" page showing tools you use with categories
- [ ] **Follow other users** — see what others curate
- [ ] **Shared wiki** — collaborative lists (like awesome-lists but live and maintained)

## Phase 5: AI & Discovery

Smart — let AI help you find and organize.

- [ ] **Smart collections** — AI auto-groups related bookmarks into clusters
- [ ] **"Similar to X"** — find related projects from your stars + GitHub search
- [ ] **Digest emails** — weekly summary of new items across all sources
- [ ] **Claude integration** — ask questions about your collection via MCP (server already exists)
- [ ] **Auto-categorize** — AI suggests which collection a new bookmark belongs to

## Architecture notes

Each phase is independently useful but compounds with the others:
- Phase 1 = foundation (data flows in)
- Phase 2 = delight (UX that makes you want to use it)
- Phase 3 = comprehensive (all sources, one place)
- Phase 4 = social (share and discover)
- Phase 5 = smart (AI amplifies everything)

Key technical decisions:
- GitHub token stored in Karakeep DB (fetched from Logto Secret Vault on login)
- Social provider tokens follow same pattern (Logto connectors + Secret Vault)
- New bookmark types may need schema changes (gists, tweets, code snippets)
- Feed sync runs as worker jobs (existing worker infrastructure)
- Visual UI changes stay within Tailwind + Radix component system
- Keep changes mergeable with upstream Karakeep where possible
