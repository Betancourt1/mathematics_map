import fs from 'node:fs/promises';
import path from 'node:path';

const siteRoot = 'https://leanprover-community.github.io/mathlib4_docs/';
const ringSizes = [6, 9, 12, 16];

function parseArgs(argv) {
  const options = {
    input: 'data/generated/mathlib-docgen4-graph.json',
    output: 'public/data/mathlib-map.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--input' && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (current === '--output' && next) {
      options.output = next;
      index += 1;
    }
  }

  return options;
}

function labelFromName(name) {
  return name.split('.').at(-1) ?? name;
}

function areaFromModuleName(moduleName) {
  return moduleName.split('.')[1] ?? 'Other';
}

function buildCategories(modules) {
  const counts = new Map();

  for (const module of modules) {
    const category = areaFromModuleName(module.name);
    counts.set(category, (counts.get(category) ?? 0) + module.declarationCount);
  }

  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category]) => category);
}

function categoryCenter(index) {
  let offset = 0;

  for (let ring = 0; ring < ringSizes.length; ring += 1) {
    const size = ringSizes[ring];

    if (index < offset + size) {
      const localIndex = index - offset;
      const angle = (localIndex / size) * Math.PI * 2 + ring * 0.29;
      const radius = 900 + ring * 620;

      return [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.78,
        ((localIndex % 3) - 1) * 260 + ring * 80,
      ];
    }

    offset += size;
  }

  const fallbackIndex = index - offset;
  const angle = fallbackIndex * 2.399963;
  const radius = 900 + ringSizes.length * 620 + Math.sqrt(fallbackIndex + 1) * 210;

  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.78,
    ((fallbackIndex % 5) - 2) * 210,
  ];
}

