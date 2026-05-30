import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const categoryPalette = [
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
  "#a7f3d0",
  "#fed7aa",
  "#bae6fd",
];
let categoryColorByName = new Map();

const kindColors = {
  theorem: "#ffb86b",
  def: "#67e8f9",
  structure: "#c084fc",
  class: "#f472b6",
  inductive: "#a3e635",
  module: "#94a3b8",
};

const importantNames = new Set([
  "ContinuousMap",
  "TensorProduct",
  "Real",
  "Filter",
  "Matrix",
  "Module",
  "TopologicalSpace",
  "Category",
]);

const modeNames = new Map([
  ["overview", "Overview"],
  ["selected", "Selected"],
  ["path", "Path"],
  ["neighborhood", "Local"],
]);

const state = {
  mode: "overview",
  depth: 2,
  selectedId: "",
  hoveredId: "",
  cameraMode: "rotate",
  inspectorOpen: false,
  neighborDrawerOpen: false,
  neighborDrawerHeight: 220,
  neighborLimit: 10,
  isResizingNeighbors: false,
  activeKinds: new Set(),
  activeCategories: new Set(),
  studyPath: [],
};

const neighborMinHeight = 132;
const neighborHeightStep = 24;
const initialNeighborLimit = 10;
const neighborLimitStep = 10;

const canvas = document.querySelector("#graph-canvas");
const labelsLayer = document.querySelector("#labels-layer");
const tooltip = document.querySelector("#tooltip");
const searchInput = document.querySelector("#search-input");
const declarationOptions = document.querySelector("#declaration-options");
const kindFilters = document.querySelector("#kind-filters");
const categoryFilters = document.querySelector("#category-filters");
const metricVisible = document.querySelector("#metric-visible");
const metricEdges = document.querySelector("#metric-edges");
const metricDepth = document.querySelector("#metric-depth");
const metricMode = document.querySelector("#metric-mode");
const cameraButtons = document.querySelectorAll(".camera-button");
const selectedKind = document.querySelector("#selected-kind");
const selectedLabel = document.querySelector("#selected-label");
const selectedName = document.querySelector("#selected-name");
const selectedModule = document.querySelector("#selected-module");
const selectedCategory = document.querySelector("#selected-category");
const selectedOutLabel = document.querySelector("#selected-out-label");
const selectedInLabel = document.querySelector("#selected-in-label");
const selectedOut = document.querySelector("#selected-out");
const selectedIn = document.querySelector("#selected-in");
const leanPreview = document.querySelector("#lean-preview");
const openDocs = document.querySelector("#open-docs");
const neighborTitle = document.querySelector("#neighbor-title");
const neighborsBody = document.querySelector("#neighbors-body");
const neighborCount = document.querySelector("#neighbor-count");
const showMoreNeighborsButton = document.querySelector("#show-more-neighbors");
const pathSummary = document.querySelector("#path-summary");
const depthSlider = document.querySelector("#depth-slider");
const depthValue = document.querySelector("#depth-value");
const centerNodeButton = document.querySelector("#center-node");
const isolateNodeButton = document.querySelector("#isolate-node");
const expandNodeButton = document.querySelector("#expand-node");
const nodeInspector = document.querySelector("#node-inspector");
const inspectorContent = document.querySelector(".inspector-content");
const neighborDrawer = document.querySelector("#neighbor-drawer");
const neighborResizeHandle = document.querySelector("#neighbor-resize-handle");
const toggleNeighborsButton = document.querySelector("#toggle-neighbors");
const restoreNeighborsButton = document.querySelector("#restore-neighbors");
const toggleInspectorButton = document.querySelector("#toggle-inspector");
const statusLive = document.querySelector("#status-live");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0e15");
scene.fog = new THREE.Fog("#0b0e15", 1800, 5600);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 8200);
camera.position.set(1300, 880, 2800);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 140;
controls.maxDistance = 5600;
controls.target.set(0, 0, 0);

const graphGroup = new THREE.Group();
const arrowGroup = new THREE.Group();
const markerGroup = new THREE.Group();
scene.add(graphGroup, arrowGroup, markerGroup);

let graph = null;
let nodes = [];
let edges = [];
let nodeById = new Map();
let outgoing = new Map();
let incoming = new Map();
let edgeKindByPair = new Map();
let densityPoints = null;
let nodePoints = null;
let renderedNodeIds = [];
let labelById = new Map();
let clusterLabelByCategory = new Map();
let baseLines = null;
let highlightLines = null;
let clusterLines = null;
let selectedMarker = null;
let hoverMarker = null;
let visibleNodeIds = new Set();
let visibleEdges = [];
let labelCandidateIds = [];
let overviewAnchorIds = new Set();
let clusterStats = new Map();
let visibleClusterEdges = [];
let displayPositionById = new Map();

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 7;
const pointer = new THREE.Vector2();
const tempColor = new THREE.Color();

