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

// Per-client config: dedicated LION Reports list (created 2026-05-26) + PM (review assignee).
// LION submissions land in a per-client dedicated list, separate from the general PPC list.
// Each list is named "LION Reports" inside the client's folder. PM tags PPC person in comments to discuss.
const CLIENTS = {
  "AllTech 365":             { list: "901714067256", pm: KRISTINA_ID },
  "AP Deauville Amazon":     { list: "901714067258", pm: KRISTINA_ID },
  "Balancing Act":           { list: "901714067259", pm: KRISTINA_ID },
  "Eat2Explore":             { list: "901714067261", pm: KRISTINA_ID },
  "Global Wholesale Amazon": { list: "901714067262", pm: SHERALYN_ID },
  "IJoy Electronics":        { list: "901714067264", pm: SHERALYN_ID },
  "Josmo Shoes":             { list: "901714067265", pm: KRISTINA_ID },
  "Kaffy":                   { list: "901714067267", pm: KRISTINA_ID },
  "Laundry Labs":            { list: "901714067269", pm: KRISTINA_ID },
  "Louisiana Lumber":        { list: "901714067270", pm: SHERALYN_ID },
  "Luxury Collection":       { list: "901714067272", pm: SHERALYN_ID },
  "OX Plastics Amazon":      { list: "901714067273", pm: SHERALYN_ID },
  "OX Plastic Walmart":      { list: "901714067274", pm: SHERALYN_ID },
  "Personalized Passion":    { list: "901714067276", pm: KRISTINA_ID },
  "Rolling Pin":             { list: "901714067277", pm: KRISTINA_ID },
  "Rubber Bond":             { list: "901714067278", pm: SHERALYN_ID },
  "Savor Goods":             { list: "901714067280", pm: SHERALYN_ID },
  "Savor Goods Walmart":     { list: "901714067283", pm: SHERALYN_ID },
  "Shalam Group":            { list: "901714067284", pm: KRISTINA_ID },
  "Sophie Select":           { list: "901714067285", pm: KRISTINA_ID },
  "Superior Products":       { list: "901714067286", pm: KRISTINA_ID },
  "Wholesale Apparel":       { list: "901714067287", pm: KRISTINA_ID },
  "Wild Bobby":              { list: "901714067291", pm: KRISTINA_ID },
  "Galaxy by Harvic":        { list: "901714067293", pm: SHERALYN_ID },
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

  if (data.anything_else) {
    lines.push(`## 8. Anything Else`);
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
        status: "to do",
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

  // 3. Post notification to LION Report Notifications channel
  try {
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

    await fetch(`${CLICKUP_API_V3}/workspaces/${WORKSPACE_ID}/chat/channels/${LION_NOTIFICATIONS_CHANNEL_ID}/messages`, {
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
    console.error("Channel notification post failed:", e.message);
  }

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
