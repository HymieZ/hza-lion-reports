// Netlify Function: submit-lion
// Receives a LION report form submission and creates a ClickUp task
// with the raw form data preserved as a comment (same pattern as biweekly reports).
//
// Env vars required (set in Netlify dashboard):
//   CLICKUP_TOKEN  - personal API token (no Bearer prefix)

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN;
const CLICKUP_API_V2 = "https://api.clickup.com/api/v2";
const CLICKUP_API_V3 = "https://api.clickup.com/api/v3";
const WORKSPACE_ID = "9017107139";
const HYMIE_USER_ID = 43731147;

// Channel where every LION submission posts a notification (Hymie + PMs)
const LION_NOTIFICATIONS_CHANNEL_ID = "8cqc8p3-162237";

// PM IDs
const KRISTINA_ID = 89241104;
const SHERALYN_ID = 95144395;

// Per-client config: dedicated LION Reports list (created 2026-05-26) + PM (review assignee) + main internal channel.
// LION submissions land in a per-client dedicated list, separate from the general PPC list.
// Each list is named "LION Reports" inside the client's folder. PM tags PPC person in comments to discuss.
// `channel` is the client's main internal ClickUp chat channel (from client-registry.json).
// Walmart counterparts without dedicated channels reuse their Amazon channel.
const CLIENTS = {
  "AllTech 365":             { list: "901714067256", pm: KRISTINA_ID, channel: "4-90171101286-8" },
  "AP Deauville Amazon":     { list: "901714067258", pm: KRISTINA_ID, channel: "4-90170775261-8" },
  "Balancing Act":           { list: "901714067259", pm: KRISTINA_ID, channel: "5-90176729151-8" },
  "Eat2Explore":             { list: "901714067261", pm: KRISTINA_ID, channel: "4-90170967840-8" },
  "Global Wholesale Amazon": { list: "901714067262", pm: SHERALYN_ID, channel: "4-90170775097-8" },
  "IJoy Electronics":        { list: "901714067264", pm: SHERALYN_ID, channel: "5-90173726301-8" },
  "Josmo Shoes":             { list: "901714067265", pm: KRISTINA_ID, channel: "5-90178337268-8" },
  "Kaffy":                   { list: "901714067267", pm: KRISTINA_ID, channel: "5-90178257954-8" },
  "Laundry Labs":            { list: "901714067269", pm: KRISTINA_ID, channel: "5-90178825997-8" },
  "Louisiana Lumber":        { list: "901714067270", pm: SHERALYN_ID, channel: "4-90170775242-8" },
  "Luxury Collection":       { list: "901714067272", pm: SHERALYN_ID, channel: "4-90170775251-8" },
  "OX Plastics Amazon":      { list: "901714067273", pm: SHERALYN_ID, channel: "4-90170775258-8" },
  "OX Plastic Walmart":      { list: "901714067274", pm: SHERALYN_ID, channel: "4-90170775258-8" }, // reuses Amazon channel
  "Personalized Passion":    { list: "901714067276", pm: KRISTINA_ID, channel: "4-90171014580-8" },
  "Rolling Pin":             { list: "901714067277", pm: KRISTINA_ID, channel: "5-90174894794-8" },
  "Rubber Bond":             { list: "901714067278", pm: SHERALYN_ID, channel: "5-90176024611-8" },
  "Savor Goods":             { list: "901714067280", pm: SHERALYN_ID, channel: "4-90170890034-8" },
  "Savor Goods Walmart":     { list: "901714067283", pm: SHERALYN_ID, channel: "4-90170890034-8" }, // reuses Amazon channel
  "Shalam Group":            { list: "901714067284", pm: KRISTINA_ID, channel: "4-90171062793-8" },
  "Sophie Select":           { list: "901714067285", pm: KRISTINA_ID, channel: "5-90177096446-8" },
  "Superior Products":       { list: "901714067286", pm: KRISTINA_ID, channel: "5-90178513854-8" },
  "Wholesale Apparel":       { list: "901714067287", pm: KRISTINA_ID, channel: "5-90172690990-8" },
  "Wild Bobby":              { list: "901714067291", pm: KRISTINA_ID, channel: "5-90178453011-8" },
  "Galaxy by Harvic":        { list: "901714067293", pm: SHERALYN_ID, channel: "5-90176599383-8" },
  "Silly George":            { list: "901714838438", pm: KRISTINA_ID },
  "NEXGEL":                  { list: "901714838463", pm: KRISTINA_ID },
  "Kenkoderm":               { list: "901714838493", pm: KRISTINA_ID },
  "VytaDose":                { list: "901714873343", pm: KRISTINA_ID },
  // Global Wholesale Walmart: TODO — folder ID not yet captured; LION list pending
};