function formatKind(kind) {
  return kind.toUpperCase();
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function resetNeighborLimit() {
  state.neighborLimit = initialNeighborLimit;
}

function announceStatus(message) {
  statusLive.textContent = message;
}

function maxNeighborDrawerHeight() {
  return Math.max(neighborMinHeight, Math.floor(window.innerHeight * 0.72));
}

function setNeighborDrawerHeight(height) {
  const maxHeight = maxNeighborDrawerHeight();
  state.neighborDrawerHeight = clampNumber(Math.round(height), neighborMinHeight, maxHeight);
  document.documentElement.style.setProperty("--neighbor-drawer-height", `${state.neighborDrawerHeight}px`);
  neighborResizeHandle.setAttribute("aria-valuemin", String(neighborMinHeight));
  neighborResizeHandle.setAttribute("aria-valuemax", String(maxHeight));
  neighborResizeHandle.setAttribute("aria-valuenow", String(state.neighborDrawerHeight));
}

function setCameraMode(mode) {
  if (mode !== "rotate" && mode !== "move") {
    return;
  }

  state.cameraMode = mode;
  controls.mouseButtons = {
    LEFT: mode === "move" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: mode === "move" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
  };

  if (THREE.TOUCH) {
    controls.touches = {
      ONE: mode === "move" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  canvas.dataset.cameraMode = mode;

  cameraButtons.forEach((button) => {
    const isActive = button.dataset.cameraMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']");
}

function panCamera(deltaX, deltaY) {
  camera.updateMatrixWorld();

  const distance = camera.position.distanceTo(controls.target);
  const step = clampNumber(distance * 0.055, 18, 260);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const offset = right.multiplyScalar(deltaX * step).add(up.multiplyScalar(deltaY * step));

  camera.position.add(offset);
  controls.target.add(offset);
  controls.update();
  updateLabels();
}

function handleCameraKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
    return;
  }

  const speed = event.shiftKey ? 2.5 : 1;
  const key = event.key.toLowerCase();
  let deltaX = 0;
  let deltaY = 0;

  if (key === "arrowleft" || key === "a") {
    deltaX = -speed;
  } else if (key === "arrowright" || key === "d") {
    deltaX = speed;
  } else if (key === "arrowup" || key === "w") {
    deltaY = speed;
  } else if (key === "arrowdown" || key === "s") {
    deltaY = -speed;
  } else {
    return;
  }

  panCamera(deltaX, deltaY);
  event.preventDefault();
}

function shortModule(moduleName) {
  return moduleName.replace(/^Mathlib\./, "").toLowerCase();
}

function colorForKind(kind) {
  return kindColors[kind] ?? kindColors.def;
}

function colorForCategory(category) {
  return categoryColorByName.get(category) ?? categoryPalette[hashNumber(category) % categoryPalette.length];
}

function assignCategoryColors(categories) {
  categoryColorByName = new Map(
    categories.map((category, index) => [category, categoryPalette[index % categoryPalette.length]]),
  );
}

function hashNumber(value) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function edgeKey(edge) {
  return `${edge.source}->${edge.target}`;
}

function getHashState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    node: params.get("node") ?? "",
    mode: params.get("mode") ?? "",
    depth: Number(params.get("depth") ?? ""),
  };
}

function updateHash() {
  const selected = nodeById.get(state.selectedId);
  const params = new URLSearchParams();

  if (selected) {
    params.set("node", selected.name);
  }

  params.set("mode", state.mode);
  params.set("depth", String(state.depth));
  history.replaceState(null, "", `#${params.toString()}`);
}

function buildMaps() {
  nodeById = new Map(nodes.map((node) => [node.id, node]));
  outgoing = new Map(nodes.map((node) => [node.id, []]));
  incoming = new Map(nodes.map((node) => [node.id, []]));
  edgeKindByPair = new Map();

  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    edgeKindByPair.set(edgeKey(edge), edge.kind);
  }

  const exactImportant = nodes.filter((node) => importantNames.has(node.name)).map((node) => node.id);
  const topDegree = [...nodes]
    .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
    .slice(0, 18)
    .map((node) => node.id);
  labelCandidateIds = Array.from(new Set([...exactImportant, ...topDegree]));

  const topModules = nodes
    .filter((node) => node.kind === "module")
    .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
    .slice(0, 180)
    .map((node) => node.id);
  const topDeclarations = nodes
    .filter((node) => node.kind !== "module")
    .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
    .slice(0, 90)
    .map((node) => node.id);
  const categoryAnchors = graph.categories.flatMap((category) =>
    nodes
      .filter((node) => node.kind === "module" && node.category === category)
      .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
      .slice(0, 3)
      .map((node) => node.id),
  );
  overviewAnchorIds = new Set([...topModules, ...topDeclarations, ...categoryAnchors, ...exactImportant]);
  clusterStats = buildClusterStats();
}

function buildClusterStats() {
  const stats = new Map(
    graph.categories.map((category) => [
      category,
      {
        category,
        declarations: 0,
        modules: 0,
        x: 0,
        y: 0,
        z: 0,
      },
    ]),
  );

  for (const node of nodes) {
    const entry = stats.get(node.category);

    if (!entry) {
      continue;
    }

    if (node.kind === "module") {
      entry.modules += 1;
      entry.x += node.position.x;
      entry.y += node.position.y;
      entry.z += node.position.z;
    } else {
      entry.declarations += 1;
    }
  }

  for (const entry of stats.values()) {
    if (entry.modules === 0) {
      continue;
    }

    entry.x /= entry.modules;
    entry.y /= entry.modules;
    entry.z /= entry.modules;
  }

  return stats;
}

function outgoingByKind(id, kind) {
  return (outgoing.get(id) ?? []).filter((target) => edgeKindByPair.get(`${id}->${target}`) === kind);
}

function incomingByKind(id, kind) {
  return (incoming.get(id) ?? []).filter((source) => edgeKindByPair.get(`${source}->${id}`) === kind);
}

