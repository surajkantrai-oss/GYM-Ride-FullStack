# GYMRide Design System

## Direction

GYMRide uses one premium fitness identity across purpose-built surfaces. Customer mobile establishes the brand: immersive gym photography, deep forest green, mint highlights, warm cream surfaces, generous rounding, and direct motivational copy. Admin and Partner translate that identity into a denser desktop SaaS workspace with persistent navigation, compact controls, auditable tables, and semantic status indicators.

The systems share color meaning, spacing rhythm, typography hierarchy, control states, and accessibility behavior. No presentation component owns domain or API logic.

## Foundations

### Color

| Token | Web | Mobile | Use |
| --- | --- | --- | --- |
| Ink | `#10241a` | `#18251f` | Primary text and dark surfaces |
| Brand | `#08795a` | `#147558` | Primary action and focus |
| Brand dark | `#0c4b36` | `#0a5540` | Hover and emphasized green |
| Forest | `#071c13` | `#071c13` | Sidebar and photographic overlay |
| Mint | `#c7efe0` | `#c7efe0` | Active states and supporting emphasis |
| Lime | `#caf56b` | `#c8ef62` | Energy accent, never body text |
| Canvas | `#f7f1e8` | `#f5f5ef` | Warm application workspace |
| Surface | `#fffdf8` | `#fffdf8` | Cards and inputs |
| Muted | `#66776e` | `#607168` | Secondary copy |
| Danger | `#a33c37` | `#a83d38` | Destructive/error states |

Status colors retain their semantic meaning across Payments, Booking, Check-in, Flex, Reviews, and Settlements: green for healthy/complete, amber for attention/in progress, red for failure/blocked, and neutral gray for inactive/hidden.

### Typography

- Web display headings use Georgia as an editorial contrast; UI and data use the system sans stack.
- Mobile uses the native system font for reliability and platform consistency.
- Page titles are high contrast and tightly tracked. Section headings establish scannable groups. Supporting text never substitutes for a label.

### Spacing and shape

- Base spacing rhythm: 4, 8, 12, 16, 20, 24, 32.
- Controls have at least 42px web and 50px mobile height.
- Web controls use 12px radii, cards 20px, and large workspaces 28–30px; mobile cards use 22px.
- Shadows are quiet and supplementary to borders, not the only boundary.

The standard web card shadow is `0 10px 30px rgba(5,28,18,.09)` and floating surfaces use `0 24px 70px rgba(3,22,14,.20)`. Mobile cards use a 6–7px vertical offset with 7% forest opacity.

## Shared web components

The `@gymride/web-ui` package owns the portal shell, authentication screen, page headers, fields, status badges, loading/empty/error states, confirmation dialogs, toasts, and shared finance workflows. Its CSS defines design tokens and responsive behavior.

- `AppShell`: photographic application backdrop, frosted forest desktop rail, active-route state, contextual glass top bar, user identity, and compact responsive rail.
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

The Admin and Partner shells use `gym-strength.jpg` once at the application root with a controlled forest overlay. Cream workspace surfaces remain approximately 92–94% opaque so the setting is recognizable without reducing text or table contrast. Login uses the same asset and separates brand storytelling from the authentication card on desktop.

## Shell dimensions and density

- Desktop portal sidebar: 256px fixed/sticky rail, collapsing to an 86px icon rail at 1100px.
- Desktop context header: 72px floating glass surface.
- Main content maximum width: 1460px inside a warm 28–30px workspace surface.
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
