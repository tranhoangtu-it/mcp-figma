# Figma Plugin & MCP Security Analysis

**Date:** 2026-03-29
**Scope:** API limitations, Grab's TalkToFigma architecture, distribution constraints, security risks, free tier restrictions, desktop vs web differences

---

## 1. Figma Plugin API Limitations

### Sandbox & Execution Restrictions
- **Sandbox Model:** Custom JavaScript VM compiled to WASM; browser APIs (XMLHttpRequest, DOM, localStorage, IndexedDB, History) **not available**
- **Window Context:** No `window.opener` after `window.open()` — security isolation prevents reverse access
- **File System Access:** Full isolation; plugins cannot access native file system directly
- **Auth Limitation:** Cannot send access tokens with redirects locally (like native apps); OAuth redirect workaround needed

### API Capability Gaps
- **Library Assets:** Only access styles/components currently in file or explicitly imported; no direct library browsing
- **External Fonts:** Web fonts require `loadFontAsync()` call; only editor-accessible fonts work
- **File Metadata:** Team info, permissions, comments, version history **require REST API**, not Plugin API
- **Dev Mode:** Some operations unavailable in Dev Mode; Plugin API cannot provide variables or full Dev Mode features

### Automation & Detection
- **No Detection Blocking:** Figma Plugin API **does not actively detect/block automated plugin usage**
- **Rate Limits Apply to REST API Only:** Plugin API has **no documented rate limits** (Plugin API runs in-process in Figma app)
- **REST API Rate Limits:** Leaky bucket algorithm; limits vary by plan/seat; no per-app automation detection mechanism documented
- **One Plugin Per Action:** Plugins execute on user action only; no background processes or scheduled automation

### Critical Constraint
- **Code Inspection:** All plugin code is publicly readable (one JS + one HTML file, no minification/obfuscation possible); **cannot safely store secrets**