function relationCounts(node) {
  if (node.kind === "module") {
    return {
      out: outgoingByKind(node.id, "imports").length,
      in: incomingByKind(node.id, "imports").length,
      outLabel: "imports",
      inLabel: "imported by",
    };
  }

  return {
    out: outgoingByKind(node.id, "depends_on").length,
    in: incomingByKind(node.id, "depends_on").length,
    outLabel: "depends on",
    inLabel: "used by",
  };
}

function displayPosition(node) {
  return displayPositionById.get(node.id) ?? new THREE.Vector3(node.position.x, node.position.y, node.position.z);
}

function createMarkers() {
  const selectedGeometry = new THREE.BoxGeometry(18, 18, 18);
  const hoverGeometry = new THREE.BoxGeometry(14, 14, 14);
  selectedMarker = new THREE.Mesh(
    selectedGeometry,
    new THREE.MeshBasicMaterial({ color: "#adc6ff", wireframe: true }),
  );
  hoverMarker = new THREE.Mesh(
    hoverGeometry,
    new THREE.MeshBasicMaterial({ color: "#e1e2ec", wireframe: true }),
  );
  selectedMarker.visible = false;
  hoverMarker.visible = false;
  markerGroup.add(selectedMarker, hoverMarker);
}

function disposePointCloud(points) {
  if (!points) {
    return;
  }

  graphGroup.remove(points);
  points.geometry.dispose();
  points.material.dispose();
}

function rebuildPointCloud() {
  disposePointCloud(densityPoints);
  disposePointCloud(nodePoints);
  densityPoints = null;
  nodePoints = null;
  renderedNodeIds = [];

  if (state.mode === "overview") {
    densityPoints = createPointCloud(
      nodes.filter((node) => node.kind !== "module" && passesFilters(node)),
      {
        colorBy: "category",
        opacity: 0.22,
        size: 1.15,
      },
    );
    graphGroup.add(densityPoints);
  }

  const foregroundNodes = [...visibleNodeIds]
    .map((id) => nodeById.get(id))
    .filter(Boolean);
  nodePoints = createPointCloud(foregroundNodes, {
    colorBy: "kind",
    opacity: state.mode === "overview" ? 0.95 : 0.88,
    size: state.mode === "overview" ? 7.2 : 5.2,
    pickable: true,
  });
  graphGroup.add(nodePoints);
}

function createPointCloud(pointNodes, options) {
  const positions = [];
  const colors = [];

  for (const node of pointNodes) {
    const position = displayPosition(node);
    positions.push(position.x, position.y, position.z);
    tempColor.set(options.colorBy === "category" ? colorForCategory(node.category) : colorForKind(node.kind));
    colors.push(tempColor.r, tempColor.g, tempColor.b);

    if (options.pickable) {
      renderedNodeIds.push(node.id);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: options.size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: options.opacity,
      depthWrite: false,
    }),
  );
}

function createFilterChips() {
  state.activeKinds = new Set(graph.kinds);
  state.activeCategories = new Set(graph.categories);

  kindFilters.innerHTML = "";
  categoryFilters.innerHTML = "";

  for (const kind of graph.kinds) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip is-active";
    chip.textContent = formatKind(kind);
    chip.dataset.kind = kind;
    chip.style.borderColor = colorForKind(kind);
    chip.addEventListener("click", () => {
      toggleSetValue(state.activeKinds, kind);
      chip.classList.toggle("is-active", state.activeKinds.has(kind));
      resetNeighborLimit();
      updateVisibility();
    });
    kindFilters.append(chip);
  }

  for (const category of graph.categories) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip is-active";
    chip.textContent = category;
    chip.dataset.category = category;
    chip.style.borderColor = colorForCategory(category);
    chip.addEventListener("click", () => {
      toggleSetValue(state.activeCategories, category);
      chip.classList.toggle("is-active", state.activeCategories.has(category));
      resetNeighborLimit();
      updateVisibility();
    });
    categoryFilters.append(chip);
  }
}

function toggleSetValue(set, value) {
  if (set.has(value)) {
    set.delete(value);
    return;
  }

  set.add(value);
}

function createSearchOptions() {
  const topNodes = [...nodes]
    .filter((node) => node.kind !== "theorem" || node.degree > 0)
    .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
    .slice(0, 700);
  declarationOptions.innerHTML = "";

  for (const node of topNodes) {
    const option = document.createElement("option");
    option.value = node.name;
    declarationOptions.append(option);
  }
}

function createClusterLabels() {
  for (const [category, entry] of clusterStats) {
    const label = document.createElement("div");
    label.className = "cluster-label";
    label.style.borderColor = colorForCategory(category);
    label.textContent = `${category} / ${entry.declarations.toLocaleString()}`;
    labelsLayer.append(label);
    clusterLabelByCategory.set(category, label);
  }
}

function passesFilters(node) {
  return state.activeKinds.has(node.kind) && state.activeCategories.has(node.category);
}

function sortByDegree(left, right) {
  return (nodeById.get(right)?.degree ?? 0) - (nodeById.get(left)?.degree ?? 0) || left.localeCompare(right);
}

function collectNeighborhood(rootId, depth, maxNodes = 2400) {
  if (!rootId || !nodeById.has(rootId)) {
    return new Set();
  }

  const seen = new Set();
  const queue = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || seen.has(current.id)) {
      continue;
    }

    seen.add(current.id);

    if (current.depth >= depth) {
      continue;
    }

    const neighbors = [
      ...(outgoing.get(current.id) ?? []),
      ...(incoming.get(current.id) ?? []),
    ].sort(sortByDegree);

    for (const id of neighbors) {
      if (seen.size + queue.length >= maxNodes) {
        break;
      }

      if (!seen.has(id)) {
        queue.push({ id, depth: current.depth + 1 });
      }
    }
  }

  return seen;
}

