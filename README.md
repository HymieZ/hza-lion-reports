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
