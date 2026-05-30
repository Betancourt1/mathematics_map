# Mathematical Dependency Interface
> A high-performance, interactive 3D visualization platform for Lean 4 and `mathlib4` declaration dependencies.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Language: Javascript](https://img.shields.io/badge/Language-Javascript-F7DF1E.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Rendering: Three.js](https://img.shields.io/badge/3D-Three.js-black.svg)](https://threejs.org/)

---

## 🌌 Overview

The **Mathematical Dependency Interface** is a lightweight, high-performance web-based visualization tool designed to map and explore the deep mathematical dependencies inside the Lean 4 proof assistant's standard mathematical library, `mathlib4`. 

Instead of showing the entire library all at once—which is visually overwhelming and computationally prohibitive—this tool employs progressive loading, filtering, and localized subgraphs to deliver an intuitive, clean, and highly educational exploration path for researchers, mathematicians, and students.

### 🎨 Visual & Design System
Rooted in **Utilitarian Minimalism**, the visual identity prioritizes academic precision, logic-first density, and absolute focus:
- **Zero Distractions**: Sharp 0px corners, high-contrast slate outlines, and no soft shadows or gradients. It feels like a terminal-based IDE or a sophisticated LaTeX environment.
- **Deep-Space Dark Mode**: Deep `#0B0E14` environment background combined with `#191C22` floating HUD panels to minimize eye strain.
- **Strictly Geometrical Primitives**: Graph nodes are rendered as simple 3D primitives (Cubes for Theorems, Tetrahedrons for Lemmas, Spheres for Definitions) in consistent solid colors matching their corresponding 2D tags.
- **Typeface**: **JetBrains Mono** is utilized throughout the entire user interface to guarantee perfect vertical and horizontal alignment of mathematical declarations, coordinate indices, and metrics.

---

## 🚀 Key Features

- **Interactive 3D Canvas**: Seamless Orbit, Zoom, Pan, and Reset camera controls driven by Three.js.
- **Multi-Mode Navigation**:
  - `Overview`: A macro-level visualization grouping modules and declarations into 3D cosmic clusters (Algebra, Analysis, Topology, Logic, Geometry).
  - `Selected`: Focusing on a single declaration and its immediate neighbors.
  - `Path`: Highlighting a complete dependency chain from foundational rules up to the target goal.
  - `Local`: Isolating a localized neighborhood to focus on prerequisites.
- **Floating HUD (Heads-Up Display)**: Collapsible sidebar detailing declaration modules, mathematical areas, incoming (Used By) and outgoing (Depends On) degrees, and live code snippets.
- **Frictionless Search & Filter**: Real-time autocomplete search for declarations or modules, accompanied by interactive tags to toggle specific declaration types or mathematical clusters on the fly.
- **Data Table Drawer**: A resizable bottom drawer containing a dense tabular view of all visible nodes and relations, styled with monospace formatting for scientific readability.

---

## 📂 Repository Directory Structure

```text
mathematics_map/
├── .gitignore                   # Excludes massive datasets and temp files
├── GRAFO_3D_FEATURES.md         # MVP and feature definition specifications
├── design.md                    # Design system tokens and brand standards
├── output/
│   └── renders/                 # High-quality offline stills of the graph
│       └── graph/               # Beautiful pre-rendered constellation PNGs
├── public/                      # Web application root (deployable static site)
│   ├── index.html               # Main single-page HTML shell
│   ├── styles.css               # Vanilla CSS design system
│   ├── app.js                   # Interactive Three.js frontend application logic
│   └── data/
│       └── .gitkeep             # Directory placeholder (data files ignored)
└── scripts/                     # Node.js and Python data processing tools
    ├── fetch-mathlib-docgen4-map.mjs  # Fetches index from mathlib community docs
    ├── build-public-3d-map.mjs        # Places nodes in 3D using ring layouts
    ├── build-mathlib-dataset.mjs      # Parses raw Lean declarations
    ├── inspect-mathlib-graph.mjs      # Utility script to inspect local graph properties
    └── render-graph-stills.py         # Python PyGame/Pillow offline still renderer
```

---

## ⚡ Quick Start: Running the Web App

The frontend is a static web application built with vanilla HTML5, CSS, and modern modular ES6 Javascript. It consumes a static JSON dataset.

### 1. Generate the Dataset
Since the compiled datasets are large (up to 200MB+), they are ignored by Git. You must fetch and compile the dataset once before running the application:

```bash
# 1. Fetch the raw mathlib index and generate a localized map schema
node scripts/fetch-mathlib-docgen4-map.mjs

# 2. Compute 3D clusters, layout coordinates, and output to the public web assets
node scripts/build-public-3d-map.mjs
```
*(This will download the `mathlib4_docs` index and build the static `./public/data/mathlib-map.json` file).*

### 2. Launch a Local Web Server
Due to browser CORS restrictions, opening the `index.html` file directly from your disk (e.g. `file://`) will block the data loading. You must serve it using a local HTTP server:

**Using Node.js (Recommended):**
```bash
# Serve the public directory
npx serve public
```

**Using Python:**
```bash
# Serve the public directory
cd public
python -m http.server 8000
```

Once running, navigate to `http://localhost:3000` (or `http://localhost:8000`) in your browser to explore the 3D map.

---

## 🛠️ Data Pipeline & Scripts

The scripts in `scripts/` automate the ingestion of Lean declarations and their compilation into our lightweight 3D coordinate map.

### 📥 1. Ingestion: `fetch-mathlib-docgen4-map.mjs`
Fetches the public metadata index generated by `doc-gen4` for `mathlib4`. 
- **Endpoint**: `https://leanprover-community.github.io/mathlib4_docs/declarations/declaration-data.bmp`
- **Output**: `public/data/mathlib-map.json` (or a specified output path).
- **Options**:
  - `--max-per-category <num>`: Limit declarations per mathematical area (default: `14`).
  - `--max-per-module <num>`: Limit declarations per module (default: `2`).
  - `--max-edges-per-node <num>`: Max degree links per declaration node (default: `3`).

```bash
node scripts/fetch-mathlib-docgen4-map.mjs --max-per-category 20 --max-per-module 3
```

### 🧮 2. Layout & Clustering: `build-public-3d-map.mjs`
Processes the mathematical declarations to build topological categories, orders them in concentric rings in a 3D coordinate space, and compiles the list of nodes and edges into a formatted bundle.

```bash
node scripts/build-public-3d-map.mjs --input data/generated/mathlib-docgen4-graph.json --output public/data/mathlib-map.json
```

### 📸 3. Still Rendering: `render-graph-stills.py`
A custom Python script utilizing NumPy and Pillow to generate high-contrast, premium 4K stills of the graph clusters offline (examples located in `output/renders/graph/`).

**Requirements**:
```bash
pip install numpy pillow
```

**Run**:
```bash
python scripts/render-graph-stills.py
```

---

## 🛡️ License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute it for research, academic, or personal projects.
