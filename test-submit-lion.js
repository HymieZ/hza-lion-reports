const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.CLICKUP_TOKEN = "test-clickup-token";
process.env.LION_INGEST_KEY = "test-dashboard-key";

const { handler } = require("./netlify/functions/submit-lion.js");

function event(data) {
  return {
    httpMethod: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  };
}

function payload(overrides = {}) {
  return {
    client: "Test Client",
    week_ending: "2026-08-30",
    ppc_person: "Tester",
    week_summary: "A useful week",
    top_performers: "SKU-1",
    inventory_status: "Healthy",
    ...overrides,
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("oversized recovery description is rejected before any external call", async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error("must not be called"); };
  const result = await handler(event(payload({ week_summary: "x".repeat(245 * 1024) })));
  assert.equal(result.statusCode, 413);
  assert.equal(calls, 0);
});

test("task creation is atomic, redundant comment and dashboard retry, and provenance is forwarded", async () => {
  const calls = [];
  let rawCommentAttempts = 0;
  let dashboardAttempts = 0;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/lion-routing.json")) {
      return jsonResponse({ "Test Client": { list: "list-1", pm: 123 } });
    }
    if (String(url).includes("/list/list-1/task")) {
      return jsonResponse({ id: "task-1", url: "https://app.clickup.com/t/task-1", date_created: "2000" });
    }
    if (String(url).includes("/task/task-1/comment")) {
      const body = JSON.parse(options.body);
      if (body.comment_text.startsWith("RAW SUBMISSION DATA")) {
        rawCommentAttempts += 1;
        return rawCommentAttempts === 1 ? jsonResponse({ error: "busy" }, 500) : jsonResponse({ id: "comment-1" });
      }
      return jsonResponse({ id: "comment-other" });
    }
    if (String(url) === "https://zbd-insights.netlify.app/api/data" && options.method === "POST") {
      dashboardAttempts += 1;
      return dashboardAttempts === 1
        ? jsonResponse({ ok: false, error: "busy" }, 500)
        : jsonResponse({ ok: true, result: "created" });
    }
    if (String(url).startsWith("https://zbd-insights.netlify.app/api/data?lion_comments=")) {
      return jsonResponse({ ok: true, comments: [] });
    }
    if (String(url).includes("/chat/channels/")) return jsonResponse({ id: "message-1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const data = payload();
  const result = await handler(event(data));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.dashboardOk, true);
  assert.equal(body.dashboardResult, "created");
  assert.equal(body.rawCommentOk, true);
  assert.equal(rawCommentAttempts, 2);
  assert.equal(dashboardAttempts, 2);

  const createCall = calls.find((call) => call.url.includes("/list/list-1/task"));
  const description = JSON.parse(createCall.options.body).description;
  assert.match(description, /<!-- LION_RAW_V1_START -->/);
  assert.match(description, /<!-- LION_RAW_V1_END -->/);
  assert.ok(description.includes(JSON.stringify(data)));

  const dashboardCall = calls.filter((call) => call.url === "https://zbd-insights.netlify.app/api/data" && call.options.method === "POST").at(-1);
  const forwarded = JSON.parse(dashboardCall.options.body);
  assert.equal(forwarded.task_id, "task-1");
  assert.equal(forwarded.task_created_at, "2000");
  assert.equal(forwarded.hash_schema, "lion-canonical-json-v1");
  assert.equal(forwarded.payload_hash, "046a7ea6c3e94d8c33068609eae7dec7730d4345fddb196c6ca9c3880280859a");
  assert.equal(forwarded.ingest_mode, "live");
  assert.equal(dashboardCall.options.headers["x-lion-ingest-key"], "test-dashboard-key");
});

test("dashboard rejection does not invite a duplicate task and leaves a failure marker", async () => {
  const comments = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/lion-routing.json")) {
      return jsonResponse({ "Test Client": { list: "list-1", pm: 123 } });
    }
    if (String(url).includes("/list/list-1/task")) {
      return jsonResponse({ id: "task-2", url: "https://app.clickup.com/t/task-2", date_created: "3000" });
    }
    if (String(url).includes("/task/task-2/comment")) {
      comments.push(JSON.parse(options.body).comment_text);
      return jsonResponse({ id: `comment-${comments.length}` });
    }
    if (String(url) === "https://zbd-insights.netlify.app/api/data" && options.method === "POST") {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }
    if (String(url).startsWith("https://zbd-insights.netlify.app/api/data?lion_comments=")) {
      return jsonResponse({ ok: true, comments: [] });
    }
    if (String(url).includes("/chat/channels/")) return jsonResponse({ id: "message-1" });
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await handler(event(payload()));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.dashboardOk, false);
  assert.equal(body.dashboardResult, "http_401");
  assert.equal(comments.some((text) => text.includes("DASHBOARD SYNC PENDING")), true);
});
