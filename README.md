# Relay

Local-first Postman-style API client for Windows/macOS/Linux. Test APIs, organize packs, manage environments, share workspaces with a team of up to **15** members, and import OpenAPI/Swagger for docs.

## Features

- Request builder: methods, URL, params, headers, body (JSON/raw/form), auth (Bearer/Basic/API Key)
- Side-by-side or stacked request/response layout (resizable; panes scale with the window)
- Search in request and response panels separately (click the search icon, or **Ctrl/Cmd+F** in a panel)
- Packs & folders with save / duplicate / delete
- Environments with `{{variable}}` substitution (case-insensitive names)
- Request history
- cURL preview/copy, and import from a pasted cURL command
- Team workspaces capped at **15 members** (owner / editor / viewer)
- OpenAPI 3 / Swagger 2 import → pack + docs viewer with Try
- Import/Export: Relay workspace (`.relay.json`), Postman Collection v2.1, OpenAPI

Data stays on your machine (SQLite in the app user-data folder). Cross-machine sharing is via Export → Import.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
npm run dev
```

This starts Vite + Electron. On first launch, register a local account, then create or use the default workspace.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development (Electron + hot reload) |
| `npm run build` | Production build + installer |
| `npm run build:dir` | Unpackaged build for local testing |
| `npm run typecheck` | TypeScript check |

## Layout

Use the layout controls next to **Save**:

- **Side by side** — request left, response right
- **Stacked** — request above, response below
- **Swap** — reverse request/response order

Drag the divider to resize. Sizes are saved as percentages so the layout stays proportional when you resize the window.

## Team (max 15)

1. Each teammate creates a **local account** on the same machine (or you Export/Import the workspace).
2. Open **Team** → invite by username (editor or viewer).
3. Invites are rejected once the workspace has 15 members.

To share across machines: **Export** a `.relay.json` file and have a teammate **Import** it.

## OpenAPI / Swagger

Use the **Docs / Swagger** tab to:

- Import a file, paste YAML/JSON, or fetch a URL
- Browse endpoints and click **Try** to load them into the request builder
- Auto-generate a pack (grouped by tags)

## Tips

- Select an environment in the toolbar, then open **Env** to define variables (e.g. `baseURL` → `http://localhost:4000`).
- Use `{{baseURL}}` (or `{{baseUrl}}` — matching is case-insensitive) in the URL, headers, body, and auth fields.
- Paste a cURL into the URL field, or open **cURL → Import**, to fill method, URL, headers, auth, and body.
- If a `{{variable}}` is missing or no environment is selected, Send shows a clear error instead of calling a bad URL.
- Search: open the search icon in the request or response panel; **Enter** / **Shift+Enter** for next/previous match; **Esc** to close.
- Viewers can send requests and browse; they cannot edit packs or invite members.
- HTTP requests are proxied through Electron (no browser CORS limits).
