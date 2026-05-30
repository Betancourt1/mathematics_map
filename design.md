---
name: Mathematical Dependency Interface
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  h1:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  h2:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  monospace-code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  caption:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
spacing:
  unit: 4px
  hud-padding: 12px
  gutter: 16px
  panel-width-sm: 240px
  panel-width-md: 320px
---

## Brand & Style

The visual identity of this design system is rooted in mathematical rigor, academic precision, and high-performance computing. It targets researchers and mathematicians who require an environment free from visual distraction. 

The aesthetic is strictly **Utilitarian Minimalism**—a "logic-first" approach that prioritizes data density and clarity over ornamentation. By eschewing modern trends like glassmorphism and soft shadows, the system evokes the feeling of a terminal-based IDE or a sophisticated LaTeX environment. The emotional goal is one of absolute focus, intellectual discipline, and systemic reliability. Every pixel must serve a functional purpose in mapping complex logical dependencies.

## Colors

The palette is anchored in a deep-space dark mode to reduce eye strain during long research sessions. The foundation uses `#0B0E14` for the primary 3D environment and `#191C22` for UI overlays and HUD panels.

Semantic coloring is used exclusively for categorization rather than decoration:
- **Primary Labels:** High-contrast slate and white for maximum legibility.
- **Functional Accents:** Five distinct, high-saturation solid colors are reserved for mathematical declaration types. These must remain consistent across the 3D graph nodes and the 2D UI lists to maintain the mental model.
- **Borders:** A mid-tone slate `#2D3139` provides sharp, 1px separation without the need for depth or shadows.

## Typography

This design system utilizes **JetBrains Mono** across all interface layers. This choice ensures that mathematical symbols, logical operators, and tabular data align perfectly on a vertical axis.

- **Scale:** The type scale is intentionally small to maximize information density.
- **Alignment:** Tabular figures must be enabled to ensure that coordinate values and numerical indices do not shift the layout during real-time updates in the HUD.
- **Visual Hierarchy:** Distinction is achieved through font weight (400 to 700) and case (uppercase for section headers) rather than significant jumps in font size.

## Layout & Spacing

The layout is designed as a **Single-View 3D Canvas** with peripheral HUD (Heads-Up Display) overlays. 

- **HUD Philosophy:** UI panels are positioned at the screen edges (top-left, top-right, bottom) to leave the central 80% of the screen unobstructed for the 3D dependency graph. 
- **Grid:** A 4px baseline grid governs all component internals.
- **Panels:** Sidebars are fixed-width (320px) but collapsible to the screen edge. 
- **Adaptation:** On smaller viewports, panels transition from side-docked to bottom-sheet drawers to preserve the horizontal width needed for inspecting complex graph branches.

## Elevation & Depth

In this design system, depth is communicated through **Tonal Layering** and **1px Solid Outlines** rather than light and shadow.

- **Base Layer:** The deepest layer is the 3D environment (#0B0E14).
- **Surface Layer:** UI components sit on #191C22.
- **Contrast Separation:** Because there are no shadows, elements are separated by a mandatory 1px border.
- **Z-Index Logic:** Higher-priority overlays (like context menus or node-detail flyouts) use the same background color as the surface layer but are demarcated by a brighter border (#475569) to indicate focus.

## Shapes

The shape language is **Strictly Geometric**. 
- All primary containers, buttons, and input fields utilize 0px (sharp) corners to reinforce the architectural and technical nature of the software.
- In instances where visual comfort is required for icon containers or small tags, a maximum rounding of 2px may be applied, though sharp corners are always the preferred default.

## Components

### Buttons
Buttons are solid-filled blocks with no gradients. The "Primary" state uses the declaration-type colors (e.g., a blue button for "Add Theorem"). "Secondary" buttons are ghost-style with a 1px border and no fill.

### HUD Panels
Floating containers with a #191C22 background and a #2D3139 border. They should have a "Label-Caps" header bar to identify the panel's function (e.g., "NODE INSPECTOR" or "GLOBAL SEARCH").

### Type Tags (Chips)
Solid color rectangles containing black text. These are used to categorize nodes in lists and detail views. The background color of the tag must match the specific declaration type (Theorem, Lemma, etc.).

### Input Fields
Strictly rectangular. Use a 1px border. The focus state is indicated by changing the border color to the primary blue (#3B82F6) and nothing else—no outer glow or shadow.

### Graph Nodes (3D)
Represented as simple geometric primitives (Cubes for Theorems, Tetrahedrons for Lemmas, Spheres for Definitions). Node colors must be solid and match the UI's semantic color system.

### Data Tables
No vertical grid lines. Horizontal lines should be 1px and faint (#1F2937). Rows use JetBrains Mono in "Monospace-Code" size for absolute alignment of mathematical values.
