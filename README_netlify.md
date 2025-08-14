# Netlify setup for SwipeTree labels

This deploys a serverless function that commits `labels.json` to your `family-tree-images` repo whenever the app saves an edit.

## Files
- `netlify/functions/save-label.js` – serverless function
- `netlify.toml` – config pointing to the functions directory

## One-time setup
1. Create a **GitHub token** (classic) with **repo** scope.
2. In Netlify → your site → **Site settings → Environment variables**, set:
   - `GITHUB_TOKEN` = your token
   - `REPO` = `allofusbhere/family-tree-images`
   - (optional) `BRANCH` = `main`
   - (optional) `ORIGIN_ALLOW` = `https://allofusbhere.github.io` (or your domain)
3. Deploy the site. Your function will be available at:
   `https://<your-site>.netlify.app/.netlify/functions/save-label`

## Security
- The token lives only in Netlify’s env vars (never exposed to the browser).
- CORS is restricted to `ORIGIN_ALLOW` by default.
