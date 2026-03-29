# Phase 6: Security & Polish

## Overview
- **Priority:** P1
- **Status:** completed
- **Effort:** Medium
- **Description:** Harden security, improve DX, add convenience features for v1.0 release.

## Implementation Steps

### 6.1 Security Hardening

**Input sanitization:**
- Sanitize all string params from Figma (node names, text content) before returning to AI
- Strip control characters, limit string length (prevent context overflow)
- Validate nodeId format before passing to Figma API

**WebSocket hardening:**
- Token file permissions: 0600 (owner read/write only)
- Delete token file on server shutdown (cleanup handler)
- Reject connections from non-127.0.0.1 origins
- Max connections per server: 5 (prevent resource exhaustion)

**Command safety:**
- Never pass design data to `child_process.exec()` (prevent CVE-2025-53967 pattern)
- Use `execFile()` if any system calls needed
- Whitelist allowed commands in plugin (reject unknown)

### 6.2 DX Improvements

**Auto-start script:**
- Single `npm run dev` that starts both WS server + MCP server
- Display token prominently in console with copy instructions

**Plugin UX:**
- Auto-copy token to clipboard when generated
- Show last 5 operations in plugin UI for debugging
- Connection retry indicator with countdown

**MCP config generation:**
- `npm run config` outputs ready-to-paste JSON for Claude Code / Cursor settings
- Include absolute paths for current OS

### 6.3 Robustness

**Graceful shutdown:**
- WS server: close all connections, notify clients, cleanup token file
- MCP server: close WS connection, flush pending responses
- Plugin: detect disconnect, show clear status

**Error messages:**
- Human-readable errors (not raw stack traces) returned to AI
- Include suggestion for common issues (e.g., "Font not found → try 'Inter'")

**Depth/size guards:**
- `get_node_info` default depth: 3, max: 10
- `get_page_nodes` max children: 500 per level
- `export_node` max dimension: 4096px
- Response size warning if > 100KB

## Todo List
- [x] Input sanitization layer for all string returns
- [x] Token file permission + cleanup
- [x] Connection limit enforcement
- [x] Command whitelist in plugin
- [x] Auto-start dev script
- [x] MCP config generator script
- [x] Graceful shutdown handlers
- [x] Human-readable error messages
- [x] Depth/size guards on all read operations
- [x] Final security review pass

## Success Criteria
- No unauthenticated access possible
- No command injection vectors
- Single command starts full dev environment
- All errors return actionable messages to AI
- Large documents don't crash or hang
