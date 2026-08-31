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

Submissions go to Netlify Forms (built-in). View them in the Netlify dashboard under Forms → `lion-report`.

A Make.com scenario will eventually subscribe to submissions and:
1. Pull this week's API data for the client
2. Generate the Weekly Performance commentary via Claude / GPT-4o-mini
3. Append a new section to the existing LION Google Doc
4. Post the link + summary to the Weekly LION Report ClickUp task

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
