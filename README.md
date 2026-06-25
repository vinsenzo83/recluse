# 🕷️ RECLUSE

[![npm](https://img.shields.io/npm/v/recluse-mcp)](https://www.npmjs.com/package/recluse-mcp)

**Autonomous web-contract verification** — an MCP server + GitHub Action + collective bug-corpus that catches the bugs hiding in your system's seams.

> The recluse bites the bugs that hide in the seams.

Vibe-coding made *building* fast — but *fixing* slow. RECLUSE traces your system's seams (producer → store → consumer contracts), catches the bugs that live there, blocks the PR, and pools every caught pattern into a **collective corpus** that makes everyone's spider smarter.

→ **Live page & corpus:** https://eduverse-ai.app/recluse

---

## Quickstart

### ① GitHub Action — gate every PR (blocks on 🔴)

```yaml
# .github/workflows/recluse.yml
name: RECLUSE
on:
  pull_request:
    branches: [main]
jobs:
  weave:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: vinsenzo83/recluse@v1.1
        with: { base: origin/${{ github.base_ref }} }
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Without a key it runs in **advisory** mode (known-trap checklist, non-blocking). With `ANTHROPIC_API_KEY` it does a real weave on the diff + 🔴 blocking + contributes new patterns to the corpus.

### ② MCP server — for your editor (Cursor, Claude, any MCP client)

One line, no clone — published on npm:

```json
{ "mcpServers": { "recluse": {
  "command": "npx",
  "args": ["-y", "recluse-mcp"],
  "env": { "SPIDER_CORPUS_API": "https://eduverse-ai.app/api/corpus" }
} } }
```

**MCP tools:** `spider_plan` · `spider_classify_tier` · `spider_checklist` · `spider_record_pattern` (local + shared contribution) · `spider_pull_corpus` (collective pull).
**MCP resources:** `spider://checklist` · `spider://queries` · `spider://corpus` · `spider://blackbox`.

---

## How it works — autonomous loop

```
WEB (detect) → CATCH (a contract mismatch) → SPIDER (autonomous fix) → RE-WEAVE (verify) → loop until 🔴 = 0
```

Multi-perspective spiders trace each end-to-end flow and compare what's *written* (column / type / enum / unit / authz) against what the *consumer expects*. Mismatches in the seams — the bugs no single-file review catches — get caught with live evidence.

### Spider tiers — resource by criticality
| Spider | Model | Scope |
|---|---|---|
| 🕷️ King | Opus | payments · auth · GDPR · data loss · secrets |
| 🕸️ Mid | Sonnet | business logic · contracts · i18n · gating |
| 🐜 Baby | Haiku | docs · dead code · lint |

---

## 🧬 Collective corpus (the moat)

The more people use it, the thicker the corpus — every spider catches more (data network effect). Patterns are tech-stack-keyed, so a bug caught in one project helps everyone on the same stack.

- **Scrub-first:** file paths, code literals, secrets (keys / JWT / high-entropy), emails, URLs, IPs are stripped; anything still suspicious is **rejected**. Only the generalized *technique* is shared.
- **Opt-in & anonymous:** contributors/projects are stored only as irreversible hashes — no identity, no raw text.

### Corpus API
- `POST /v1/patterns` `{klass,name,signal,fix,tags?,severity?,tier?}` → scrub · dedup · trust accrual
- `GET  /v1/patterns?tags=postgres,payment&class=unit&limit=50` → collective corpus (verified · hit_count order)
- `GET  /healthz`

---

## Principles
No fabrication (live evidence only) · scrub-first (zero code/secret leakage) · opt-in & anonymous · detection = read-only, fixes = isolated spiders.

## Repo layout
```
src/index.js            # MCP server (stdio)
cli/recluse.mjs         # CI weave CLI
action.yml              # GitHub Action
```
The collective corpus is a hosted service (https://eduverse-ai.app/api/corpus); its backend (schema, scrub pipeline, ingestion) is closed-source.

## License
UNLICENSED (proprietary).
