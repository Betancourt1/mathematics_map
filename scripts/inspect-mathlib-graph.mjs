import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    input: 'data/generated/mathlib-docgen4-graph.json',
    declaration: '',
    module: '',
    top: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--input' && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (current === '--declaration' && next) {
      options.declaration = next;
      index += 1;
      continue;
    }

    if (current === '--module' && next) {
      options.module = next;
      index += 1;
      continue;
    }

    if (current === '--top' && next) {
      options.top = Number(next);
      index += 1;
    }
  }

  return options;
}

function normalizeTop(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
}

function formatList(values, limit = 10) {
  if (values.length === 0) {
    return 'none';
  }

  const selected = values.slice(0, limit);
  return selected.join(', ');
}

function buildIncomingMap(relations) {
  const incoming = new Map();

  for (const relation of relations) {
    for (const target of relation.targets) {
      const bucket = incoming.get(target) ?? [];
      bucket.push(relation.source);
      incoming.set(target, bucket);
    }
  }

  return incoming;
}

async function loadGraph(input) {
  const inputPath = path.resolve(process.cwd(), input);
  const text = await fs.readFile(inputPath, 'utf8');
  return JSON.parse(text);
}

function printSummary(graph, top) {
  const topModules = graph.modules
    .map((module, index) => ({
      index,
      name: module.name,
      declarationCount: module.declarationCount,
      importedByCount: module.importedBy.length,
      importCount: module.imports.length,
    }))
    .sort((left, right) => {
      const declarationDelta = right.declarationCount - left.declarationCount;

      if (declarationDelta !== 0) {
        return declarationDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, top);

  process.stdout.write(`Schema: ${graph.schemaVersion}\n`);
  process.stdout.write(`Generated: ${graph.meta.generatedAt}\n`);
  process.stdout.write(`Source: ${graph.meta.source.indexUrl}\n`);
  process.stdout.write(
    `Counts: ${graph.meta.counts.nodes} nodes, ${graph.meta.counts.edges} edges, ${graph.meta.counts.declarations} declarations, ${graph.meta.counts.modules} modules.\n`,
  );
  process.stdout.write(
    `Edges: declaration->module=${graph.meta.edgeCounts.declarationModule}, module imports=${graph.meta.edgeCounts.moduleImports}, concept dependencies=${graph.meta.edgeCounts.conceptDependencies ?? 0}.\n`,
  );
  process.stdout.write('Top modules by declaration count:\n');

  for (const module of topModules) {
    process.stdout.write(
      `- ${module.name}: ${module.declarationCount} declarations, ${module.importCount} imports, ${module.importedByCount} importedBy.\n`,
    );
  }

  const topConceptDependencies = (graph.relations.conceptDependencies ?? [])
    .map((relation) => ({
      source: relation.source,
      targetCount: relation.targets.length,
    }))
    .sort((left, right) => right.targetCount - left.targetCount)
    .slice(0, top)
    .map((entry) => `${graph.declarations[entry.source]?.name ?? entry.source} (${entry.targetCount})`);

  process.stdout.write(`Top concept dependency sources: ${formatList(topConceptDependencies, top)}\n`);
}

function printDeclaration(graph, declarationName) {
  const declarationIndex = graph.declarations.findIndex((entry) => entry.name === declarationName);

  if (declarationIndex === -1) {
    throw new Error(`Declaration not found: ${declarationName}`);
  }

  const declaration = graph.declarations[declarationIndex];
  const moduleEntry = graph.modules[declaration.module];
  const conceptDependencies = graph.relations.conceptDependencies ?? [];
  const outgoingConceptDependencies = conceptDependencies.find((entry) => entry.source === declarationIndex);
  const incomingConceptMap = buildIncomingMap(conceptDependencies);
  const incomingConceptDependencies = incomingConceptMap.get(declarationIndex) ?? [];

  process.stdout.write(`Declaration: ${declaration.name}\n`);
  process.stdout.write(`Kind: ${declaration.kind}\n`);
  process.stdout.write(`Module: ${moduleEntry?.name ?? declaration.module}\n`);
  process.stdout.write(`Category: ${moduleEntry?.category ?? 'unknown'}\n`);
  process.stdout.write(`Doc link: ${declaration.docLink}\n`);
  process.stdout.write(
    `Depends on concepts: ${outgoingConceptDependencies?.targets.length ?? 0} -> ${formatList((outgoingConceptDependencies?.targets ?? []).map((index) => graph.declarations[index]?.name ?? String(index)))}\n`,
  );
  process.stdout.write(
    `Used by concepts: ${incomingConceptDependencies.length} -> ${formatList(incomingConceptDependencies.map((index) => graph.declarations[index]?.name ?? String(index)))}\n`,
  );
}

function printModule(graph, moduleName, top) {
  const moduleIndex = graph.modules.findIndex((entry) => entry.name === moduleName);

  if (moduleIndex === -1) {
    throw new Error(`Module not found: ${moduleName}`);
  }

  const moduleEntry = graph.modules[moduleIndex];
  const declarations = graph.declarations
    .map((entry, index) => ({
      index,
      name: entry.name,
      kind: entry.kind,
      module: entry.module,
    }))
    .filter((entry) => entry.module === moduleIndex)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, top);

  process.stdout.write(`Module: ${moduleEntry.name}\n`);
  process.stdout.write(`Category: ${moduleEntry.category}\n`);
  process.stdout.write(`Doc link: ${moduleEntry.docLink ?? 'n/a'}\n`);
  process.stdout.write(`Declarations: ${moduleEntry.declarationCount}\n`);
  process.stdout.write(
    `Imports (${moduleEntry.imports.length}): ${formatList(moduleEntry.imports.map((index) => graph.modules[index]?.name ?? String(index)), top)}\n`,
  );
  process.stdout.write(
    `Imported by (${moduleEntry.importedBy.length}): ${formatList(moduleEntry.importedBy.map((index) => graph.modules[index]?.name ?? String(index)), top)}\n`,
  );
  process.stdout.write(
    `Sample declarations: ${formatList(declarations.map((entry) => `${entry.name} [${entry.kind}]`), top)}\n`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const graph = await loadGraph(options.input);
  const top = normalizeTop(options.top);

  if (options.declaration) {
    printDeclaration(graph, options.declaration);
    return;
  }

  if (options.module) {
    printModule(graph, options.module, top);
    return;
  }

  printSummary(graph, top);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
