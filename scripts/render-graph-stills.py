import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "data" / "mathlib-map.json"
OUT_DIR = ROOT / "output" / "renders" / "graph"

WIDTH = 2560
HEIGHT = 1440
BACKGROUND = (3, 6, 13)
PALETTE = [
    "#67e8f9",
    "#ffb86b",
    "#a3e635",
    "#c0c1ff",
    "#f472b6",
    "#facc15",
    "#34d399",
    "#fb7185",
    "#60a5fa",
    "#d8b4fe",
    "#2dd4bf",
    "#f97316",
    "#bef264",
    "#f9a8d4",
    "#93c5fd",
    "#c4b5fd",
    "#fde68a",
    "#86efac",
    "#fca5a5",
    "#7dd3fc",
    "#e879f9",
    "#99f6e4",
    "#fdba74",
    "#bbf7d0",
    "#c7d2fe",
    "#f0abfc",
    "#e5e7eb",
]


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def load_graph():
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        graph = json.load(handle)

    categories = graph["categories"]
    category_index = {name: index for index, name in enumerate(categories)}
    colors = {name: hex_to_rgb(PALETTE[index % len(PALETTE)]) for index, name in enumerate(categories)}
    nodes = graph["nodes"]
    positions = np.array(
        [(node["position"]["x"], node["position"]["y"], node["position"]["z"]) for node in nodes],
        dtype=np.float32,
    )
    category_ids = np.array([category_index[node["category"]] for node in nodes], dtype=np.int16)
    is_module = np.array([node["kind"] == "module" for node in nodes], dtype=bool)
    degree = np.array([node.get("degree", 0) for node in nodes], dtype=np.float32)

    return graph, categories, colors, positions, category_ids, is_module, degree


def rotation_matrix(angles):
    ax, ay, az = [math.radians(angle) for angle in angles]
    sx, cx = math.sin(ax), math.cos(ax)
    sy, cy = math.sin(ay), math.cos(ay)
    sz, cz = math.sin(az), math.cos(az)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float32)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float32)
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float32)
    return rz @ ry @ rx


def project(points, angles, zoom=1.0, shift=(0, 0)):
    rotated = points @ rotation_matrix(angles).T
    x = rotated[:, 0]
    y = rotated[:, 1]
    depth = rotated[:, 2]
    x_mid = (float(np.percentile(x, 1)) + float(np.percentile(x, 99))) / 2
    y_mid = (float(np.percentile(y, 1)) + float(np.percentile(y, 99))) / 2
    x_span = max(1, float(np.percentile(x, 99) - np.percentile(x, 1)))
    y_span = max(1, float(np.percentile(y, 99) - np.percentile(y, 1)))
    scale = min(WIDTH * 0.88 / x_span, HEIGHT * 0.80 / y_span) * zoom
    screen_x = (x - x_mid) * scale + WIDTH / 2 + shift[0]
    screen_y = HEIGHT / 2 - (y - y_mid) * scale + shift[1]
    return screen_x, screen_y, depth, rotated


def make_background():
    y, x = np.ogrid[:HEIGHT, :WIDTH]
    center_x = WIDTH * 0.54
    center_y = HEIGHT * 0.44
    radius = np.sqrt(((x - center_x) / WIDTH) ** 2 + ((y - center_y) / HEIGHT) ** 2)
    glow = np.clip(1 - radius * 2.2, 0, 1)
    image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    image[:, :, 0] = BACKGROUND[0] + (glow * 8).astype(np.uint8)
    image[:, :, 1] = BACKGROUND[1] + (glow * 13).astype(np.uint8)
    image[:, :, 2] = BACKGROUND[2] + (glow * 24).astype(np.uint8)
    return Image.fromarray(image, "RGB").convert("RGBA")


def alpha_from_depth(depth):
    low = float(np.percentile(depth, 4))
    high = float(np.percentile(depth, 96))
    return np.clip((depth - low) / max(1, high - low), 0, 1)


