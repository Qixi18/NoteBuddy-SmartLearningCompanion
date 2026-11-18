---
name: 智慧学伴彩色证据工作台
description: 面向比赛演示的成熟教学证据工作台，以清晰任务结构和语义化色彩呈现真实数据。
status: active
updated: 2026-11-18
colors:
  canvas: '#F3F6FB'
  surface: '#FFFFFF'
  surface-soft: '#EEF3FA'
  sidebar: '#182B49'
  sidebar-active: '#263F67'
  primary: '#315FCE'
  primary-hover: '#244DAF'
  primary-soft: '#E9F0FF'
  teal: '#16877F'
  teal-soft: '#E5F5F1'
  amber: '#B86D18'
  amber-soft: '#FFF2DE'
  coral: '#C65358'
  coral-soft: '#FCEBED'
  violet: '#7059B8'
  violet-soft: '#F0ECFA'
  ink: '#182B49'
  muted: '#5C6E86'
  border: '#D9E2EF'
  success: '#137568'
  warning: '#9A5A12'
  error: '#B6424B'
typography:
  heading:
    fontFamily: 'system-ui, "Microsoft YaHei", sans-serif'
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.25'
  body:
    fontFamily: 'system-ui, "Microsoft YaHei", sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: 'system-ui, "Microsoft YaHei", sans-serif'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.4'
rounded:
  sm: 7px
  md: 12px
  lg: 16px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  section-gap: 28px
  card-padding: 22px
  sidebar-width: 232px
  header-height: 68px
components:
  primary-button:
    background: '{colors.primary}'
    foreground: '#FFFFFF'
    radius: '{rounded.sm}'
  selected-nav:
    background: '{colors.sidebar-active}'
    foreground: '#FFFFFF'
    radius: '{rounded.sm}'
  panel:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.md}'
---

## Visual Direction

Operate-mode product UI for a desktop teaching evidence workbench. The interface should feel prepared for a live demonstration: confident, legible from a normal viewing distance, and organized around the educator's next decision. Use a cool paper-like canvas, a deep ink-blue navigation rail, white work surfaces, and a broader but restrained semantic palette. Color distinguishes the kind of information and its state; it never substitutes for a label, count, denominator, or explanation.

The visual signature is a dark blue navigation spine against a bright, lightly tinted workspace. Cobalt marks primary actions and current selection; teal marks verified or usable evidence; amber marks pending review; coral marks an actual conflict or invalid record; violet identifies teaching proposals. Keep supporting areas pale and quiet. Use color in selected KPI surfaces, status markers, compact section headers, and charts where it improves scanning. Do not turn every panel into a colorful card.

## Palette

- `canvas` is a cool light blue-gray; `surface` stays white for reading and editing.
- `sidebar` and `ink` establish a steady dark-blue frame and high text contrast.
- `primary` is reserved for primary actions, links, and selected controls.
- `teal`, `amber`, `coral`, and `violet` have stable meanings described in Visual Direction. Pair each semantic color with Chinese text and never use it as the only state cue.
- KPI fills may use distinct pale tints when they aid comparison; keep the foreground deep and readable.
- Avoid rainbow palettes, full-saturation panels, purple-blue AI gradients, glass, decorative grain, and unrelated accent colors.

## Typography

Use the platform system sans stack for dependable Chinese rendering. Main page titles are 28–32px, section headings 17–20px, body copy 14–16px, and supporting labels at least 12px. Keep paragraph measure around 65–75ch; dense evidence rows may be wider. Numeric summaries use tabular figures. Labels should use ordinary teaching language; technical identifiers and raw enum values remain available in detail views.

## Layout

- Desktop-only, with 1024–1920px as the supported range. At 1024px, preserve usable controls and allow dense two-column workspaces to stack. Do not add mobile or tablet navigation work without a product change.
- Fixed left navigation around 232px; sticky top bar around 68px; content width capped near 1480px with 24–40px side padding.
- Global overview leads with the current run's truthful scale, data quality, scope limitations, and the next useful action.
- Learning evidence uses clear master-detail layouts and compact filters. Tables or aligned rows should replace repeated long prose when the data is comparable.
- Review uses a scope bar, evidence context, a distinct editable proposal, and an always-findable save action. Never show the same diagnosis and recommendation as both read-only copy and editable fields at the same time.
- Case export keeps candidate evidence, teacher confirmation, selected students, and package contents in a clear sequence.
- Use panels only to mark meaningful work areas. Avoid nested bordered cards and large empty placeholders.

## Product Truth and Data Presentation

- Product users include developers/demo presenters; the demonstrated workflow should still be understandable from an educator's perspective.
- Keep the four primary areas: global overview, subject knowledge, learning insights, and teaching plan. TASK numbers remain internal.
- All displayed counts and claims come from current API data. Do not hardcode the screenshot fixture, invent trends, or add unsupported analysis.
- Distinguish raw response rows, selected revisions, logical events, and eligible scored records. Pending is not zero; excluded evidence never enters score denominators; an item score is not a mastery claim.
- Translate user-facing quality labels into Chinese while retaining original identifiers, enum values, record IDs, and source lines in traceable details.
- Keep source verification states explicit. A pending relationship never appears confirmed.
- Rule and model outputs are drafts. Teacher edits, review status, reason, reviewer, saved history, and structured-plan constraints remain accessible and honest.
- Import stays local; source CSVs are not moved. Export labels reflect the actual API package and do not imply a complete narrative unless the package contains one.

## Components and States

- Navigation: named Chinese destinations, clear active state, visible focus, and subroutes grouped under the four primary areas.
- Page heading: concise title, one useful task description, current-run details behind a secondary disclosure, and the import action.
- Metric: number, unit, scope, denominator where relevant, and a restrained semantic tint.
- Status: concise Chinese label, optional semantic color, and explanatory text for consequential states.
- Evidence rows: summary first; full response, source file, source line, event, revision, and disposition available on expansion.
- Loading, empty, error, disabled, saving, saved, and unsaved states use consistent patterns. Errors state what happened and what the user can do next.
- Forms and native controls keep familiar behavior, legible labels, 40px minimum control height, and visible keyboard focus.
- Motion is limited to short state feedback (150–220ms); respect reduced-motion preference. No choreographed page-load animations.

## Reference Boundaries

The screenshots and the redesign brief define experience goals, not product data. Their example IDs and counts are never production defaults. Existing API contracts, scoring rules, event selection, evidence links, review validation, and export members remain authoritative. If a desired interaction needs data the current API does not provide, label the gap or use the closest honest fallback; do not simulate success.
