# Naming Analysis Report

## Current Situation: 3 Different Names

| Name | Where Used | Purpose |
|------|------------|---------|
| `gpt5mcp` | package.json, GitHub repo, folder name | npm package name |
| `gpt5-server` | src/index.ts, binaries, some docs | MCP server internal name |
| `gpt5` | .mcp.json, README config examples | MCP server ID in Claude Code |

This is confusing because:
- User sees `gpt5` in Claude Code
- Code says `gpt5-server`
- Package is `gpt5mcp`

---

## npm Availability Check

| Name | Available |
|------|-----------|
| `gpt5mcp` | ✅ Yes |
| `gpt5-mcp` | ✅ Yes |
| `gpt5-server` | ✅ Yes |

All names are available on npm.

---

## Occurrences in Codebase

### `gpt5-server` (17 occurrences)

| File | Context |
|------|---------|
| `src/index.ts` | `name: "gpt5-server"` - MCP server registration |
| `build/index.js` | Same (compiled) |
| `dist/index.js` | Same (old build) |
| `CLAUDE.md` | Documentation |
| `README.md` | Troubleshooting section |
| `release/README.md` | Binary names |
| `release/*.json` | Config templates |
| `.claude/settings.local.json` | Tool permissions |

### `gpt5` (6 occurrences)

| File | Context |
|------|---------|
| `.mcp.json` | Server ID: `"gpt5": {...}` |
| `README.md` | Config examples |
| `release/mcp-config-*.json` | Config templates |

### `gpt5mcp` (15 occurrences)

| File | Context |
|------|---------|
| `package.json` | `"name": "gpt5mcp"` |
| `README.md` | Clone URL, paths |
| Various .md files | Absolute paths |

---

## The Problem

When a user runs:
```bash
claude mcp add gpt5 ...
```

Claude Code registers server as `gpt5`. But the MCP server reports its name as `gpt5-server`.

When tools are called, they appear as:
```
mcp__gpt5__gpt5_agent      # If server ID is "gpt5"
mcp__gpt5-server__gpt5_agent  # If server ID is "gpt5-server"
```

---

## Recommendation: Unify to `gpt5mcp`

### Why `gpt5mcp`?

1. **Already the npm package name** - no changes needed for publish
2. **Matches GitHub repo** - `AllAboutAI-YT/gpt5mcp`
3. **Unique and searchable** - "gpt5" alone is too generic
4. **Consistent** - one name everywhere

### Changes Required

| File | Change |
|------|--------|
| `src/index.ts` | `name: "gpt5-server"` → `name: "gpt5mcp"` |
| `.mcp.json` | `"gpt5": {` → `"gpt5mcp": {` |
| `README.md` | Update all `gpt5` references to `gpt5mcp` |
| `CLAUDE.md` | Update server name |
| `release/README.md` | Update binary names (optional) |
| `release/mcp-config-*.json` | Update server ID |

### After Change

```bash
# Install
npm install -g gpt5mcp

# Add to Claude Code
claude mcp add gpt5mcp -e OPENAI_API_KEY=sk-... -- gpt5mcp

# Tools appear as
mcp__gpt5mcp__gpt5_agent
mcp__gpt5mcp__gpt5_codex
```

---

## Binary Names (release/)

Current:
- `gpt5-server-macos-arm64`
- `gpt5-server-windows-x64.exe`

Options:
1. **Keep as-is** - binaries are separate from npm
2. **Rename to match** - `gpt5mcp-macos-arm64`, `gpt5mcp-windows-x64.exe`

Recommendation: Rename for consistency.

---

## Action Items

1. [ ] Change `name` in `src/index.ts` from `gpt5-server` to `gpt5mcp`
2. [ ] Update `.mcp.json` server ID from `gpt5` to `gpt5mcp`
3. [ ] Update all documentation
4. [ ] Add `bin` field to `package.json` for npm global install
5. [ ] Optionally rename release binaries
6. [ ] Optionally delete `/release` if going npm-only

---

## package.json for npm publish

```json
{
  "name": "gpt5mcp",
  "version": "1.0.0",
  "bin": {
    "gpt5mcp": "./build/index.js"
  },
  "files": [
    "build/**/*"
  ],
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

This allows:
```bash
npm install -g gpt5mcp
gpt5mcp  # runs the server
```