function collectDirectNeighborhood(rootId, perSide = 24) {
  const ids = new Set();

  if (!rootId || !nodeById.has(rootId)) {
    return ids;
  }

  ids.add(rootId);

  for (const id of (outgoing.get(rootId) ?? []).slice().sort(sortByDegree).slice(0, perSide)) {
    ids.add(id);
  }

  for (const id of (incoming.get(rootId) ?? []).slice().sort(sortByDegree).slice(0, perSide)) {
    ids.add(id);
  }

  return ids;
}

function buildStudyPath(rootId) {
  const path = [];
  let currentId = rootId;

  for (let step = 0; step <= state.depth; step += 1) {
    if (!currentId || path.includes(currentId)) {
      break;
    }

    path.push(currentId);

    const nextId = outgoingByKind(currentId, "depends_on")
      .filter((id) => nodeById.has(id))
      .sort((left, right) => (nodeById.get(right)?.degree ?? 0) - (nodeById.get(left)?.degree ?? 0))[0];

    currentId = nextId;
  }

  return path;
}

function activeNodeIds() {
  const ids = new Set();

  if (state.mode === "overview" || !state.selectedId) {
    for (const id of overviewAnchorIds) {
      const node = nodeById.get(id);

      if (node && passesFilters(node)) {
        ids.add(id);
      }
    }

    return ids;
  }

  const selectedNeighborhood =
    state.mode === "selected"
      ? collectDirectNeighborhood(state.selectedId)
      : state.mode === "path"
        ? new Set([state.selectedId, ...state.studyPath])
        : collectNeighborhood(state.selectedId, state.depth);

  for (const id of selectedNeighborhood) {
    const node = nodeById.get(id);

    if (node && (passesFilters(node) || id === state.selectedId)) {
      ids.add(id);
    }
  }

  if (state.selectedId) {
    ids.add(state.selectedId);
  }

  return ids;
}

function updateVisibility() {
  state.studyPath = state.mode === "path" ? buildStudyPath(state.selectedId) : [];
  visibleNodeIds = activeNodeIds();
  visibleEdges = activeEdges();
  visibleClusterEdges = activeClusterEdges();
  updateDisplayLayout();
  const highlightKeys = highlightedEdgeKeys();

  rebuildPointCloud();
  rebuildLines(highlightKeys);
  updateArrowMarkers(highlightKeys);
  updateMarkers();
  updatePanels();
  updateLabels();
  updateHash();
}

function activeEdges() {
  if (!state.selectedId || state.mode === "overview") {
    return [];
  }

  if (state.mode === "path") {
    const pathPairs = new Set();

    for (let index = 0; index < state.studyPath.length - 1; index += 1) {
      pathPairs.add(`${state.studyPath[index]}->${state.studyPath[index + 1]}`);
    }

    return edges.filter((edge) => pathPairs.has(edgeKey(edge)));
  }

  const localEdges = edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      return false;
    }

    if (state.mode === "selected") {
      return edge.source === state.selectedId || edge.target === state.selectedId;
    }

    return true;
  });

  if (state.mode !== "neighborhood" || localEdges.length <= 2600) {
    return localEdges;
  }

  return localEdges
    .sort((left, right) => {
      const leftLocal = left.source === state.selectedId || left.target === state.selectedId ? 1 : 0;
      const rightLocal = right.source === state.selectedId || right.target === state.selectedId ? 1 : 0;
      return rightLocal - leftLocal;
    })
    .slice(0, 2600);
}

function activeClusterEdges() {
  if (state.mode !== "overview") {
    return [];
  }

  return (graph.clusterEdges ?? [])
    .filter((edge) => state.activeCategories.has(edge.source) && state.activeCategories.has(edge.target))
    .slice(0, 140);
}

function updateDisplayLayout() {
  displayPositionById = new Map();

  if (state.mode === "overview" || !state.selectedId) {
    return;
  }

  const selected = nodeById.get(state.selectedId);

  if (!selected) {
    return;
  }

  const root = new THREE.Vector3(selected.position.x, selected.position.y, selected.position.z);
  displayPositionById.set(selected.id, root);

  if (state.mode === "path") {
    state.studyPath.forEach((id, index) => {
      const node = nodeById.get(id);

      if (!node) {
        return;
      }

      displayPositionById.set(id, new THREE.Vector3(root.x - index * 180, root.y, root.z + (index % 2) * 42));
    });

    return;
  }

  const dependencies = (outgoing.get(selected.id) ?? [])
    .filter((id) => visibleNodeIds.has(id) && edgeKindByPair.get(`${selected.id}->${id}`) !== "in_module")
    .sort(sortByDegree);
  const uses = (incoming.get(selected.id) ?? [])
    .filter((id) => visibleNodeIds.has(id) && edgeKindByPair.get(`${id}->${selected.id}`) !== "in_module")
    .sort(sortByDegree);
  const containers = [
    ...(outgoing.get(selected.id) ?? []).filter((id) => visibleNodeIds.has(id) && edgeKindByPair.get(`${selected.id}->${id}`) === "in_module"),
    ...(incoming.get(selected.id) ?? []).filter((id) => visibleNodeIds.has(id) && edgeKindByPair.get(`${id}->${selected.id}`) === "in_module"),
  ].sort(sortByDegree);

  placeLocalColumn(dependencies, root, -300, -28);
  placeLocalColumn(uses, root, 300, 28);
  placeLocalColumn(containers, root, 0, -188);

  const remaining = [...visibleNodeIds]
    .filter((id) => !displayPositionById.has(id))
    .sort(sortByDegree);

  remaining.forEach((id, index) => {
    const angle = index * 2.399963;
    const radius = 210 + Math.floor(index / 28) * 76;
    displayPositionById.set(
      id,
      new THREE.Vector3(
        root.x + Math.cos(angle) * radius,
        root.y + Math.sin(angle) * radius * 0.74,
        root.z + ((index % 7) - 3) * 30,
      ),
    );
  });
}