// Fallback when client not yet mapped — lands in AllTech 365's LION list, assigned to Hymie for routing
const FALLBACK = { list: "901714067256", pm: HYMIE_USER_ID };

const OPTIMIZATION_LABELS = {
  opt_paused: "Paused low-performing campaigns / keywords",
  opt_launched: "Launched new campaigns",
  opt_bids_up: "Increased bids on top performers",
  opt_bids_down: "Decreased bids on poor performers",
  opt_negatives: "Added negative keywords",
  opt_harvested: "Harvested search terms (SQP / STR)",
  opt_coupons: "Applied coupons / Lightning Deals / Best Deals",
  opt_btps: "Launched Brand-tailored Promotions (BTPs)",
  opt_restructured: "Restructured campaigns",
  opt_listing: "Listing changes (images / title / A+ / bullets)",
  opt_price: "Price changes",
  opt_vine: "Enrolled / managed Vine reviews",
};

const ISSUE_LABELS = {
  issue_stock: "Stock issue / Low inventory / OOS",
  issue_delivery: "Late delivery (Amazon shipping window)",
  issue_rating: "Rating dropped / Low rating",
  issue_acos: "High ACoS that won't stabilize",
  issue_cvr: "Conversion rate dropping",
  issue_returns: "Returns / Refund issue",
  issue_seasonal: "Seasonal slowdown",
  issue_pricing: "Pricing affecting sales",
  issue_listing: "Listing suppression / Account health flag",
  issue_competitor: "Competitor activity",
  issue_vine: "Vine reviews still incoming / not enough",
  issue_launch: "New launch underperforming",
  issue_client: "Client concern / change in direction",
  issue_none: "No major issues",
};

// Return Unix-ms timestamp for the first Monday on or after `weekEndingStr`
// (YYYY-MM-DD). Used to populate `due_date` on the PM review task so every
// LION report has a hard deadline that lines up with Monday brief work.
// Returns null if input is missing/unparseable; falls back to the upcoming
// Monday relative to today.
function computeMondayDueMs(weekEndingStr) {
  let y, m, d;
  if (weekEndingStr && /^\d{4}-\d{2}-\d{2}$/.test(weekEndingStr)) {
    [y, m, d] = weekEndingStr.split("-").map(Number);
  } else {
    const now = new Date();
    y = now.getUTCFullYear();
    m = now.getUTCMonth() + 1;
    d = now.getUTCDate();
  }
  // Anchor at 12:00 UTC to dodge DST/midnight edge cases when ClickUp
  // renders the date in the workspace timezone.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMon = (8 - dow) % 7; // Sun→1, Mon→0, Tue→6, ..., Sat→2
  dt.setUTCDate(dt.getUTCDate() + daysToMon);
  return dt.getTime();
}

function parseBody(event) {
  const ct = (event.headers["content-type"] || event.headers["Content-Type"] || "").toLowerCase();
  if (ct.includes("application/json")) {
    return JSON.parse(event.body || "{}");
  }
  // form-encoded
  const params = new URLSearchParams(event.body || "");
  const out = {};
  for (const [k, v] of params) {
    // collect repeated keys (e.g. multi-checkboxes) into arrays
    if (out[k] !== undefined) {
      if (Array.isArray(out[k])) out[k].push(v);
      else out[k] = [out[k], v];
    } else {
      out[k] = v;
    }
  }
  return out;
}

function checkedItems(data, labels) {
  return Object.entries(labels)
    .filter(([key]) => data[key] === "Yes" || (Array.isArray(data[key]) && data[key].includes("Yes")))
    .map(([, label]) => label);
}

