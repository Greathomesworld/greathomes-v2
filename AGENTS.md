# Great Homes V2 — System Guidelines & Typography Lock

## Canonical Typography System (LOCKED)

The typography system is official, locked, and canonical across all Great Homes V2 components and phases. DO NOT replace, rename, or introduce competing fonts.

1. **Fjalla One (`font-editorial` / `font-serif`)**
   - **Purpose**: Editorial / luxury / distinctive project titles & select major headlines.
   - **Allowed**: Project Hero title, major editorial headlines, high-impact storytelling moments, "Know Before You Buy", featured project spotlight.
   - **Forbidden**: Body text, navigation, buttons, badges, metadata, forms, dense information.

2. **Plus Jakarta Sans (`font-display`)**
   - **Purpose**: Primary Great Homes interface and display font.
   - **Allowed**: Section headings, UI headings, navigation, buttons, CTA labels, badges, filters, tabs, project status, pricing labels & numbers, card headings, form/interface controls.

3. **Inter (`font-body` / `font-sans`)**
   - **Purpose**: Primary reading and supporting information font.
   - **Allowed**: Body copy, project descriptions, supporting text, metadata, location information, explanatory text, FAQ content, small utility text, form inputs.

### Canonical Tailwind Tokens
- `font-display` → `var(--font-plus-jakarta), "Plus Jakarta Sans", sans-serif`
- `font-editorial` → `var(--font-fjalla), "Fjalla One", sans-serif`
- `font-body` → `var(--font-inter), "Inter", sans-serif`
- `font-sans` → `var(--font-inter), "Inter", sans-serif`
- `font-serif` → `var(--font-fjalla), "Fjalla One", sans-serif`