function publicDocLink(docLink) {
  if (!docLink) {
    return siteRoot;
  }

  return new URL(docLink.replace(/^\.\//, ''), siteRoot).toString();
}

function hashNumber(value) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function modulePosition(module, index, categoryOrder, categoryCenters) {
  const center = categoryCenters.get(module.category) ?? [0, 0, 0];
  const order = categoryOrder.get(module.category) ?? 0;
  categoryOrder.set(module.category, order + 1);

  const hash = hashNumber(module.name);
  const angle = (order * 2.399963 + (hash % 628) / 100) % (Math.PI * 2);
  const radius = 70 + Math.sqrt(order + 1) * 15;
  const yWave = (((hash >>> 8) % 1000) / 1000 - 0.5) * 180;
  const zWave = ((hash % 1000) / 1000 - 0.5) * 260;

  return {
    x: Number((center[0] + Math.cos(angle) * radius).toFixed(2)),
    y: Number((center[1] + Math.sin(angle) * radius * 0.62 + yWave).toFixed(2)),
    z: Number((center[2] + zWave).toFixed(2)),
  };
}

function declarationPosition(declaration, moduleNode, orderInModule) {
  const hash = hashNumber(declaration.name);
  const angle = (orderInModule * 2.399963 + (hash % 628) / 100) % (Math.PI * 2);
  const radius = 10 + Math.sqrt(orderInModule + 1) * 3.8;
  const yWave = (((hash >>> 8) % 1000) / 1000 - 0.5) * 34;
  const zWave = (((hash >>> 16) % 1000) / 1000 - 0.5) * 42;

  return {
    x: Number((moduleNode.position.x + Math.cos(angle) * radius).toFixed(2)),
    y: Number((moduleNode.position.y + Math.sin(angle) * radius * 0.72 + yWave).toFixed(2)),
    z: Number((moduleNode.position.z + zWave).toFixed(2)),
  };
}

function buildConceptMaps(conceptDependencies) {
  const outgoing = new Map();
  const incoming = new Map();

  for (const relation of conceptDependencies) {
    outgoing.set(relation.source, relation.targets);

    for (const target of relation.targets) {
      const bucket = incoming.get(target) ?? [];
      bucket.push(relation.source);
      incoming.set(target, bucket);
    }
  }

  return { outgoing, incoming };
}

function buildClusterEdges(modules, categories) {
  const categorySet = new Set(categories);
  const edgeWeights = new Map();

  for (let index = 0; index < modules.length; index += 1) {
    const sourceCategory = areaFromModuleName(modules[index].name);

    if (!categorySet.has(sourceCategory)) {
      continue;
    }

    for (const target of modules[index].imports) {
      const targetModule = modules[target];
      const targetCategory = targetModule ? areaFromModuleName(targetModule.name) : '';

      if (!categorySet.has(targetCategory) || targetCategory === sourceCategory) {
        continue;
      }

      const key = `${sourceCategory}->${targetCategory}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }
  }

  return [...edgeWeights]
    .map(([key, weight]) => {
      const [source, target] = key.split('->');
      return { source, target, weight };
    })
    .sort((left, right) => right.weight - left.weight || left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output);
  const graph = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const conceptDependencies = graph.relations.conceptDependencies ?? [];
  const { outgoing, incoming } = buildConceptMaps(conceptDependencies);
  const categories = buildCategories(graph.modules);
  const categoryCenters = new Map(categories.map((category, index) => [category, categoryCenter(index)]));
  const moduleOrderByCategory = new Map(categories.map((category) => [category, 0]));
  const moduleNodes = graph.modules.map((module, index) => {
    const category = areaFromModuleName(module.name);
    const positionedModule = { ...module, category };
    const position = modulePosition(positionedModule, index, moduleOrderByCategory, categoryCenters);

    return {
      id: `m:${index}`,
      index,
      name: module.name,
      label: labelFromName(module.name),
      kind: 'module',
      category,
      module: module.name,
      moduleIndex: index,
      docLink: publicDocLink(module.docLink),
      outDegree: module.imports.length,
      inDegree: module.importedBy.length,
      degree: module.imports.length + module.importedBy.length + module.declarationCount,
      position,
    };
  });

  const moduleDeclarationOrder = new Map();
  const declarationNodes = graph.declarations.map((declaration, index) => {
    const module = graph.modules[declaration.module];
    const moduleNode = moduleNodes[declaration.module];
    const order = moduleDeclarationOrder.get(declaration.module) ?? 0;
    moduleDeclarationOrder.set(declaration.module, order + 1);
    const outDegree = outgoing.get(index)?.length ?? 0;
    const inDegree = incoming.get(index)?.length ?? 0;

    return {
      id: `d:${index}`,
      index,
      name: declaration.name,
      label: labelFromName(declaration.name),
      kind: declaration.kind,
      category: moduleNode?.category ?? 'Other',
      module: module?.name ?? '',
      moduleIndex: declaration.module,
      docLink: publicDocLink(declaration.docLink),
      outDegree,
      inDegree,
      degree: outDegree + inDegree,
      position: declarationPosition(declaration, moduleNode, order),
    };
  });

  const edges = [];

  for (const relation of conceptDependencies) {
    for (const target of relation.targets) {
      edges.push({
        source: `d:${relation.source}`,
        target: `d:${target}`,
        kind: 'depends_on',
      });
    }
  }

  for (let index = 0; index < graph.declarations.length; index += 1) {
    edges.push({
      source: `d:${index}`,
      target: `m:${graph.declarations[index].module}`,
      kind: 'in_module',
    });
  }

  for (let index = 0; index < graph.modules.length; index += 1) {
    for (const target of graph.modules[index].imports) {
      edges.push({
        source: `m:${index}`,
        target: `m:${target}`,
        kind: 'imports',
      });
    }
  }

  const nodes = [...declarationNodes, ...moduleNodes];
  const dataset = {
    meta: {
      title: 'Lean/mathlib full 3D dependency map',
      version: '0.4.0',
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      source: graph.meta.source,
      fullCounts: graph.meta.counts,
    },
    categories,
    kinds: Array.from(new Set(nodes.map((entry) => entry.kind))).sort(),
    clusterEdges: buildClusterEdges(graph.modules, categories),
    nodes,
    edges,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset)}\n`, 'utf8');
  process.stdout.write(`Dataset written to ${path.relative(process.cwd(), outputPath)} (${nodes.length} nodes, ${edges.length} edges)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