function placeLocalColumn(ids, root, xOffset, yBias) {
  const gap = ids.length > 18 ? 30 : 38;

  ids.forEach((id, index) => {
    const centered = index - (ids.length - 1) / 2;
    displayPositionById.set(
      id,
      new THREE.Vector3(root.x + xOffset, root.y + yBias + centered * gap, root.z + ((index % 5) - 2) * 26),
    );
  });
}

function highlightedEdgeKeys() {
  const keys = new Set();

  for (const edge of visibleEdges) {
    if (edge.source === state.selectedId || edge.target === state.selectedId) {
      keys.add(edgeKey(edge));
    }
  }

  for (let index = 0; index < state.studyPath.length - 1; index += 1) {
    keys.add(`${state.studyPath[index]}->${state.studyPath[index + 1]}`);
  }

  return keys;
}

function rebuildLines(highlightKeys) {
  if (baseLines) {
    graphGroup.remove(baseLines);
    baseLines.geometry.dispose();
  }

  if (highlightLines) {
    graphGroup.remove(highlightLines);
    highlightLines.geometry.dispose();
  }

  if (clusterLines) {
    graphGroup.remove(clusterLines);
    clusterLines.geometry.dispose();
  }

  clusterLines = null;
  const basePoints = [];
  const highlightPoints = [];

  if (state.mode === "overview") {
    const clusterPoints = [];

    for (const edge of visibleClusterEdges) {
      const source = clusterStats.get(edge.source);
      const target = clusterStats.get(edge.target);

      if (!source || !target) {
        continue;
      }

      clusterPoints.push(source.x, source.y, source.z);
      clusterPoints.push(target.x, target.y, target.z);
    }

    clusterLines = makeLineSegments(clusterPoints, "#8796ad", 0.24);
    graphGroup.add(clusterLines);
  }

  for (const edge of visibleEdges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source || !target) {
      continue;
    }

    const sourcePosition = displayPosition(source);
    const targetPosition = displayPosition(target);
    const bucket = highlightKeys.has(edgeKey(edge)) ? highlightPoints : basePoints;
    bucket.push(sourcePosition.x, sourcePosition.y, sourcePosition.z);
    bucket.push(targetPosition.x, targetPosition.y, targetPosition.z);
  }

  baseLines = makeLineSegments(basePoints, "#424754", state.mode === "overview" ? 0.08 : 0.28);
  highlightLines = makeLineSegments(highlightPoints, "#adc6ff", 0.9);
  graphGroup.add(baseLines, highlightLines);
}

function makeLineSegments(points, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
}

function updateArrowMarkers(highlightKeys) {
  arrowGroup.clear();

  const coneGeometry = new THREE.ConeGeometry(4, 10, 6);
  const coneMaterial = new THREE.MeshBasicMaterial({ color: "#adc6ff" });
  const yAxis = new THREE.Vector3(0, 1, 0);
  let count = 0;

  for (const edge of visibleEdges) {
    if (!highlightKeys.has(edgeKey(edge)) || count > 160) {
      continue;
    }

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source || !target) {
      continue;
    }

    const start = displayPosition(source).clone();
    const end = displayPosition(target).clone();
    const direction = end.clone().sub(start).normalize();
    const marker = new THREE.Mesh(coneGeometry, coneMaterial);
    marker.position.copy(start.lerp(end, 0.72));
    marker.quaternion.setFromUnitVectors(yAxis, direction);
    arrowGroup.add(marker);
    count += 1;
  }
}

function updateMarkers() {
  updateMarker(selectedMarker, state.selectedId, 1);
  updateMarker(hoverMarker, state.hoveredId, 0.78);
}

function updateMarker(marker, id, scale) {
  const node = nodeById.get(id);

  if (!marker || !node || !visibleNodeIds.has(id)) {
    marker.visible = false;
    return;
  }

  marker.position.copy(displayPosition(node));
  marker.scale.setScalar(scale + Math.min(1.4, Math.sqrt(node.degree + 1) / 18));
  marker.visible = true;
}

function updateNeighborDrawer(selected) {
  const hasRows = visibleNodeIds.size > 0;
  const isOpen = hasRows && state.neighborDrawerOpen;
  const label = selected ? "local neighbors" : "visible nodes";

  neighborDrawer.classList.toggle("is-open", isOpen);
  neighborDrawer.inert = !isOpen;
  neighborDrawer.setAttribute("aria-label", selected ? "Local neighbors" : "Visible nodes");
  neighborDrawer.setAttribute("aria-hidden", String(!isOpen));
  toggleNeighborsButton.disabled = !isOpen;
  toggleNeighborsButton.setAttribute("aria-label", `Hide ${label}`);
  toggleNeighborsButton.setAttribute("aria-expanded", String(isOpen));
  restoreNeighborsButton.disabled = !hasRows || isOpen;
  restoreNeighborsButton.classList.toggle("is-visible", hasRows && !isOpen);
  restoreNeighborsButton.textContent = selected ? "Local neighbors" : "Visible nodes";
  restoreNeighborsButton.setAttribute("aria-label", `Show ${label}`);
  depthSlider.disabled = !isOpen || !selected;
  neighborResizeHandle.tabIndex = isOpen ? 0 : -1;
}