def draw_points(base, screen_x, screen_y, depth, category_ids, categories, colors, degree, focus_categories=None):
    rng = random.Random(42)
    depth_alpha = alpha_from_depth(depth)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    focus_set = set(focus_categories or [])
    for category_id, category in enumerate(categories):
        indices = np.flatnonzero(category_ids == category_id)
        if len(indices) == 0:
            continue

        cap = 26000 if not focus_set or category in focus_set else 8000
        if len(indices) > cap:
            weights = np.sqrt(degree[indices] + 1)
            weights = weights / weights.sum()
            indices = rng.choices(indices.tolist(), weights=weights.tolist(), k=cap)

        color = colors[category]
        for index in indices:
            px = int(screen_x[index])
            py = int(screen_y[index])
            if px < 0 or py < 0 or px >= WIDTH or py >= HEIGHT:
                continue

            base_alpha = 28 if not focus_set or category in focus_set else 12
            alpha = int(base_alpha + depth_alpha[index] * 52 + min(42, degree[index] * 1.5))
            radius = 1 if degree[index] < 18 else 2
            if radius == 1:
                draw.point((px, py), fill=(*color, alpha))
            else:
                draw.ellipse((px - 1, py - 1, px + 1, py + 1), fill=(*color, min(160, alpha + 24)))

    glow = layer.filter(ImageFilter.GaussianBlur(2.4))
    base.alpha_composite(glow)
    base.alpha_composite(layer)


def category_centers(positions, category_ids, is_module, categories):
    centers = {}
    for category_id, category in enumerate(categories):
        mask = (category_ids == category_id) & is_module
        if not np.any(mask):
            mask = category_ids == category_id
        centers[category] = positions[mask].mean(axis=0)
    return centers


def draw_cluster_edges(
    base,
    cluster_edges,
    centers,
    categories,
    colors,
    angles,
    zoom,
    shift,
    limit=120,
    alpha_scale=1.0,
    edge_color=None,
    edge_opacity=None,
):
    center_points = np.array([centers[category] for category in categories], dtype=np.float32)
    screen_x, screen_y, _, _ = project(center_points, angles, zoom=zoom, shift=shift)
    screen_by_category = {
        category: (float(screen_x[index]), float(screen_y[index])) for index, category in enumerate(categories)
    }

    top_edges = sorted(cluster_edges, key=lambda edge: edge["weight"], reverse=True)[:limit]
    edge_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(edge_layer, "RGBA")

    for edge in top_edges:
        if edge["source"] not in screen_by_category or edge["target"] not in screen_by_category:
            continue
        x1, y1 = screen_by_category[edge["source"]]
        x2, y2 = screen_by_category[edge["target"]]
        if edge_color:
            color = edge_color
        else:
            source_color = np.array(colors[edge["source"]], dtype=np.float32)
            target_color = np.array(colors[edge["target"]], dtype=np.float32)
            color = tuple(((source_color + target_color) / 2).astype(int).tolist())

        alpha = int(255 * edge_opacity) if edge_opacity is not None else int((22 + min(92, math.sqrt(edge["weight"]) * 6.5)) * alpha_scale)
        width = 1 + int(min(5, math.sqrt(edge["weight"]) / 5))
        draw.line((x1, y1, x2, y2), fill=(*color, alpha), width=width)

    glow = edge_layer.filter(ImageFilter.GaussianBlur(5))
    base.alpha_composite(glow)
    base.alpha_composite(edge_layer)
    return screen_by_category


