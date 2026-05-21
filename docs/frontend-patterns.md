# Frontend patterns

This is the operating manual for shared UI conventions in [apps/web](../apps/web) and [apps/admin](../apps/admin). It complements [CLAUDE.md](../CLAUDE.md) and the architecture guide in [AI_README_FIRST.MD](../AI_README_FIRST.MD).

## shadcn/ui

Both frontend apps build their UI from **shadcn/ui primitives**, vendored per-app. The decision was made in [#56](https://github.com/pdxgeek/ultratable/issues/56) after prototyping against [apps/admin/src/components/CatalogBrowser.tsx](../apps/admin/src/components/CatalogBrowser.tsx), [apps/admin/src/components/LeagueConfig.tsx](../apps/admin/src/components/LeagueConfig.tsx), and [apps/web/src/components/MatchPopup.tsx](../apps/web/src/components/MatchPopup.tsx). Hand-rolled popups, dropdowns, focus traps, and click-outside handlers are no longer accepted in PRs — use the vendored primitive.

### Where primitives live

| App          | Path                                | Config                                |
| ------------ | ----------------------------------- | ------------------------------------- |
| `apps/web`   | `apps/web/src/components/ui/`       | [apps/web/components.json](../apps/web/components.json)   |
| `apps/admin` | `apps/admin/src/components/ui/`     | [apps/admin/components.json](../apps/admin/components.json) |

Each app vendors its own copy. **Do not** `cp` primitives between apps — they need to stay independently installable so the apps can deploy as separate containers.

### Adding a new primitive

From the **app directory** (`cd apps/web` or `cd apps/admin`):

```bash
npx shadcn@latest add <primitive>
```

Examples: `popover`, `dropdown-menu`, `select`, `hover-card`, `tooltip`, `table`, `dialog`, `tabs`, `card`, `button`, `input`, `label`.

The CLI reads the app's `components.json` and writes to `src/components/ui/`. If you see a file land in `<app>/@/components/ui/` instead, the CLI failed to resolve the `@` alias — move the file by hand, delete the stray `@` directory, and continue. (This happens when the `paths` block lives in `tsconfig.app.json` rather than the root `tsconfig.json`.)

### Theme variable contract

Vendored shadcn primitives style themselves through CSS variables, not Tailwind colour utilities. Both apps wire those variables to the existing palette tokens in [apps/web/src/index.css](../apps/web/src/index.css) and [apps/admin/src/index.css](../apps/admin/src/index.css). The required variables are:

```
--background, --foreground
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--input, --ring, --radius
```

These point at `--color-bg-primary`, `--color-text-primary`, etc., so a `.theme-light` override on the palette tokens flows through every primitive automatically. Don't hard-code shadcn variables to literal colours — that breaks light/dark theming.

### Vendor vs. compose

- **Vendor** when you need a new primitive surface (a dialog, a date picker, a slider). Run `npx shadcn add`.
- **Compose** when you need a variant of something you already have. Wrap or restyle the existing primitive with utility classes instead of re-vendoring a near-duplicate. Two cards with different paddings should share `Card`, not become `CardCompact` and `CardWide`.
- Keep components **small and focused** (see [AI_README_FIRST.MD §6](../AI_README_FIRST.MD)). If a wrapper grows beyond a screen of code, it has stopped composing and started reimplementing.

### Animations

shadcn primitives ship with `tailwindcss-animate` / `tw-animate-css` animations (`data-open:animate-in`, `data-closed:animate-out`, etc.). **Do not** add bespoke `@keyframes` for component entry/exit transitions — use the data-state classes the primitive already exposes.

## Per-component CSS

There should be **no per-component `.css` files** under `apps/web/src/components/` or `apps/admin/src/components/`. Style with Tailwind utilities (or the shared theme variables) on the component itself. Global resets and palette tokens live in each app's `index.css`.