function startNeighborResize(event) {
  if (!nodeById.has(state.selectedId)) {
    return;
  }

  state.neighborDrawerOpen = true;
  state.isResizingNeighbors = true;
  controls.enabled = false;
  neighborDrawer.classList.add("is-resizing");
  neighborResizeHandle.setPointerCapture(event.pointerId);
  updateNeighborDrawer(nodeById.get(state.selectedId));
  event.preventDefault();
}

function resizeNeighborDrawer(event) {
  if (!state.isResizingNeighbors) {
    return;
  }

  const drawerBottom = window.innerHeight - neighborDrawer.getBoundingClientRect().bottom;
  setNeighborDrawerHeight(window.innerHeight - event.clientY - drawerBottom);
  event.preventDefault();
}

function stopNeighborResize(event) {
  if (!state.isResizingNeighbors) {
    return;
  }

  state.isResizingNeighbors = false;
  controls.enabled = true;
  neighborDrawer.classList.remove("is-resizing");

  if (neighborResizeHandle.hasPointerCapture(event.pointerId)) {
    neighborResizeHandle.releasePointerCapture(event.pointerId);
  }
}

function adjustNeighborDrawerHeight(delta) {
  setNeighborDrawerHeight(state.neighborDrawerHeight + delta);
}

function visibleNodeRows() {
  return [...visibleNodeIds]
    .map((id) => nodeById.get(id))
    .filter(Boolean)
    .sort((left, right) => right.degree - left.degree || left.name.localeCompare(right.name))
    .map((node) => ({
      id: node.id,
      rel: state.mode === "overview" ? "visible" : "shown",
    }));
}

function appendTextCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  cell.title = text;
  row.append(cell);
  return cell;
}

function appendNodeCell(row, node) {
  const cell = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node-row-button";
  button.textContent = node.name;
  button.title = node.name;
  button.setAttribute("aria-label", `Select ${node.name}`);
  button.addEventListener("click", () => selectNode(node.id, true));
  cell.append(button);
  row.append(cell);
}

function renderNodeRows(rows) {
  neighborsBody.innerHTML = "";

  for (const row of rows.slice(0, state.neighborLimit)) {
    const node = nodeById.get(row.id);

    if (!node) {
      continue;
    }

    const tr = document.createElement("tr");
    tr.className = row.id === state.selectedId ? "is-selected" : "";
    tr.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, a")) {
        return;
      }

      selectNode(row.id, true);
    });
    appendTextCell(tr, row.rel);
    appendTextCell(tr, formatKind(node.kind));
    appendNodeCell(tr, node);
    appendTextCell(tr, shortModule(node.module));
    neighborsBody.append(tr);
  }
}

function updateNeighborFooter(total, label) {
  const shown = Math.min(state.neighborLimit, total);
  neighborCount.textContent = total === 0 ? `No ${label}` : `Showing ${shown} of ${total} ${label}`;
  showMoreNeighborsButton.hidden = shown >= total;
}

function updatePanels() {
  const selected = nodeById.get(state.selectedId);
  const localEdges = selected ? localNeighborRows(selected.id) : [];

  metricVisible.textContent = String(visibleNodeIds.size);
  metricEdges.textContent = String(state.mode === "overview" ? visibleClusterEdges.length : visibleEdges.length);
  metricDepth.textContent = String(state.depth);
  metricMode.textContent = modeNames.get(state.mode) ?? state.mode;
  depthValue.textContent = String(state.depth);
  depthSlider.value = String(state.depth);
  nodeInspector.classList.toggle("is-open", Boolean(selected && state.inspectorOpen));
  nodeInspector.classList.toggle("has-selection", Boolean(selected));
  updateNeighborDrawer(selected);
  const inspectorVisible = Boolean(selected && state.inspectorOpen);
  inspectorContent.inert = !inspectorVisible;
  inspectorContent.setAttribute("aria-hidden", String(!inspectorVisible));
  toggleInspectorButton.disabled = !selected;
  toggleInspectorButton.setAttribute("aria-expanded", String(inspectorVisible));

  if (!selected) {
    const rows = visibleNodeRows();
    selectedKind.textContent = "NODE";
    selectedLabel.textContent = "No selection";
    selectedName.textContent = "Search or select an anchor node.";
    selectedModule.textContent = "-";
    selectedCategory.textContent = "-";
    selectedOut.textContent = "0";
    selectedIn.textContent = "0";
    neighborTitle.textContent = "Visible nodes";
    pathSummary.textContent =
      rows.length > 0
        ? "Current graph nodes. Use the declaration column to select one without the 3D canvas."
        : "Search a declaration or adjust filters to show nodes.";
    renderNodeRows(rows);
    updateNeighborFooter(rows.length, "visible nodes");
    return;
  }

  const counts = relationCounts(selected);
  selectedKind.textContent = formatKind(selected.kind);
  selectedKind.style.background = colorForKind(selected.kind);
  selectedLabel.textContent = selected.label;
  selectedName.textContent = selected.name;
  selectedModule.textContent = shortModule(selected.module);
  selectedCategory.textContent = selected.category;
  selectedOutLabel.textContent = counts.outLabel;
  selectedInLabel.textContent = counts.inLabel;
  selectedOut.textContent = String(counts.out);
  selectedIn.textContent = String(counts.in);
  leanPreview.textContent =
    selected.kind === "module"
      ? `import ${selected.name}`
      : `${selected.kind} ${selected.name} ... :=`;
  openDocs.href = selected.docLink;
  isolateNodeButton.textContent = "OVERVIEW";
  neighborTitle.textContent = "Local neighbors";
  pathSummary.textContent = summaryText(selected, counts);
  renderNodeRows(localEdges);
  updateNeighborFooter(localEdges.length, "local neighbors");
}

