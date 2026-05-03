# StreamGuard DESIGN.md

## 1. Visual Theme & Atmosphere

StreamGuard is a live commerce compliance cockpit. The interface should feel calm, professional, trustworthy, and technically sharp. It should resemble a mature risk-control workstation: dark, focused, evidence-oriented, and data-dense without becoming noisy.

The current visual direction combines three references:

- VoltAgent-like command surfaces: near-black operational UI, terminal-native details, precise signal accents.
- ClickHouse-like voltage: high-pressure yellow for primary action, numeric emphasis, and active selection.
- Sentry-like monitoring confidence: dark developer-tool atmosphere, tactile containment, and warm warning tones.

This is not a marketing landing page. The design should avoid generic AI gradients, decorative glass cards, and soft SaaS "bubble" aesthetics. Every visual element should look like it belongs in a real monitoring product.

## 2. Color Palette & Roles

### Core Palette

- Canvas: `#050608`, `#080a0e`
- Surface base: `#101112`
- Surface raised: `#151719`
- Surface sunken: `rgba(5, 6, 8, 0.76)`
- Border base: `#30332f`
- Border muted: `#3c403b`

### Accent Roles

- Primary accent: `#f6ff5f`, used sparingly for primary actions, active focus, and key numeric emphasis.
- Signal accent: `#00d992`, used for live, connected, success, and stream-health states.
- Warning accent: `#e2a93b`, used for ambiguous risk and watch states.
- Danger accent: `#ff5c68`, used for traps, violations, destructive actions, and high-risk evidence.

### Text Roles

- Text primary: `#f4f2ec`
- Text secondary: `#c8c5bb`
- Text muted: `#8d918d`

### Color Strategy

Use a restrained product palette: dark tinted neutrals carry most of the interface, yellow appears as the high-signal accent, green communicates live/system confidence, and coral marks risk. Avoid blue or purple as the dominant product language.

## 3. Typography Rules

### Fonts

- UI: `Manrope`, with `Noto Sans SC` fallback for Chinese readability.
- Telemetry: `JetBrains Mono`, with Consolas fallback.
- Display moments: tight native sans rhythm using the same UI family, not decorative fonts.

### Type Scale

Product UI uses a stable rem scale:

- Caption: `0.6875rem`
- Small: `0.75rem`
- Body small: `0.8125rem`
- Body: `0.9375rem`
- Title: `1.125rem`
- Heading: `1.5rem`
- Display: `2rem`

### Hierarchy

- Use scale, weight, color, and space together.
- Large headings should be tight and confident, with negative letter spacing where appropriate.
- Body and helper copy should stay short. Prose should not exceed `65ch`.
- Labels, timestamps, IDs, and status chips are preferred over paragraphs.
- Numeric data should use tabular figures.
- Uppercase English is reserved for system states such as `LIVE OPS`, `SIGNAL`, `RISK`, and `SYNC`.

## 4. Component Rules

### Panels

- Panels should be flat, technical, and contained.
- Radius should usually be `6px` or `8px`.
- Use thin borders and subtle elevation.
- Avoid nested cards. Inside a panel, prefer spacing, typographic contrast, dividers, and compact rows.

### Buttons

- Primary buttons are yellow on dark.
- Success/live actions use signal green.
- Danger actions use coral.
- Secondary buttons remain dark and quiet.
- Buttons should feel precise rather than soft or oversized.

### Metrics

- Metrics are operational evidence, not decoration.
- Avoid the generic hero-metric pattern unless the number is genuinely the primary task signal.
- Use tabular numbers, compact labels, and clear semantic tone.

### Forms

- Inputs should look like command controls: dark, contained, and precise.
- Focus state uses yellow, not blue.
- Advanced settings should be progressive and compact.

### Status

- Status must be legible at a glance.
- Important states should use text plus shape or layout, not color alone when practical.
- Live and connected states use green; active selection uses yellow; high risk uses coral.

## 5. Layout Principles

### Page Structure

Build pages as command surfaces:

- Top context: product identity, live state, active module, key controls.
- Main stage: the primary operational surface.
- Side evidence: risk rail, summary, alerts, or current context.
- Bottom telemetry when useful: waves, logs, packet flow, or compact metrics.

### Spacing

Use a 4pt spacing system:

- `4, 8, 12, 16, 24, 32, 48, 64`

Group related controls tightly. Separate distinct sections generously. Avoid giving every container the same padding, because equal spacing everywhere makes the layout feel generated.

### Density

The product can be data-dense. Density is acceptable when hierarchy is clear:

- Keep control clusters compact.
- Let primary evidence panels breathe.
- Avoid unnecessary explanatory text.
- Prefer left-aligned, asymmetric layouts over centered generic blocks.

### Responsiveness

Desktop should feel cinematic and operationally wide. Mobile should collapse into a single stack that preserves the same hierarchy: status first, action second, evidence third.

## 6. Motion Rules

- Motion should communicate live signal, loading, reveal, scan, radar, or state transition.
- Avoid decorative motion that does not change user understanding.
- Do not animate layout properties.
- Prefer fast ease-out motion. Avoid bounce or elastic effects.
- Heavy ambient animations should respect reduced-motion preferences where feasible.

## 7. Do's And Don'ts

### Do

- Use black, warm charcoal, yellow, emerald, and coral consistently.
- Use real product metaphors: live room, risk lens, evidence rail, stream packet, compliance archive.
- Make important metrics visually dominant only when they drive a decision.
- Keep copy short and operational.
- Design for reviewer trust and evidence clarity.

### Don't

- Do not copy another brand's exact identity.
- Do not default to blue/purple AI-dashboard styling.
- Do not fill hero or dashboard sections with long explanatory copy.
- Do not use decorative glassmorphism as a default.
- Do not use thick side-stripe accents on cards or alerts.
- Do not create identical card grids unless comparison is the actual task.
