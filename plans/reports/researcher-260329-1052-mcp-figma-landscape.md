# MCP-Figma Landscape Research Report

**Date:** 2026-03-29 | **Focus:** MCP servers, Figma APIs, open-source alternatives, technical challenges

---

## Executive Summary

Figma released an official **beta MCP server** (free during beta, usage-based paid later). At least **6+ community MCP implementations** exist on GitHub. Figma APIs support OAuth2 and personal tokens, with rate limits tied to plan + seat type + file location. Design token extraction requires careful API pipelining to avoid rate-limit lockouts.

---

## 1. FIGMA'S OFFICIAL MCP SERVER

### Overview
- **Status:** Beta release (2026), free during beta period → future: usage-based paid
- **Availability:** Desktop version (via Figma Desktop app) + Remote version (hosted by Figma)
- **Integrations:** VS Code with Copilot, Cursor, Windsurf, Claude Code
- **Repo:** [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide)
- **Docs:** [Figma Developer Docs - MCP Server](https://developers.figma.com/docs/figma-mcp-server/)

### Key Capabilities
- **Read:** Extract design context, variables, components, layout data, screenshots
- **Write:** Create/modify frames, components, variables, auto-layout
- **Design-to-Code:** Select Figma frame → generate code (leverages Code Connect mappings)
- **FigJam Integration:** Create diagrams in FigJam via `generate_diagram` tool
- **Design Tokens:** Access variables and theme modes (Light/Dark variants)

### Limitations
- **Rate limits** apply to read operations; write operations exempt (per docs)
- **Token limits:** Responses exceeding max tokens require pagination/filtering
- **System propagation delays:** Seat changes take time to propagate
- **File location restriction:** Rate limits tied to team/file location (see 4. Technical Challenges)

### Authentication
- Automatic via Figma account (no separate token needed in official version)
- Inherits rate limits from user's plan + seat type

---

## 2. COMMUNITY MCP IMPLEMENTATIONS (GitHub)

### Active Projects

| Project | Creator | Focus | Status |
|---------|---------|-------|--------|
| **[Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP)** | GLips | Layout info for code generation | Maintained; 429 rate-limit issues reported |
| **[figma-mcp-server](https://github.com/TimHolden/figma-mcp-server)** | TimHolden | Read-only file/project access | Maintained |
| **[mcp-figma](https://github.com/thirdstrandstudio/mcp-figma)** | thirdstrandstudio | Full API functionality | Maintained |
| **[figma-console-mcp](https://github.com/southleft/figma-console-mcp)** | southleft | Design system as API; extraction/creation/debugging | Active |
| **[TalkToFigma MCP](https://github.com/grab/cursor-talk-to-figma-mcp)** | Grab | Bi-directional: read designs + modify programmatically | Active |
| **[figma-mcp](https://github.com/paulvandermeijs/figma-mcp)** | Paul van der Meijs | File/node access, image export | Maintained |

### Common Features
- Wrap Figma REST API or Plugin API
- Support personal access token authentication
- Export node trees, component metadata, design tokens
- Some support file creation/modification

### Known Issues (Community Reports)
- 429 rate-limit errors even on paid accounts
- Token response limits cause truncation
- Confusion over rate limits (seat changes not propagating)

---

## 3. FIGMA API CAPABILITIES & TIERS

### REST API Overview
- **Authentication:** OAuth 2.0 (recommended) or personal access token
- **Base:** HTTP REST with JSON responses, standard methods (GET, POST, PUT, DELETE)
- **Scope-based:** Permissions (e.g., `file_content:read`) granted per token/app
- **Rate limits:** Based on plan + seat type + file location (see section 4)

### API Endpoints Categories
- **File Management:** Read files, get nodes, metadata
- **Image Export:** Render nodes as PNG/SVG
- **Variables/Design Tokens:** Create, modify, read design token collections
- **Team Libraries:** Publish/import variables
- **Code Connect:** Map design components to codebase (new feature)

### Free vs Paid Tiers

#### Starter Plan (Free)
- **Read File:** 6 requests per month per file
- **Seat types:** View, Collab, Dev, Full (all subject to 6/month limit)
- **Use case:** Hobbyists, small projects

#### Professional Plan
- **Dev/Full seat:** 15 calls/min per-minute rate limit
- **Tier 1 API:** ~6,000 credits/min, 1.2M daily
- **Cost:** $12/editor/month
- **Use case:** Individuals, small teams

#### Organization Plan
- **Dev/Full seat:** 20 calls/min
- **Better support:** Contact Figma for specifics

#### Enterprise
- **Highest tier:** Custom rates (contact Figma)
- **Custom contracts:** Compliance, SLA, support

### Critical Caveat: File Location Determines Limits
- Rate limit = **where the file lives**, not token's plan
- Example: Full seat in Enterprise, but file in Starter project → **6/month limit applies**
- Result: Rate limits are per-file, not per-account

---

## 4. KEY TECHNICAL CHALLENGES

### A. Rate Limiting Complexity
**Problem:**
- `/v1/files/:key` pulls entire subtree (often megabytes)
- Followed by image/asset requests → burst consumption
- Starter plan files: 6/month → lockout 4-5 days

**Proposed Solution (Token Optimization):**
1. Metadata-first: Fetch component metadata only (lightweight)
2. Prune locally: Filter hidden frames, remove unnecessary nodes
3. Fetch pruned tree: Limit depth, keep <500KB responses
4. Extract tokens offline: No additional API calls after fetch

### B. Token Response Limits
**Problem:**
- MCP tools hit max token limits mid-response
- Large files truncate incomplete node trees
- Requires pagination/limit parameters to reduce size

**Mitigation:**
- Implement `limit` and `offset` parameters in tool signatures
- Fetch by node layers incrementally
- Cache results locally

### C. Authentication & Seat Management
**Issues:**
- Personal access token → all requests count same budget (shared teams)
- Seat type changes propagate slowly (hours/days delay)
- OAuth per-app rate limits: each app gets unique budget per user

**Trade-off:** OAuth better for multi-app scenarios, but requires user approval flow

### D. Design Token Extraction
**Challenges:**
- Variables in Figma tied to nodes (no global token dump)
- Theme modes (Light/Dark) stored per collection
- Extracting all token variants = multiple API calls
- Asset references require separate image endpoint calls

**Feasible Approach:**
- Use Plugin API for local extraction (direct access, no rate limits)
- REST API for metadata + image references
- Combine layers to build complete token set

### E. Performance & Latency
**Constraints:**
- ~6,000 credits/min, ~1.2M daily (Tier 1)
- Image export is slow (CloudFront distribution)
- Large file + multiple requests = queuing

**Practical Impact:** Batch operations, async workflows

### F. Access Control Complexity
- File-level permissions (view-only, edit)
- Seat types (View-only can't call write operations)
- Team-based isolation
- Result: Custom permission model needed per MCP tool

---

## 5. COMMUNITY OPEN-SOURCE ALTERNATIVE: PENPOT

### Overview
- **Model:** Free, open-source, self-hostable
- **Format:** SVG-based (web standards), not proprietary
- **Availability:** Cloud (penpot.app) or self-hosted
- **Cost:** Free vs Figma ($12-$75/user/month)

### Strengths vs Figma
- **Developer-friendly:** Built-in Inspect tab (free; Figma Dev Mode = subscription)
- **Self-hosting:** Full control, no vendor lock-in
- **Web standards:** SVG/CSS/HTML → easier handoff to developers
- **Cost:** No per-user fees for small teams

### Weaknesses
- **Plugin ecosystem:** Not as mature as Figma
- **Prototyping:** Less flexible for complex animations
- **Maturity:** Figma is faster, more polished

### MCP Integration Status
- **No evidence** of official Penpot MCP server as of 2026
- **Opportunity:** Could build MCP wrapper around Penpot's API (if available)
- **Advantage:** Open-source MCP → community contributions possible

---

## 6. RATE LIMIT SUMMARY BY USE CASE

| Use Case | Plan Required | Limitation | Workaround |
|----------|--------------|-----------|-----------|
| **Single read/month** | Starter (Free) | 6/month per file | OK for minimal tasks |
| **Design-to-code loops** | Professional Dev | 15/min sustained | Good for typical workflows |
| **Bulk extraction** | Professional/Org | 15-20/min | Batch requests; cache locally |
| **Real-time sync** | Enterprise | Custom | Contact Figma |
| **MCP tool limits** | View/Collab | 6 tool calls/month | Upgrade to Dev seat |
| **MCP tool limits** | Dev/Full | Per-min (REST limits) | Same as REST API |

---

## 7. RESEARCH GAPS & LIMITATIONS

### Not Fully Investigated
1. **Penpot MCP availability:** No current MCP server found; opportunity unclear
2. **Figma Plugin API depth:** Design token extraction via Plugin API vs REST (comparison needed)
3. **Community server maturity:** Which have production usage? Maintenance status?
4. **Write operation rate limits:** Official MCP says writes exempt, but no community confirmation
5. **OAuth 2.0 delegation workflows:** How to safely manage user consent in MCP context
6. **Design token schema standardization:** How do existing tools export tokens (W3C design token format compliance?)

### Excluded Scope
- Deployment/hosting for MCP servers (desktop vs cloud)
- Client library implementations (Python, Node, Go SDKs)
- Figma Plugin ecosystem (not MCP-specific)

---

## Unresolved Questions

1. **Which community MCP server has highest adoption?** (GLips, TimHolden, Grab?)
2. **Is Penpot building an MCP server?** (Check Penpot roadmap/GitHub issues)
3. **What's the rate limit for write operations** in community MCP servers?
4. **How do community servers handle OAuth consent flows** in CLI/agent context?
5. **Are there standardized design token export formats** (W3C, Figma Tokens Studio) used by MCP tools?

---

## Sources

### Official Figma
- [Figma MCP Server Guide - Help Center](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Figma MCP Server Blog Announcement](https://www.figma.com/blog/introducing-figma-mcp-server/)
- [Figma MCP Developer Docs](https://developers.figma.com/docs/figma-mcp-server/)
- [Figma REST API Authentication](https://developers.figma.com/docs/rest-api/authentication/)
- [Figma REST API Rate Limits](https://developers.figma.com/docs/rest-api/rate-limits/)
- [Figma REST API Plans/Access/Permissions](https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions/)
- [Figma What's New - Schema 2025](https://help.figma.com/hc/en-us/articles/35794667554839-What-s-new-from-Schema-2025)

### Community MCP Servers
- [MCP Registry - Figma MCP Server](https://github.com/mcp/com.figma.mcp/mcp)
- [GLips/Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP)
- [TimHolden/figma-mcp-server](https://github.com/TimHolden/figma-mcp-server)
- [thirdstrandstudio/mcp-figma](https://github.com/thirdstrandstudio/mcp-figma)
- [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp)
- [Grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp)
- [paulvandermeijs/figma-mcp](https://github.com/paulvandermeijs/figma-mcp)

### Design Tokens & Variables
- [Figma Design Tokens Plugin](https://www.figma.com/community/plugin/888356646278934516/design-tokens)
- [Tokens Studio for Figma](https://docs.tokens.studio/)
- [GitHub - lukasoppermann/design-tokens](https://github.com/lukasoppermann/design-tokens)
- [GitHub - mikaelvesavuori/figmagic](https://github.com/mikaelvesavuori/figmagic)
- [GitHub - tokens-studio/figma-plugin](https://github.com/tokens-studio/figma-plugin)

### Penpot & Alternatives
- [Penpot vs Figma Comparison](https://penpot.app/penpot-vs-figma)
- [Penpot: 7 Reasons Beyond Figma Alternative](https://penpot.app/blog/7-reasons-penpot-is-more-than-just-a-figma-alternative/)
- [Open Source Figma Alternatives 2026](https://openalternative.co/alternatives/figma)

### GitHub Integration
- [GitHub Figma MCP Integration Changelog](https://github.blog/changelog/2026-03-06-figma-mcp-server-can-now-generate-design-layers-from-vs-code/)

---

**Report Status:** DONE | **Researcher:** MCP-Figma Landscape Analyst | **Last Updated:** 2026-03-29 10:52