function summaryText(selected, counts) {
  if (state.mode === "path") {
    const pathNames = state.studyPath.map((id) => nodeById.get(id)?.label).filter(Boolean).reverse();
    return pathNames.length > 1
      ? `Path: ${pathNames.join(" -> ")}`
      : `No dependency path found from ${selected.label} at this depth.`;
  }

  if (state.mode === "neighborhood") {
    return `${selected.label}: local neighborhood at depth ${state.depth}.`;
  }

  return `${selected.label}: ${counts.out} ${counts.outLabel}, ${counts.in} ${counts.inLabel}.`;
}

function localNeighborRows(id) {
  const outgoingRows = (outgoing.get(id) ?? []).map((target) => ({
    id: target,
    rel: outgoingRelationLabel(edgeKindByPair.get(`${id}->${target}`)),
  }));
  const incomingRows = (incoming.get(id) ?? []).map((source) => ({
    id: source,
    rel: incomingRelationLabel(edgeKindByPair.get(`${source}->${id}`)),
  }));

  return [...outgoingRows, ...incomingRows].sort(
    (left, right) => (nodeById.get(right.id)?.degree ?? 0) - (nodeById.get(left.id)?.degree ?? 0),
  );
}

function outgoingRelationLabel(kind) {
  if (kind === "depends_on") {
    return "depends on";
  }

  if (kind === "in_module") {
    return "module";
  }

  if (kind === "imports") {
    return "imports";
  }

  return "rel";
}

function incomingRelationLabel(kind) {
  if (kind === "depends_on") {
    return "used by";
  }

  if (kind === "in_module") {
    return "contains";
  }

  if (kind === "imports") {
    return "imported by";
  }

  return "rel";
}

function updateLabels() {
  updateClusterLabels();
  const wanted = new Set([state.selectedId, state.hoveredId]);

  if (state.mode === "overview") {
    for (const id of labelCandidateIds.slice(0, 10)) {
      wanted.add(id);
    }
  } else {
    for (const id of state.studyPath) {
      wanted.add(id);
    }

    for (const row of localNeighborRows(state.selectedId).slice(0, 6)) {
      wanted.add(row.id);
    }
  }

  for (const id of wanted) {
    const node = nodeById.get(id);

    if (!node || !visibleNodeIds.has(id)) {
      continue;
    }

    let label = labelById.get(id);

    if (!label) {
      label = document.createElement("div");
      label.className = "graph-label";
      labelsLayer.append(label);
      labelById.set(id, label);
    }

    label.textContent = node.label;
    positionLabel(label, node);
  }

  for (const [id, label] of labelById) {
    if (!wanted.has(id) || !visibleNodeIds.has(id)) {
      label.remove();
      labelById.delete(id);
    }
  }
}

function updateClusterLabels() {
  for (const [category, label] of clusterLabelByCategory) {
    const entry = clusterStats.get(category);

    if (!entry || state.mode !== "overview" || !state.activeCategories.has(category)) {
      label.style.display = "none";
      continue;
    }

    positionLabel(label, entry);
  }
}

function positionLabel(label, node) {
  const mapped = node.id ? displayPositionById.get(node.id) : null;
  const position = mapped
    ? mapped.clone()
    : new THREE.Vector3(node.position?.x ?? node.x, node.position?.y ?? node.y, node.position?.z ?? node.z);
  position.project(camera);
  const x = (position.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-position.y * 0.5 + 0.5) * window.innerHeight;
  const margin = label.classList.contains("cluster-label") ? 92 : 72;
  const visible =
    position.z > -1 &&
    position.z < 1 &&
    x > margin &&
    x < window.innerWidth - margin &&
    y > 84 &&
    y < window.innerHeight - 24;

  label.style.display = visible ? "block" : "none";
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
}

function selectNode(id, focus = false) {
  if (!nodeById.has(id)) {
    return;
  }

  const isNewSelection = state.selectedId !== id;
  state.selectedId = id;
  state.inspectorOpen = true;
  state.neighborDrawerOpen = !isCompactViewport();
  searchInput.value = nodeById.get(id).name;

  if (isNewSelection) {
    resetNeighborLimit();
  }

  updateVisibility();

  if (focus) {
    centerOnNode(id);
  }

  const selected = nodeById.get(id);
  announceStatus(`${selected.name} selected. Node details are open.`);
}

function centerOnNode(id) {
  const node = nodeById.get(id);

  if (!node) {
    return;
  }

  const position = displayPosition(node).clone();
  controls.target.copy(position);
  camera.position.set(position.x + 320, position.y + 210, position.z + 480);
  controls.update();
}