def draw_raw_edges(
    base,
    graph,
    screen_x,
    screen_y,
    category_ids,
    categories,
    colors,
    max_edges=None,
    alpha_scale=1.0,
    edge_color=None,
    edge_opacity=None,
):
    id_to_index = {node["id"]: index for index, node in enumerate(graph["nodes"])}
    edges = graph["edges"] if max_edges is None else graph["edges"][:max_edges]
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    for edge in edges:
        source_index = id_to_index.get(edge["source"])
        target_index = id_to_index.get(edge["target"])

        if source_index is None or target_index is None:
            continue

        x1 = int(screen_x[source_index])
        y1 = int(screen_y[source_index])
        x2 = int(screen_x[target_index])
        y2 = int(screen_y[target_index])

        if (x1 < -120 and x2 < -120) or (x1 > WIDTH + 120 and x2 > WIDTH + 120):
            continue
        if (y1 < -120 and y2 < -120) or (y1 > HEIGHT + 120 and y2 > HEIGHT + 120):
            continue

        if edge_color:
            color = edge_color
        else:
            source_category = categories[int(category_ids[source_index])]
            target_category = categories[int(category_ids[target_index])]
            source_color = np.array(colors[source_category], dtype=np.float32)
            target_color = np.array(colors[target_category], dtype=np.float32)
            color = tuple(((source_color + target_color) / 2).astype(int).tolist())

        if edge["kind"] == "imports":
            alpha = int(255 * edge_opacity) if edge_opacity is not None else int(58 * alpha_scale)
            width = 2
        elif edge["kind"] == "depends_on":
            alpha = int(255 * edge_opacity) if edge_opacity is not None else int(24 * alpha_scale)
            width = 1
        else:
            alpha = int(255 * edge_opacity) if edge_opacity is not None else int(10 * alpha_scale)
            width = 1

        draw.line((x1, y1, x2, y2), fill=(*color, alpha), width=width)

    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.2)))
    base.alpha_composite(layer)


def draw_labels(base, screen_by_category, categories, colors, counts, keep=16):
    if keep <= 0:
        return

    draw = ImageDraw.Draw(base, "RGBA")
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 26)
        small = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
        small = ImageFont.load_default()

    important = sorted(categories, key=lambda category: counts[category], reverse=True)[:keep]
    for category in important:
        x, y = screen_by_category[category]
        if x < 90 or x > WIDTH - 90 or y < 90 or y > HEIGHT - 90:
            continue
        label = f"{category.upper()} / {counts[category]:,}"
        color = colors[category]
        box = draw.textbbox((0, 0), label, font=small)
        pad_x = 12
        pad_y = 7
        rect = (x - 6, y - 20, x + (box[2] - box[0]) + pad_x * 2, y + 18)
        draw.rectangle(rect, fill=(5, 8, 15, 176), outline=(*color, 210), width=2)
        draw.text((x + pad_x - 6, y - 12), label, font=small, fill=(235, 241, 255, 235))


def draw_title(base, title, subtitle):
    draw = ImageDraw.Draw(base, "RGBA")
    try:
        title_font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 36)
        sub_font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 22)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
    draw.text((46, 42), title, font=title_font, fill=(239, 245, 255, 238))
    draw.text((48, 88), subtitle, font=sub_font, fill=(157, 176, 208, 210))


