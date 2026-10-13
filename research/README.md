# Research

A reference library for finding the arena's next ideas: trading strategies in general, what suits this
platform's instruments and leverage tiers, and what others (papers, open-source projects, forums) have
learned. Shown on the dashboard's **Research** tab (trader.veron3.space/research).

| Path | What | In git |
|---|---|---|
| `report.md` | the report: what is worth trying, ranked, with links into the notes | yes |
| `topics/<slug>.md` | one note per topic: findings, evidence, ideas for the arena, open questions, sources | yes |
| `sources/<slug>.json` | the sources of each note (id, title, authors, year, kind, url, saved copy) | yes |
| `files/<slug>/` | saved copies: papers (PDF) and snapshots of pages that may change (Markdown) | no |
| `BRIEF.md` | the brief research agents work from (platform summary, conventions) | yes |

Citations in the notes look like `[leverage-03]`; the dashboard links them to the library entry.

`files/` stays out of the public repo because it holds other people's work. It lives on the lab PC and
is copied to the server with `ops/server/sync-research.sh`, where the Research tab serves it behind the
login. Every source keeps its original URL, so a lost copy can be downloaded again.

## Passes

- **2026-10-13, first pass:** six topics researched in parallel — leverage, trading at 1:1 (fees,
  dividends, crypto), documented anomalies and how they decay, AI and LLM trading, practitioner
  communities, portfolio and meta-strategies.
