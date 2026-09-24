# GYMRide Design System

## Direction

GYMRide uses two related visual expressions. Customer mobile surfaces use a warm, active-lifestyle language (Concept 05): natural off-white canvas, deep gym green, energetic lime accents, generous rounded cards, and direct motivational copy. Admin and Partner portals use a contemporary operational SaaS language (Concept 04): restrained density, clear hierarchy, persistent navigation, compact controls, auditable tables, and semantic status indicators.

The systems share color meaning, spacing rhythm, typography hierarchy, control states, and accessibility behavior. No presentation component owns domain or API logic.

## Foundations

### Color

| Token | Web | Mobile | Use |
| --- | --- | --- | --- |
| Ink | `#17211c` | `#18251f` | Primary text and dark surfaces |
| Brand | `#0f7554` | `#147558` | Primary action and focus |
| Brand dark | `#07543b` | `#0a5540` | Hover and emphasized green |
| Lime | `#c9f25d` | `#c8ef62` | Energy accent, never body text |
| Canvas | `#f6f7f4` | `#f5f5ef` | Application background |
| Surface | `#ffffff` | `#fffdf8` | Cards and inputs |
| Muted | `#68776f` | `#607168` | Secondary copy |
| Danger | `#b23b3b` | `#a83d38` | Destructive/error states |

Status colors retain their semantic meaning across Payments, Booking, Check-in, Flex, Reviews, and Settlements: green for healthy/complete, amber for attention/in progress, red for failure/blocked, and neutral gray for inactive/hidden.

### Typography

- Web display headings use Georgia as an editorial contrast; UI and data use the system sans stack.
- Mobile uses the native system font for reliability and platform consistency.
- Page titles are high contrast and tightly tracked. Section headings establish scannable groups. Supporting text never substitutes for a label.

### Spacing and shape

- Base spacing rhythm: 4, 8, 12, 16, 20, 24, 32.
- Controls have at least 42px web and 50px mobile height.
- Web surfaces use 10–24px radii; mobile cards use 22px.
- Shadows are quiet and supplementary to borders, not the only boundary.

Implemented radii are 10px for web controls, 16px for web cards, 24–28px for premium/hero surfaces, 14px for mobile controls, 22px for mobile cards, and fully rounded filter chips. The standard web shadow is `0 12px 32px rgba(18,37,30,.07)`; mobile cards use a 6–7px vertical offset with 7% forest opacity.

## Shared web components

The `@gymride/web-ui` package owns the portal shell, authentication screen, page headers, fields, status badges, loading/empty/error states, confirmation dialogs, toasts, and shared finance workflows. Its CSS defines design tokens and responsive behavior.

- `AppShell`: dark persistent desktop rail, active-route state, contextual top bar, mobile bottom rail.
- `PageHeader`: eyebrow, display title, description, and page action.
- `StatusBadge`: server status text with semantic, non-color-only dot indicator.
- `PageState` / `ErrorState`: consistent loading, permission, empty, and retry treatments.
- `ConfirmDialog`: focused and accessible destructive confirmation.

## Shared mobile components

`mobile-app/src/components/ui.tsx` provides `Screen`, `Title`, `SectionTitle`, `Copy`, `Card`, `Badge`, `Button`, `Input`, and `State`.

It also provides `Chip` for compact friendly filters and `GymCard` for the approved 132px-thumbnail discovery pattern. Mobile hero imagery uses a 330px-high rounded composition. Gym details use a 270px-high hero, and web portfolio imagery uses a 148px landscape crop.

- Buttons support primary, secondary, ghost, and danger variants.
- Cards support default, highlight, and dark presentation without changing data behavior.
- Badges expose neutral, success, warning, and danger semantics.
- State components provide calm loading, actionable error, and descriptive empty states.

## Image system

Three local GYMRide-owned generic gym interiors are stored in each client asset surface as `gym-warm.jpg`, `gym-strength.jpg`, and `gym-airy.jpg`. A deterministic presentation helper selects a fallback from the entity ID. These files never alter gym records and are not represented as customer-uploaded media. Images use `cover` cropping and retain warm architectural light, forest/charcoal equipment, and natural materials consistent with Concept 05.

## Shell dimensions and density

- Desktop portal sidebar: 252px fixed/sticky rail.
- Desktop context header: 70px.
- Main content maximum width: 1440px with fluid 1.35–3rem padding.
- Compact KPI minimum width: 160px; cards pair the metric with a 34px icon tile.
- Data tables retain a 680px safe minimum width and scroll horizontally below it.
- At 800px the web rail becomes a bottom navigation and multi-column grids collapse.

## Accessibility

- Visible focus treatment on web controls and links.
- Semantic headings and `aria-current` navigation state.
- Status is always represented by text, not color alone.
- Mobile controls expose accessibility roles, labels, and disabled state.
- Minimum touch targets are maintained.
- Reduced-motion preferences disable decorative transitions.
- High text/background contrast is used throughout.

## Usage rules

1. Use server-provided statuses and data; never invent visual-only records.
2. Use a single primary action per decision group where practical.
3. Use secondary actions for viewing, refreshing, changing, or navigating back.
4. Preserve existing API, auth, state, and validation paths when applying presentation.
5. Extend shared primitives before adding one-off visual rules.