def render_scene(name, graph, categories, colors, positions, category_ids, is_module, degree, view):
    base = make_background()
    centers = category_centers(positions, category_ids, is_module, categories)
    screen_x, screen_y, depth, _ = project(positions, view["angles"], view["zoom"], view.get("shift", (0, 0)))
    screen_by_category = draw_cluster_edges(
        base,
        graph["clusterEdges"],
        centers,
        categories,
        colors,
        view["angles"],
        view["zoom"],
        view.get("shift", (0, 0)),
        view.get("edge_limit", 120),
        view.get("cluster_edge_alpha", 1.0),
        view.get("edge_color"),
        view.get("cluster_edge_opacity"),
    )
    if view.get("raw_edges"):
        draw_raw_edges(
            base,
            graph,
            screen_x,
            screen_y,
            category_ids,
            categories,
            colors,
            view.get("max_raw_edges"),
            view.get("raw_edge_alpha", 1.0),
            view.get("edge_color"),
            view.get("raw_edge_opacity"),
        )

    draw_points(base, screen_x, screen_y, depth, category_ids, categories, colors, degree, view.get("focus"))

    counts = {category: int(np.sum(category_ids == index)) for index, category in enumerate(categories)}
    draw_labels(base, screen_by_category, categories, colors, counts, keep=view.get("label_count", 14))

    if view.get("title"):
        draw_title(base, view["title"], view["subtitle"])

    image = base.convert("RGB")
    image.save(OUT_DIR / f"{name}.png", optimize=True)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    graph, categories, colors, positions, category_ids, is_module, degree = load_graph()

    views = [
        (
            "01_mathlib_constellation",
            {
                "angles": (-58, 0, -24),
                "zoom": 0.82,
                "shift": (20, 25),
                "edge_limit": 140,
                "label_count": 18,
                "title": "MATHLIB DEPENDENCY CONSTELLATION",
                "subtitle": "258,274 nodes · aggregated cluster dependencies",
            },
        ),
        (
            "02_cluster_communications",
            {
                "angles": (-44, 18, 16),
                "zoom": 1.05,
                "shift": (-20, 15),
                "edge_limit": 190,
                "label_count": 16,
                "title": "CLUSTER COMMUNICATIONS",
                "subtitle": "Area-level imports and local declaration density",
            },
        ),
        (
            "03_algebra_analysis_topology",
            {
                "angles": (-52, -18, -12),
                "zoom": 1.32,
                "shift": (-120, -10),
                "edge_limit": 120,
                "focus": {"Algebra", "Analysis", "Topology", "LinearAlgebra", "RingTheory", "MeasureTheory"},
                "label_count": 12,
                "title": "ALGEBRA · ANALYSIS · TOPOLOGY",
                "subtitle": "Dense mathematical regions and their bridge structure",
            },
        ),
        (
            "04_category_theory_nebula",
            {
                "angles": (-35, 36, 34),
                "zoom": 1.45,
                "shift": (30, -40),
                "edge_limit": 150,
                "focus": {"CategoryTheory", "AlgebraicGeometry", "AlgebraicTopology", "Topology", "Algebra"},
                "label_count": 12,
                "title": "CATEGORY THEORY NEBULA",
                "subtitle": "Large categorical region connected to algebra and topology",
            },
        ),
        (
            "05_outer_fields",
            {
                "angles": (-63, 42, -38),
                "zoom": 1.16,
                "shift": (60, 40),
                "edge_limit": 110,
                "focus": {"NumberTheory", "FieldTheory", "Geometry", "Probability", "Dynamics", "InformationTheory"},
                "label_count": 14,
                "title": "OUTER SPECIALIZED FIELDS",
                "subtitle": "Peripheral domains with visible paths back to the core",
            },
        ),
        (
            "06_clean_constellation",
            {
                "angles": (-58, 0, -24),
                "zoom": 0.88,
                "shift": (0, 0),
                "edge_limit": 150,
                "label_count": 0,
            },
        ),
        (
            "07_clean_cluster_bridges",
            {
                "angles": (-44, 18, 16),
                "zoom": 1.12,
                "shift": (-20, 10),
                "edge_limit": 210,
                "label_count": 0,
            },
        ),
        (
            "08_clean_category_theory_closeup",
            {
                "angles": (-35, 36, 34),
                "zoom": 1.58,
                "shift": (30, -40),
                "edge_limit": 150,
                "focus": {"CategoryTheory", "AlgebraicGeometry", "AlgebraicTopology", "Topology", "Algebra"},
                "label_count": 0,
            },
        ),
        (
            "09_all_edges_emphasis",
            {
                "angles": (-50, 8, -18),
                "zoom": 0.96,
                "shift": (0, 10),
                "edge_limit": 270,
                "raw_edges": True,
                "edge_color": (255, 255, 255),
                "raw_edge_opacity": 0.20,
                "cluster_edge_opacity": 0.20,
                "label_count": 0,
            },
        ),
    ]

    for name, view in views:
        render_scene(name, graph, categories, colors, positions, category_ids, is_module, degree, view)
        print(OUT_DIR / f"{name}.png")


if __name__ == "__main__":
    main()
