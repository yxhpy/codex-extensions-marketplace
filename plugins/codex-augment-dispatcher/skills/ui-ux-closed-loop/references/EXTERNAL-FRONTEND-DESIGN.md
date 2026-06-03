# EXTERNAL: frontend-design (anthropics/skills)

**Purpose (引用):** Provides intentional, non-generic aesthetic direction and implementation constraints for distinctive production-grade UIs. Avoids "AI slop" defaults.

**Install (one time, for Codex/Claude/Cursor etc.):**
```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
# Or via plugin marketplace if exposed by your agent
```

**Key principles to incorporate when active (summarized; see original SKILL.md for full):**
- Before any code: define Purpose (problem/users), Tone (choose extreme/bold: brutalist, editorial, organic, luxury, playful... -- be specific and true to it), Constraints, Differentiation (what makes it unforgettable).
- Typography: distinctive/characterful display + refined body; explicitly avoid overused AI defaults (Inter, Roboto, Arial, Space Grotesk, system). Pair unexpected fonts.
- Color/Theme: cohesive with dominant colors + sharp accents; CSS vars; no timid even palettes or cliched purple/white gradients.
- Motion: high-impact moments (one orchestrated load with staggers > many tiny hovers); CSS for HTML, Motion lib for React; scroll/hover surprises.
- Spatial: unexpected layouts, asymmetry, overlap, diagonal flow, grid-breakers, generous negative space or controlled density.
- Details: atmosphere via textures, noise, geometric patterns, layered transparencies, dramatic shadows, custom cursors, grain. Match complexity to the vision (maximalist needs elaborate code; minimalist needs precision).
- Never: generic AI tropes, cookie-cutter, context-less design. Vary per project.

**How this plugin coordinates (see agy-frontend and ui-ux-closed-loop SKILL.md):**
- In design direction stage: run its thinking to choose tone etc.
- Feed the resulting constraints + "use frontend-design rules" into agy prompt or impl prompt.
- Verify final output against its guidelines (plus local taste-lite).
- If not installed, fall back gracefully to local rules and note the recommendation.

**Original source:** https://github.com/anthropics/skills/tree/main/skills/frontend-design (and the claude-code plugin mirror). Read the full SKILL.md there for exact wording.

**Version note:** As of 2026, highly recommended in Snyk "Top 8 for UI/UX" and community for breaking generic output.
