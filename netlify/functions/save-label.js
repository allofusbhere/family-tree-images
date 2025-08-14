// Netlify Function: save-label
// Commits edits to labels.json in the GitHub repo specified by env REPO.
// Env vars required: GITHUB_TOKEN (repo scope), REPO (e.g., "allofusbhere/family-tree-images"), BRANCH (default "main"), ORIGIN_ALLOW
// CORS is restricted to ORIGIN_ALLOW (default: https://allofusbhere.github.io).

const BRANCH = process.env.BRANCH || "main";
const REPO = process.env.REPO; // "allofusbhere/family-tree-images"
const TOKEN = process.env.GITHUB_TOKEN;
const ORIGIN_ALLOW = process.env.ORIGIN_ALLOW || "https://allofusbhere.github.io";

const okConfig = () => ({
  headers: {
    "Access-Control-Allow-Origin": ORIGIN_ALLOW,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  }
});

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, ...okConfig(), body: JSON.stringify({ ok: true }) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, ...okConfig(), body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (!TOKEN || !REPO) {
    return { statusCode: 500, ...okConfig(), body: JSON.stringify({ error: "Missing GITHUB_TOKEN or REPO env var" }) };
  }

  try {
    const { id, meta } = JSON.parse(event.body || "{}");
    if (!id || !meta || typeof meta !== "object") {
      return { statusCode: 400, ...okConfig(), body: JSON.stringify({ error: "Missing id/meta" }) };
    }

    const path = "labels.json";
    const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
    const headers = { Authorization: `token ${TOKEN}`, "User-Agent": "swipetree" };

    // 1) Fetch current labels.json (if exists)
    let sha = null;
    let labels = {};
    const getRes = await fetch(api, { headers });
    if (getRes.ok) {
      const cur = await getRes.json();
      sha = cur.sha;
      try {
        const buff = Buffer.from(cur.content, cur.encoding || "base64");
        labels = JSON.parse(buff.toString("utf8"));
      } catch (e) {
        labels = {};
      }
    } else if (getRes.status !== 404) {
      const txt = await getRes.text();
      return { statusCode: getRes.status, ...okConfig(), body: JSON.stringify({ error: `GitHub read failed`, detail: txt }) };
    }

    // 2) Merge update
    labels[id] = meta;

    // 3) Commit
    const newContent = Buffer.from(JSON.stringify(labels, null, 2)).toString("base64");
    const putRes = await fetch(api, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `chore(labels): update ${id}`,
        content: newContent,
        sha,
        branch: BRANCH
      })
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return { statusCode: 500, ...okConfig(), body: JSON.stringify({ error: "GitHub commit failed", detail: txt }) };
    }

    return { statusCode: 200, ...okConfig(), body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, ...okConfig(), body: JSON.stringify({ error: "Unhandled error", detail: String(err) }) };
  }
};
Add save-label Netlify function
