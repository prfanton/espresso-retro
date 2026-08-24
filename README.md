<div align="center">
  <img src="public/logo-espresso-retro-vertical.png" alt="Espresso Retro" height="160" />

  <br />

  **Real-time team retrospectives. No login. Just share a link.**

  [![Deploy](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://retro-app-phi.vercel.app)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
  [![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase)](https://supabase.com)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)

  [**→ Live App**](https://retro-app-phi.vercel.app)
</div>

---

## What is Espresso Retro?

Espresso Retro is a frictionless real-time retrospective tool built for agile teams. No accounts, no setup — create a session, share the link, and your team is in. Cards update live across every browser as they're typed, votes appear instantly, and the facilitator controls the reveal so no one is anchored to other people's opinions before writing their own.

---

## Features

### For participants
- **No login required** — enter a name and you're in
- **Anonymous by default** — cards are hidden from others until the facilitator reveals them, preventing anchoring bias
- **Live collaboration** — cards, votes, and presence update in real time across all connected browsers (~200ms)
- **Typing indicators** — see when a teammate is actively writing on a card
- **Upvoting** — vote on cards after reveal to surface the most important topics (one vote per person per card)
- **Keyboard shortcuts** — `⌘↵` / `Ctrl↵` to submit a card

### For facilitators
- **Session timer** — built-in countdown timer (5 min default), adjustable by ±1 min, with play/pause and reset. Pulses red in the last minute
- **Reveal control** — flip all cards visible at once when the team is done writing
- **Export** — download the full board as a Markdown file with vote counts

### Retro formats
| Format | Columns |
|---|---|
| **Start / Stop / Continue** | Start · Stop · Continue |
| **What Went Well / Didn't Go Well** | What Went Well · What Didn't Go Well · Action Items |
| **Mad / Sad / Glad** | Mad · Sad · Glad |

---

## How it works

```
1. Facilitator creates a session → gets a unique URL
2. Team joins via the shared link → enters their display name
3. Everyone writes cards privately (hidden from others)
4. Facilitator clicks Reveal → all cards flip visible simultaneously
5. Team votes on cards to prioritize
6. Facilitator exports the board as Markdown
```

**Presence** — live avatars in the header show who is currently in the session. Disappears within ~5 seconds of a tab closing.

**Concurrent edit safety** — only the card author can edit their own card (enforced by Supabase RLS + UI). Votes are idempotent via a `UNIQUE(card_id, user_key)` constraint.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Real-time | [Supabase Realtime](https://supabase.com/realtime) — Postgres Changes + Presence + Broadcast |
| Database | Supabase (PostgreSQL) with Row Level Security |
| State | [Zustand](https://zustand-demo.pmnd.rs) — slice-based selectors |
| Deployment | [Vercel](https://vercel.com) |
| Font | Inter (via `next/font/google`) |

---

## Architecture

```
retro-app/
├── app/
│   ├── page.tsx                        # Landing — create session
│   ├── retro/[sessionId]/page.tsx      # Board (Server Component → Client hydration)
│   └── api/
│       ├── sessions/route.ts           # POST: create session
│       ├── cards/route.ts              # POST: create card
│       └── export/[sessionId]/route.ts # GET: markdown export
├── components/
│   ├── board/          # RetroBoard, BoardColumn, RetroCard, CardEditor, AddCardButton
│   ├── presence/       # PresenceBar, PresenceAvatar
│   └── session/        # JoinModal, FacilitatorControls, InviteLinkButton
├── lib/
│   ├── channels/       # useRetroChannel — all Supabase Realtime subscriptions
│   ├── supabase/       # Browser + server clients, generated types
│   └── utils/          # userKey, sessionFormats, exportMarkdown
├── store/
│   ├── boardStore.ts   # Cards, votes, session state (Zustand)
│   └── presenceStore.ts
└── types/retro.ts
```

### Real-time channel

A single Supabase channel per session handles all live features:

```
Channel: retro_{sessionId}
  ├── postgres_changes → cards       (INSERT / UPDATE / DELETE)
  ├── postgres_changes → votes       (INSERT / DELETE)
  ├── postgres_changes → sessions    (UPDATE — reveal / lock state)
  ├── presence                       → online participants
  └── broadcast → CARD_TYPING        → typing indicators (3s timeout)
```

### Optimistic UI

Card creation is optimistic — the card appears immediately in the UI with a temp ID, then is confirmed (or rolled back) once the server responds. This keeps the experience snappy even on high-latency connections.

---

## Database schema

```sql
sessions      id · facilitator_id · title · format · is_revealed · is_locked
cards         id · session_id · column_id · author_key · content · position
votes         id · card_id · user_key   (UNIQUE card_id, user_key)
participants  id · session_id · user_key · display_name
```

### Identity & security

Identity is anonymous but **server-authoritative**: every visitor gets a Supabase
**anonymous auth** session (a signed JWT), and its `auth.uid()` is what backs authorship,
votes, and the facilitator role — not a client-supplied value. **Row Level Security** policies
(versioned in [`supabase/migrations/`](supabase/migrations)) enforce this at the database:

- Only the facilitator (`facilitator_id = auth.uid()`) can change a session's phase / vote limit.
- Cards, votes, and reactions can only be written as yourself; card **content** edits are
  author-only (enforced by a trigger), while grouping stays collaborative.
- Votes are idempotent via `UNIQUE(card_id, user_key)` and can't be stuffed by rotating keys.
- The realtime channel is **private**, so only session members can send/receive live events.
- The export endpoint requires authentication and session membership.

**Prerequisites** (one-time, per Supabase project):

1. Enable **Anonymous sign-ins** — Authentication → Providers → Anonymous.
2. Apply the migrations in `supabase/migrations/` (`supabase db push`, or paste into the SQL
   editor). These enable RLS; review the column-type notes at the top of `0001_rls.sql` first.
3. _(Optional, recommended for public deployments)_ **CAPTCHA** on anonymous sign-in —
   Authentication → Attack Protection → enable **Cloudflare Turnstile**, paste the Turnstile
   **secret** key, and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the matching **site** key. This
   throttles automated anonymous-user creation. Leave the env var unset to skip the challenge.

---

## Running locally

```bash
# 1. Clone
git clone https://github.com/prfanton/startstopcontinue.git
cd startstopcontinue

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | _(optional)_ Cloudflare Turnstile site key. Set to require a CAPTCHA on anonymous sign-in; must be paired with the Turnstile secret key in Supabase → Attack Protection. |

---

## Design

- **Warm espresso palette** — deep brown `#2d1200` text on a linen tile background
- **Frosted glass UI** — columns, cards, and controls use `backdrop-blur` + semi-transparent white, letting the background texture show through
- **Accent** — `#B83C28` dark terracotta for interactive elements and the brand mark
- All interactive controls are 43px tall for comfortable touch targets

---

## License

MIT
