import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    input: 'data/raw/mathlib-declarations.json',
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
      continue;
    }
  }

  return options;
}

function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferCategory(moduleName, explicitCategory) {
  if (typeof explicitCategory === 'string' && explicitCategory.trim()) {
    return explicitCategory;
  }

  const normalized = moduleName.replaceAll('/', '.');
  const parts = normalized.split('.');
  const mathlibIndex = parts.indexOf('Mathlib');

  return parts[mathlibIndex + 1] ?? parts[0] ?? 'Other';
}

function firstSentence(value) {
  if (!value) {
    return '';
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  const match = compact.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : compact).slice(0, 180);
}

function buildCategories(entries) {
  const counts = new Map();

  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category]) => category);
}

function createLayout(category, index, total, categories) {
  const categoryIndex = Math.max(0, categories.indexOf(category));
  const xBase = categories.length <= 1 ? 50 : 8 + (categoryIndex * 84) / (categories.length - 1);
  const yBase = total <= 1 ? 50 : 14 + (index * 72) / (total - 1);
  const xJitter = index % 2 === 0 ? 0 : 3.5;
  const yJitter = index % 3 === 0 ? 0 : index % 3 === 1 ? 2.5 : -2.5;

  return {
    x: Math.min(94, Number((xBase + xJitter).toFixed(2))),
    y: Math.min(92, Number((yBase + yJitter).toFixed(2))),
  };
}

function countEdges(nodes) {
  const seen = new Set();

  for (const node of nodes) {
    for (const target of node.links) {
      const key = [node.id, target].sort().join(':');
      seen.add(key);
    }
  }

  return seen.size;
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output);
  const rawText = await fs.readFile(inputPath, 'utf8');
  const raw = JSON.parse(rawText);
  const declarations = Array.isArray(raw) ? raw : raw.declarations;

  if (!Array.isArray(declarations)) {
    throw new Error('El archivo de entrada debe ser un arreglo o un objeto con declarations[].');
  }

  const normalized = declarations.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Cada declaracion debe ser un objeto.');
    }

    if (typeof entry.name !== 'string' || typeof entry.module !== 'string') {
      throw new Error('Cada declaracion necesita name y module.');
    }

    const category = inferCategory(entry.module, entry.category);

    return {
      id: typeof entry.id === 'string' ? entry.id : toSlug(entry.name),
      name: entry.name,
      label:
        typeof entry.label === 'string'
          ? entry.label
          : entry.name.split('.').at(-1) ?? entry.name,
      module: entry.module,
      category,
      summary: firstSentence(typeof entry.doc === 'string' ? entry.doc : '') || `Declaration from ${entry.module}.`,
      references: Array.isArray(entry.references)
        ? entry.references.filter((reference) => typeof reference === 'string')
        : [],
    };
  });

  const idsByName = new Map(normalized.map((entry) => [entry.name, entry.id]));
  const categories = buildCategories(normalized);
  const grouped = new Map(categories.map((category) => [category, []]));

  for (const entry of normalized) {
    grouped.get(entry.category)?.push(entry);
  }

  const nodes = [];

  for (const category of categories) {
    const bucket = grouped.get(category) ?? [];

    bucket.forEach((entry, index) => {
      const { x, y } = createLayout(category, index, bucket.length, categories);
      const links = entry.references
        .map((reference) => idsByName.get(reference))
        .filter((referenceId) => typeof referenceId === 'string' && referenceId !== entry.id);

      nodes.push({
        id: entry.id,
        label: entry.label,
        category,
        summary: entry.summary,
        module: entry.module,
        x,
        y,
        links: Array.from(new Set(links)),
      });
    });
  }

  const dataset = {
    meta: {
      title: `${raw.project ?? 'mathlib'} declaration map`,
      version: '0.1.0',
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: countEdges(nodes),
      source: {
        kind: raw.source?.kind ?? 'normalized-json',
        description:
          raw.source?.description ?? `Generated from ${path.basename(inputPath)}`,
        url: raw.source?.url,
      },
    },
    categories,
    nodes,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  process.stdout.write(`Dataset written to ${path.relative(process.cwd(), outputPath)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