function findSearchMatch(value) {
  const query = value.trim().toLowerCase();

  if (!query) {
    return null;
  }

  return (
    nodes.find((node) => node.name.toLowerCase() === query) ??
    nodes.find((node) => node.label.toLowerCase() === query) ??
    nodes.find((node) => node.name.toLowerCase().includes(query))
  );
}

function setMode(mode) {
  const normalizedMode = mode === "study" ? "path" : mode === "detail" ? "selected" : mode;

  if (!modeNames.has(normalizedMode)) {
    return;
  }

  state.mode = normalizedMode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    const isActive = button.dataset.mode === normalizedMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  resetNeighborLimit();
  updateVisibility();

  if (state.selectedId && normalizedMode !== "overview") {
    centerOnNode(state.selectedId);
  }
}

function handlePointerMove(event) {
  if (state.isResizingNeighbors) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = nodePoints ? raycaster.intersectObject(nodePoints, false) : [];
  const nodeId = hits[0] ? renderedNodeIds[hits[0].index] : "";
  state.hoveredId = nodeId ?? "";

  if (state.hoveredId) {
    const node = nodeById.get(state.hoveredId);
    tooltip.style.display = "block";
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    const name = document.createElement("strong");
    name.textContent = node.label;
    tooltip.replaceChildren(name, document.createElement("br"), `${formatKind(node.kind)} | ${shortModule(node.module)}`);
  } else {
    tooltip.style.display = "none";
  }

  updateMarkers();
  updateLabels();
}

function handlePointerDown(event) {
  if (event.button !== 0 || state.cameraMode === "move") {
    return;
  }

  if (state.hoveredId) {
    selectNode(state.hoveredId, state.mode === "overview");

    if (state.mode === "overview") {
      setMode("selected");
    }
  }
}

function bindEvents() {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    setNeighborDrawerHeight(state.neighborDrawerHeight);
    updateLabels();
  });

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", handleCameraKeyDown);

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const match = findSearchMatch(searchInput.value);

    if (match) {
      selectNode(match.id, true);
      setMode("selected");
    }
  });

  searchInput.addEventListener("change", () => {
    const match = findSearchMatch(searchInput.value);

    if (match) {
      selectNode(match.id, true);
      setMode("selected");
    }
  });

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  cameraButtons.forEach((button) => {
    button.addEventListener("click", () => setCameraMode(button.dataset.cameraMode));
  });

  depthSlider.addEventListener("input", () => {
    state.depth = Number(depthSlider.value);
    resetNeighborLimit();
    updateVisibility();
  });

  centerNodeButton.addEventListener("click", () => centerOnNode(state.selectedId));
  isolateNodeButton.addEventListener("click", () => {
    setMode("overview");
  });
  expandNodeButton.addEventListener("click", () => {
    state.depth = Math.min(4, state.depth + 1);
    state.neighborDrawerOpen = true;
    setMode("neighborhood");
  });
  toggleInspectorButton.addEventListener("click", () => {
    state.inspectorOpen = !state.inspectorOpen;
    if (state.inspectorOpen && isCompactViewport()) {
      state.neighborDrawerOpen = false;
    }
    updatePanels();
  });

  toggleNeighborsButton.addEventListener("click", () => {
    state.neighborDrawerOpen = false;
    updatePanels();
    restoreNeighborsButton.focus({ preventScroll: true });
  });

  restoreNeighborsButton.addEventListener("click", () => {
    state.neighborDrawerOpen = true;
    if (isCompactViewport()) {
      state.inspectorOpen = false;
    }
    updatePanels();
    toggleNeighborsButton.focus({ preventScroll: true });
  });

  showMoreNeighborsButton.addEventListener("click", () => {
    state.neighborLimit += neighborLimitStep;
    updatePanels();
  });

  neighborResizeHandle.addEventListener("pointerdown", startNeighborResize);
  window.addEventListener("pointermove", resizeNeighborDrawer);
  window.addEventListener("pointerup", stopNeighborResize);
  window.addEventListener("pointercancel", stopNeighborResize);
  neighborResizeHandle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      adjustNeighborDrawerHeight(neighborHeightStep);
    } else if (event.key === "ArrowDown") {
      adjustNeighborDrawerHeight(-neighborHeightStep);
    } else if (event.key === "Home") {
      setNeighborDrawerHeight(neighborMinHeight);
    } else if (event.key === "End") {
      setNeighborDrawerHeight(maxNeighborDrawerHeight());
    } else {
      return;
    }

    event.preventDefault();
  });
}

function animate() {
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function init() {
  graph = await fetch("./data/mathlib-map.json").then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load graph data (${response.status})`);
    }

    return response.json();
  });
  nodes = graph.nodes;
  edges = graph.edges;
  assignCategoryColors(graph.categories);
  buildMaps();
  createClusterLabels();
  createMarkers();
  createFilterChips();
  createSearchOptions();
  setNeighborDrawerHeight(state.neighborDrawerHeight);
  setCameraMode(state.cameraMode);
  bindEvents();

  const hashState = getHashState();
  state.depth = Number.isFinite(hashState.depth) && hashState.depth > 0 ? hashState.depth : 2;
  const hashMode = hashState.mode === "study" ? "path" : hashState.mode === "detail" ? "selected" : hashState.mode;
  state.mode = modeNames.has(hashMode) ? hashMode : "overview";

  const initial = nodes.find((node) => node.name === hashState.node);

  setMode(state.mode);

  if (initial) {
    selectNode(initial.id, true);
  }

  animate();
}

init().catch((error) => {
  selectedLabel.textContent = "Load error";
  selectedName.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
});
