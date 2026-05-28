# Taste Lite

Use this reference only for visual-led work: landing pages, brand pages, product pages, portfolios, editorial pages, games, and polished demos. Do not apply landing-page rules to dashboards or operational apps.

## Design Read

Before prompting `agy`, state one line:

`Reading this as: <page/app kind> for <audience>, with a <visual language>, leaning toward <implementation family>.`

Use that read to choose the task mode and visual intensity.

## Visual-Led Checks

- The first viewport must show the brand/product/place/person clearly. It cannot rely on nav text alone.
- The primary visual asset must be real media or generated raster imagery when realism, material, lifestyle, product quality, or atmosphere matters.
- CSS/SVG is fine for icons, masks, canvas effects, abstract geometry, diagrams, and decorative overlays, but not as the only hero product/scene when premium realism is expected.
- Hero content, CTAs, and the key visual must fit common viewports, including `390x844`, `877x778`, and `1440x900`.
- Text must not overlap, clip, wrap awkwardly inside buttons, or sit on low-contrast imagery.
- Navigation must stay one line on desktop; mobile must collapse intentionally.
- Buttons need readable contrast in normal, hover, focus, and active states.
- Motion must be visible in a short recording or screenshot sequence, but it must not hide the product, delay readability, or cover text.
- Prefer sections with one job and one dominant visual idea. Avoid repeating the same split layout or card grid across the page.
- Avoid generic AI tells: purple/blue gradient default, beige/brass luxury default, centered dark mesh hero, three equal feature cards, pill soup, fake dashboard screenshots, decorative status dots, and filler copy.
- If using generated images, avoid baked-in UI text unless decorative, and require alt text plus responsive crop guidance.

## App/Dashboard Counter-Rule

For dashboards, admin surfaces, SaaS tools, CRMs, and operational products, do not create a marketing hero. Start with the working surface: navigation, filters, tables, charts, status, actions, and state handling.