function formatDescription(data) {
  const optimizations = checkedItems(data, OPTIMIZATION_LABELS);
  const issues = checkedItems(data, ISSUE_LABELS);

  const lines = [];
  lines.push(`**Client:** ${data.client || "—"}`);
  lines.push(`**Week ending:** ${data.week_ending || "—"}`);
  lines.push(`**Submitted by:** ${data.ppc_person || "—"}`);
  lines.push("");
  lines.push(`---`);
  lines.push("");

  lines.push(`## 1. This Week's Story`);
  lines.push("");
  lines.push(data.week_summary || "_(not provided)_");
  lines.push("");
  lines.push(`**Top performers:** ${data.top_performers || "—"}`);
  if (data.underperformers) lines.push(`**Underperformers:** ${data.underperformers}`);
  lines.push("");

  lines.push(`## 2. What We Did This Week`);
  if (optimizations.length) {
    lines.push("");
    for (const o of optimizations) lines.push(`- ${o}`);
  } else {
    lines.push("");
    lines.push("_(none checked)_");
  }
  if (data.specific_actions) {
    lines.push("");
    lines.push(`**Specific actions:** ${data.specific_actions}`);
  }
  lines.push("");

  lines.push(`## 3. Issues Affecting Performance`);
  if (issues.length) {
    lines.push("");
    for (const i of issues) lines.push(`- ${i}`);
  } else {
    lines.push("");
    lines.push("_(none checked)_");
  }
  if (data.issue_details) {
    lines.push("");
    lines.push(`**Details:** ${data.issue_details}`);
  }
  lines.push("");

  lines.push(`## 4. Inventory Status`);
  lines.push("");
  lines.push(`**Overall:** ${data.inventory_status || "—"}`);
  if (data.inventory_skus) lines.push(`**SKUs with concern:** ${data.inventory_skus}`);
  if (data.restock_eta) lines.push(`**Restock ETA:** ${data.restock_eta}`);
  lines.push("");

  if (data.client_context) {
    lines.push(`## 5. Client Context`);
    lines.push("");
    lines.push(data.client_context);
    lines.push("");
  }

  lines.push(`## 6. Plan for Next Week`);
  lines.push("");
  if (data.priority_1) lines.push(`**Priority 1:** ${data.priority_1}`);
  if (data.priority_2) lines.push(`**Priority 2:** ${data.priority_2}`);
  if (data.priority_3) lines.push(`**Priority 3:** ${data.priority_3}`);
  if (data.focus_asins) lines.push(`**ASINs/SKUs focus:** ${data.focus_asins}`);
  if (data.budget_plan) {
    lines.push("");
    lines.push(`**Budget/campaign changes:** ${data.budget_plan}`);
  }
  if (data.launches_planned) lines.push(`**Launches planned:** ${data.launches_planned}`);
  lines.push("");

  lines.push(`## 7. Expected Outcome`);
  lines.push("");
  lines.push(data.expected_outcomes || "—");
  lines.push("");

  // --- Section 8: Account Structure Self-Check ---
  const structuralChecks = [
    { key: "structural_keywords", label: "8+ keywords per pushed parent (Auto + Broad + Exact)", note: "structural_keywords_note" },
    { key: "structural_variants", label: "Every 100+ DoS child ASIN has an active campaign", note: "structural_variants_note" },
    { key: "structural_idle", label: "Bids/budgets adjusted within last 3 days", note: "structural_idle_note" },
    { key: "structural_brand", label: "Brand-term negatives in place on Autos", note: "structural_brand_note" },
    { key: "structural_listing", label: "Listings complete + rating ≥ 4.0 on scaled ASINs", note: "structural_listing_note" },
  ];
  const anyStructuralAnswered = structuralChecks.some(c => data[c.key]);
  if (anyStructuralAnswered) {
    lines.push(`## 8. Account Structure Self-Check`);
    lines.push("");
    for (const c of structuralChecks) {
      const answer = data[c.key];
      if (!answer) continue;
      const flag = answer === "Yes" ? "✅" : answer === "N/A" ? "➖" : "⚠️";
      lines.push(`- ${flag} **${c.label}** — ${answer}`);
      const noteVal = data[c.note];
      if (noteVal && answer !== "Yes") {
        lines.push(`    - Note: ${noteVal}`);
      }
    }
    lines.push("");
  }

  if (data.anything_else) {
    lines.push(`## 9. Anything Else`);
    lines.push("");
    lines.push(data.anything_else);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`_Submitted via LION form. Raw submission preserved as a comment below._`);
  lines.push(`_Numbers (sales, ACoS, TACoS, etc.) will be auto-appended by the data bot when wired up._`);

  return lines.join("\n");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (!CLICKUP_TOKEN) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "Server missing CLICKUP_TOKEN env var" }) };
  }

  let data;
  try {
    data = parseBody(event);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid body: " + e.message }) };
  }

  const client = data.client || "Unknown Client";
  const weekEnding = data.week_ending || new Date().toISOString().slice(0, 10);
  const ppcPerson = data.ppc_person || "Unknown";
  const cfg = CLIENTS[client] || FALLBACK;
  const listId = cfg.list;
  const pmId = cfg.pm;

  const taskName = `LION Report — ${client} — Week ending ${weekEnding}`;
  const description = formatDescription(data);

  // Due date = the first Monday on or after the report's week_ending.
  // PPC fills out Friday → PM reviews by Monday (Monday brief depends on it).
  // Fallback: if week_ending unparseable, use the upcoming Monday from today.
  const dueDateMs = computeMondayDueMs(weekEnding);

  // 1. Create the review task in the client's PPC list, assigned to the PM
  let task;
  try {
    const resp = await fetch(`${CLICKUP_API_V2}/list/${listId}/task`, {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: taskName,
        description,
        assignees: [pmId],
        priority: 3,
        status: "pm review",
        ...(dueDateMs ? { due_date: dueDateMs, due_date_time: false } : {}),
      }),
    });
    task = await resp.json();
    if (!resp.ok) {
      return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: "ClickUp create task failed", detail: task }) };
    }
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: "Network error creating task: " + e.message }) };
  }

  // 2. Add raw submission data as a comment (preserve forever)
  try {
    await fetch(`${CLICKUP_API_V2}/task/${task.id}/comment`, {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment_text:
          "RAW SUBMISSION DATA (preserved permanently):\n\n" +
          "```\n" +
          JSON.stringify(data, null, 2) +
          "\n```",
      }),
    });
  } catch (e) {
    console.error("Comment post failed:", e.message);
  }

  // Build the notification body once — posted to both LION Notifications and the client's main channel.
  const issues = checkedItems(data, ISSUE_LABELS);
  const issuesText = issues.length ? issues.slice(0, 3).join(", ") + (issues.length > 3 ? ` (+${issues.length - 3} more)` : "") : "None flagged";
  const pmTag = pmId === KRISTINA_ID ? "Kristina" : pmId === SHERALYN_ID ? "Sheralyn" : "Hymie";
  const notification =
    `📋 **New LION Report — ${client}** — Week ending ${weekEnding}\n\n` +
    `**Submitted by:** ${ppcPerson}\n` +
    `**Reviewer:** ${pmTag}\n` +
    `**Top performers:** ${data.top_performers || "—"}\n` +
    `**Issues flagged:** ${issuesText}\n\n` +
    `**Inventory status:** ${data.inventory_status || "—"}\n\n` +
    `🔗 [Open task in ClickUp](${task.url})`;

  async function postToChannel(channelId, label) {
    try {
      await fetch(`${CLICKUP_API_V3}/workspaces/${WORKSPACE_ID}/chat/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          content_format: "text/md",
          content: notification,
        }),
      });
    } catch (e) {
      console.error(`Channel post failed (${label}):`, e.message);
    }
  }

  // 3. Post to LION Report Notifications channel (agency-wide visibility)
  await postToChannel(LION_NOTIFICATIONS_CHANNEL_ID, "LION Notifications");

  // 4. Per-client internal-channel post DISABLED (Hymie decision 2026-07-23):
  // LION submissions post ONLY to the agency-wide LION Notifications channel above,
  // NOT to each client's main internal team channel. The `channel` field is retained
  // in the CLIENTS map for reference but is intentionally not used here.
  // (Re-enable by restoring the `if (cfg.channel) { await postToChannel(...) }` block.)

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      taskId: task.id,
      taskUrl: task.url,
      taskName,
      listId,
      pmId,
      ppcPerson,
      client,
    }),
  };
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
