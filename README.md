# HZA Weekly LION Reports

Per-client weekly LION Report forms for the PPC team.

## URL pattern

`https://{site}.netlify.app/{client-slug}.html`

Example: `https://hza-lion-reports.netlify.app/wholesale-apparel.html`

## Form design philosophy

The form captures only the **human inputs** — the things the bot can't know:

- What was optimized this week
- What issues are blocking performance
- Inventory status
- Client context / requests
- Plan of action for next week
- Expected outcomes

**The bot pulls everything else** (sales, ACoS, TACoS, PPC spend, organic, conversions, etc.) directly from Amazon Ads API + SP-API on Sunday night and merges with the form submission to produce the final LION report.

## How to add a new client

Edit `generate.py`, add the client name to the `CLIENTS` list, run `python3 generate.py`, commit, push.

Netlify auto-deploys on push to main.

## Form submissions

`netlify/functions/submit-lion.js` creates a ClickUp review task and immediately forwards the
same submission to the ZBD Insights LION page. ClickUp is the recovery system of record; the
dashboard copy is retriable and idempotent on `(client, week_ending)` with the ClickUp task ID
as version provenance.

The initial ClickUp task description contains a marked raw-JSON recovery block in the same
checked create call. The function also posts a redundant raw comment, retries transient
dashboard/comment failures, and returns success once the task exists even when dashboard sync
is pending. In that case the form explicitly says not to resubmit, avoiding duplicate tasks.

The current reliability design and reconciler contract live in the Obsidian vault at
`00-Home/Skills/hza-forms-sync/lion-forwarding-reconciliation-design.md`.

Function secrets are `CLICKUP_TOKEN` and `LION_INGEST_KEY`. The latter is a dedicated machine
credential accepted only by the dashboard's LION submit and carry-over-comment paths; do not
restore the former broad `ZBD_INSIGHTS_KEY` / `x-app-pass` integration.

Environment changes must be followed by a Git-triggered production build before treating the
new value as active in a running Netlify Function. This was verified during the 2026-08-31 key
resynchronization: the saved site configuration had changed while the published runtime still
held the preceding value.

## Color theme

Amber/orange accent (`#c97f3a`) to distinguish from the purple PM Brief forms.

## Deploying (read this before you touch anything)

**Git push is the only production publisher. Do not deploy this site any other way.**

The site is linked to `HymieZ/hza-lion-reports@main` (Netlify GitHub App installation
112211185). A push to `main` builds and publishes, functions included.

History worth knowing: until 2026-08-31 this site was **not** linked to any repo, and its
only deploy path was the `hza-forms-sync` Cloud Function's Netlify *digest deploy*, which by
design ships static files only and re-uses the already-published function bundle. The result
was that the 2026-08-20 commit adding LION -> ZBD Insights forwarding sat in GitHub for ten
days while production kept serving the 2026-07-23 function. Reports reached ClickUp and never
reached the dashboard, and nobody could see why, because the repo looked correct.

Two publishers to one production site is a rollback race: whichever finishes last wins,
regardless of which is newer. That is why forms-sync no longer deploys.