**Sources:**
- [How Plugins Run - Figma Developer Docs](https://developers.figma.com/docs/plugins/how-plugins-run/)
- [API Reference - Figma Developer Docs](https://developers.figma.com/docs/plugins/api/api-reference/)
- [Rate Limits - Figma Developer Docs](https://developers.figma.com/docs/rest-api/rate-limits/)

---

## 2. Grab's cursor-talk-to-figma-mcp Analysis

### Architecture Overview
**Three-component system:**
1. **MCP Server** (`src/talk_to_figma_mcp/`) — TypeScript backend handling Figma API calls
2. **Figma Plugin** (`src/cursor_mcp_plugin/`) — Runs inside Figma; receives commands from WebSocket
3. **WebSocket Server** (`src/socket.ts`) — Bridges MCP ↔ Plugin communication; default port 3055

### WebSocket Design
- **Bidirectional relay:** WebSocket bridges external MCP to in-process plugin (required because Figma plugin sandbox prevents external calls)
- **Channel-based join:** Plugin uses `join_channel` to register and receive commands
- **Windows WSL support:** Hostname set to `0.0.0.0` on Windows (allows WSL connection)
- **Local-only by default:** No authentication/TLS by default

### What They Did Right
- Recognized sandbox limitation and designed workaround via WebSocket bridge
- Separated concerns: plugin logic isolated from network layer
- Supported multiple AI agents (Cursor, Claude Code, Cursor)
- Published to Figma Community; documented setup in multiple formats

### Known Limitations
- **Image Export:** "Limited support; returns base64 as text" — incomplete implementation
- **Simultaneous Servers Required:** WebSocket + MCP must run together; adds operational complexity
- **Manual Plugin Setup:** Users must manually install/link plugin or join from Community
- **No Built-in Security:** WebSocket runs unsecured by default (no auth, no TLS)

### Design Risks
- **Localhost Exposure:** WebSocket listens on 0.0.0.0 in WSL context — accessible to any local process
- **Command Injection Vulnerability:** Similar architecture led to RCE in Framelink MCP (CVE-2025-53967) — untrusted input passed to `child_process.exec()`
- **No Input Validation:** Research suggests grab's implementation may have similar risks if passing untrusted design data through system commands

**Sources:**
- [GitHub - grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Talk to Figma MCP by grab - Figma Community](https://www.figma.com/community/plugin/1485687494525374295/talk-to-figma-mcp-plugin)

---

## 3. Figma Plugin Distribution

### Public Community Publishing
- **Review Required:** Plugins submitted to Figma Community go through mandatory review
- **Review Timeline:** Goal is 5-10 business days; in-review badge shown during process
- **Contact on Decision:** Figma notifies via account email
- **Once Public:** Cannot be made private without unpublishing

### Private Organization Plugins
- **No Review Required:** Private plugins deploy **immediately without Figma review**
- **Plan Requirement:** Organization or Enterprise plan only (not available on Starter/Free)
- **Access Control:** Only members of organization can install; browsed via "All teams/workspaces" → Plugins
- **Ownership:** Only original publisher can update; transfer requires Figma Support involvement

### Local Development & Testing
- **Development Mode:** Desktop app supports "Import plugin from manifest" feature
- **manifest.json Special Fields:**
  - `devAllowedDomains` — domains allowed during dev (e.g., localhost WebSocket)
  - Build commands can run pre-load (e.g., TypeScript compilation)
  - `enableProposedApi` — dev-only; doesn't work in published plugins
- **No Web App Support:** Import from manifest only works in desktop app
- **Source Code Required:** Testers must have full plugin source files

### Distribution Without Review
- **Private Organization:** Publish to organization → no review, immediate deployment
- **Cannot Share Widely:** Private plugins limited to org members; cannot distribute to external users without publishing to Community (which triggers review)

**Sources:**
- [Publish plugins to Figma Community - Help Center](https://help.figma.com/hc/en-us/articles/360042293394-Publish-plugins-to-the-Figma-Community)
- [Create private plugins for organization - Help Center](https://help.figma.com/hc/en-us/articles/4404228629655-Create-private-plugins-for-an-organization)
- [Plugin Manifest - Developer Docs](https://developers.figma.com/docs/plugins/manifest/)

---

## 4. WebSocket Security Risks (Figma Plugin + localhost)

### Key Vulnerabilities

#### **CSWSH (Cross-Site WebSocket Hijacking)**
- WebSocket servers typically **do not check Origin header** by default
- Relies on same-origin enforcement via browser cookies
- Figma plugin (same origin as Figma app) + WebSocket bridge = potential for cookie-based hijacking if bridged to web
- Mitigation: Explicit origin validation + WebSocket origin header checks (not automatic)

#### **Command Injection (Recent CVE)**
- **CVE-2025-53967:** Framelink Figma MCP (figma-developer-mcp) had RCE via command injection
- **Root Cause:** Untrusted input passed to `child_process.exec()` with shell interpolation
- **Design Flaw:** Untrusted design data → shell command → code execution
- **Fix:** Use `child_process.execFile()` instead (no shell interpretation)
- **Risk to grab's Project:** Similar risk if image/design data → system commands without sanitization

#### **Unauthenticated WebSocket**
- grab's WebSocket server has **no authentication** by default
- Any local process can connect and issue Figma commands
- Mitigation: Token-based auth, TLS, network isolation

#### **Localhost Scope = Windows WSL Risk**
- `0.0.0.0:3055` accessible from all interfaces in WSL
- Rogue process/malware on same machine can connect
- Not truly "local" in Windows WSL context (different security boundary)

### Attack Surface
1. **Malicious Plugin:** Installed plugin + WebSocket can exfil design data
2. **Rogue MCP Client:** Any local process can connect to unauthenticated WebSocket
3. **Design-to-RCE:** Untrusted design data processed without validation → command injection
4. **Token Leakage:** Figma personal access tokens in env → accessible to local processes

### Mitigation Recommendations
- **Authentication:** Token-based auth for WebSocket join_channel
- **TLS/mTLS:** Encrypt and validate identities
- **Input Validation:** Sanitize all design data before passing to system commands
- **Rate Limiting:** Prevent command flooding attacks
- **Audit Logging:** Track all design modifications back to MCP commands
- **Localhost Binding:** Use `127.0.0.1` (not `0.0.0.0`) to prevent WSL/cross-VM access

**Sources:**
- [GitHub - mattdesl/figma-plugin-websockets](https://github.com/mattdesl/figma-plugin-websockets)
- [Figma Blog - An update on plugin security](https://www.figma.com/blog/an-update-on-plugin-security/)
- [OWASP - WebSocket Vulnerabilities](https://blog.securelayer7.net/owasp-top-10-details-websocket-vulnerabilities-mitigations/)
- [Pentest-Tools - Cross-Site WebSocket Hijacking](https://pentest-tools.com/blog/cross-site-websocket-hijacking-cswsh/)

---

## 5. Figma Free Tier (Starter Plan) Limitations

### File/Project Limits
- **Max Files:** 3 Figma design files + 3 FigJam files
- **Max Pages:** 3 pages per file
- **Version History:** Limited to 30 days (vs unlimited on paid)
- **Personal Drafts:** Unlimited (no restriction)

### Plugin Access & Restrictions
- **Plugins Available:** YES — Starter can access plugins and community files
- **API Feature Gap:** Plugin API **mirrors access restrictions** of Figma products
- **Variables/Dev Mode:** NOT available to plugins on Starter — these features blocked in Plugin API for Starter users
- **Community Plugins:** Can install; functionality depends on what's in Figma Standard feature set

### Critical Constraint
- **No Organization Plan:** Free tier = individual only; **cannot create private organization plugins** (requires Organization/Enterprise plan)
- **No Custom Plugins (Private):** Cannot deploy internal plugins; limited to Community plugins only

### Summary for Plugin Development
- **Can use plugins:** YES
- **Can create custom plugins:** YES (locally via manifest)
- **Can publish private plugins:** NO (requires paid plan)
- **Can publish to Community:** YES (same review process as paid)
- **API limitations for Starter users:** YES — restricted to Starter-tier features (no variables, no Dev Mode access)

**Sources:**
- [Figma Pricing](https://www.figma.com/pricing/)
- [Figma Plan Limits - Medium Article](https://michalmalewicz.medium.com/the-figma-free-plan-limits-39f50fb7f5eb)
- [Figma Pricing Guide - CloudEagle](https://www.cloudeagle.ai/blogs/figma-pricing-guide)

---

## 6. Figma Desktop vs Web App — Plugin Capabilities

### Plugin Support Differences

| Feature | Desktop App | Web App |
|---------|-------------|---------|
| **Plugin Execution** | Stable, OS-integrated | Browser sandbox-based, inconsistent |
| **Font Access** | Full OS system fonts | Limited to web-safe fonts |
| **File Pickers** | Native OS file picker | Browser file picker (limited) |
| **Clipboard Access** | Native clipboard API | Limited via browser clipboard API |
| **Drag-and-Drop** | Full desktop app integration (Photoshop, Slack) | Basic browser D&D only |
| **Performance** | Optimized for OS; faster | Browser-limited; slower on large files |
| **Multi-window Support** | Native multi-window | Single browser tab |

### Plugin Behavior
- **Both Support Community Plugins:** Wide plugin compatibility on both versions
- **Desktop Advantage:** Plugins relying on system-level access (fonts, custom fonts, hardware) work better/only on desktop
- **Web Limitations:** Some plugins "perform inconsistently" due to browser sandbox restrictions
- **Load Speed:** Desktop plugins load faster (no browser overhead)

### For This Project (MCP)
- **WebSocket Communication:** Both desktop/web can theoretically reach localhost WebSocket (browser allows localhost connections)
- **Design Data Access:** Both have same Plugin API access
- **Practical Reality:** Desktop app recommended for stable plugin operation (especially for production MCP usage)

**Sources:**
- [Understanding Differences Between Web App and Desktop App](https://www.nobledesktop.com/learn/figma/understanding-the-differences-between-web-app-and-desktop-app)
- [Figma MCP Collection - Figma Help Center](https://help.figma.com/hc/en-us/articles/35281385065751-Figma-MCP-collection-Compare-Figma-s-remote-and-desktop-MCP-servers)

---

## Summary of Findings

### Key Risks for mcp-figma Project
1. **WebSocket Unauthenticated:** grab's implementation has no auth by default; vulnerable to local process hijacking
2. **Command Injection Potential:** Similar architecture to CVE-2025-53967; need input sanitization for design data
3. **Localhost Not Truly Local (WSL):** `0.0.0.0:3055` accessible beyond intended scope
4. **Code Exposure:** Plugin source (JS) is publicly readable; Figma personal tokens easily leaked
5. **Sandbox Escape Unlikely But Complex:** Plugin security depends on Figma's WASM sandbox; keep dependencies minimal

### What Works Well
- **No Bot Detection:** Figma doesn't block automated Plugin API usage (only rate-limits REST API)
- **Free Distribution:** Private org plugins deploy without review (if org plan available)
- **Desktop Stability:** Desktop app offers stable plugin execution vs web app inconsistencies

### Unresolved Questions
1. **Does Figma monitor for suspicious Plugin API usage patterns?** (No public info; likely not actively blocked)
2. **Can WebSocket communication be detected by Figma?** (Unlikely; local traffic; but design modifications logged)
3. **Does grab's implementation use any input validation for design properties?** (GitHub search suggests minimal validation)
4. **What's the exploit timeline for WSL `0.0.0.0` binding vs `127.0.0.1`?** (Depends on WSL version/network config)

---

## Research Metadata

**Credibility Assessment:**
- **Official Figma Docs:** ✓ Authoritative (direct from developers.figma.com)
- **GitHub grab/cursor-talk-to-figma-mcp:** ✓ Production code; 300+ stars; maintained
- **CVE-2025-53967:** ✓ Verified security vulnerability; documented fix available
- **Forum Discussions:** △ Community reports; not guaranteed current (Figma changes frequently)

**Coverage Gaps:**
- Internal Figma security operations (bot detection, rate limit enforcement logic) — not public
- grab's specific input validation practices — requires code audit (not covered in docs)
- Long-term WebSocket stability/support from Figma — likely experimental, not guaranteed

**Recommendation:** Proceed with caution. grab's architecture is sound but needs hardening for production use:
- Add WebSocket authentication (token-based)
- Sanitize all design data inputs
- Use `execFile` not `exec` for system calls
- Bind to `127.0.0.1` only (not `0.0.0.0`)
- Implement audit logging of all design modifications
