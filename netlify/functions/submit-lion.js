// Netlify Function: submit-lion
// Receives a LION report form submission and creates a ClickUp task
// with the raw form data preserved as a comment (same pattern as biweekly reports).
//
// Env vars required (set in Netlify dashboard):
//   CLICKUP_TOKEN  - personal API token (no Bearer prefix)

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN;
const CLICKUP_API = "https://api.clickup.com/api/v2";
const HYMIE_USER_ID = 43731147;

// Per-client PPC list IDs (where LION review tasks land).
// Source: ClickUp Clients space, per-client PPC list. Verified May 19, 2026.
const CLIENT_LIST_MAP = {
  "AllTech 365": "901710978755",
  "AP Deauville Amazon": "901710978756",
  "Balancing Act": "901711292041",
  "Eat2Explore": "901711033113",
  "Global Wholesale Amazon": "901710978757",
  "Global Wholesale Walmart": "901711028001",
  "IJoy Electronics": "901710978773",
  "Josmo Shoes": "901713135175",
  "Kaffy": "901713027762",
  "Laundry Labs": "901713799832",
  "Louisiana Lumber": "901710978758",
  "Luxury Collection": "901710978759",
  "Marknox Global": "901710978781",
  "NSA Lighting": "901710978762",
  "OX Plastics Amazon": "901710978765",
  "OX Plastic Walmart": "901713829662",
  "Personalized Passion": "901710978764",
  "Rolling Pin": "901710978776",
  "Rubber Bond": "901710978780",
  "Savor Goods": "901710978766",
  "Savor Goods Walmart": "901713161824",
  "Shalam Group": "901710978768",
  "Sophie Select": "901711543700",
  "Superior Products": "901713372694",
  "Wholesale Apparel": "901710978771",
  "Wild Bobby": "901713292435",
  "Galaxy by Harvic": "901710978784",
};

// Fallback list when client not yet mapped (lands in Hymie's queue for routing).
const FALLBACK_LIST = "901710978755"; // AllTech 365 PPC list — Hymie watches

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
  const listId = CLIENT_LIST_MAP[client] || FALLBACK_LIST;

  const taskName = `LION Report Submission — ${client} — Week ending ${weekEnding}`;
  const description = formatDescription(data);

  // 1. Create the task
  let task;
  try {
    const resp = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: taskName,
        description,
        assignees: [HYMIE_USER_ID],
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
    await fetch(`${CLICKUP_API}/task/${task.id}/comment`, {
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
    // Non-fatal — task already created
    console.error("Comment post failed:", e.message);
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
