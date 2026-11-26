# Shared workflow skills

The project's design rules and product constraints are summarized in CONTEXT.md.
The owner has also requested these public skills. Install them on a new host if
they are not present; installing on this PC alone does not install them on a Mac.
Read their actual SKILL.md instructions when applying them. Follow the user's
current direction and preserve SlipSurge's existing design system and tools.

```sh
npx skills add https://github.com/miqdadbadjuber/anti-slop --skill antislop
npx skills add https://github.com/miqdadbadjuber/anti-slop --skill antislop-layoutmobile
npx skills add https://github.com/autonnel/autonnel-skills --skill sales-funnel-blueprint
npx skills add https://github.com/dammyjay93/interface-design --skill interface-design
```

Use antislop/layoutmobile for relevant site and social navigation work,
sales-funnel-blueprint for the actual public visitor experience and
interface-design for product/admin interfaces. Do not replace sports logos,
player content, real odds or the research tools with generic marketing mockups.
Mobbin references and official Whop/Discord documentation complement these
rules; they do not authorize production operations.

## UI design and review

Install these user-wide for Codex on each workstation that needs them.

```sh
npx skills add https://uizze.com --skill ui-design -a codex -g -y
npx skills add appllama/appllama-skills -a codex -g -y
codex mcp add appllama --url https://mcp.appllama.io/mcp
```

Use UIZZE to review layout, controls and interaction states. Use AppLlama
for focused mobile references and a simulator pass through the full flow.
Apply those patterns using SlipSurge’s SwiftUI components and appearance.
Check loading, empty, error and success states, along with navigation and
motion, before handing off an interface change.

AppLlama uses a separate OAuth connection on each Codex host. Its free
`get_credits` tool reports the connected account’s balance and renewal date.
The UIZZE skill runs locally. Its reference MCP is a separate account
connection. Keep provider credentials in local agent configuration.

Connected services such as Mobbin, Supabase, Vercel and GitHub may need account
authorization on a new host or Cloud environment. Provider permissions and
secrets must be configured deliberately. Never copy an entire local Codex
credentials/session directory into GitHub to transfer tools.
