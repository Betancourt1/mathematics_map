import fs from 'node:fs/promises';
import path from 'node:path';

const defaultSiteRoot = 'https://leanprover-community.github.io/mathlib4_docs/';
const graphSchemaVersion = 'mathlib-graph@0.3.0';
const keptDeclarationKinds = new Set(['class', 'structure', 'inductive', 'def', 'theorem', 'axiom']);
const ignoredMathlibModulePatterns = [
  /^Mathlib\.(Init|Tactic|Util|Testing|Meta|Lean)\b/,
  /\.(Tactic|Meta|Elab|Notation|Simps|Linter)\b/,
];
const technicalDeclarationNames = new Set(['DFunLike', 'SetLike', 'Set.Elem']);
const lowPriorityConceptDependencyNames = new Set([
  'Additive',
  'AddOpposite',
  'carrier',
  'comp',
  'Decidable',
  'Inhabited',
  'Lex',
  'MulOpposite',
  'Multiplicative',
  'Nontrivial',
  'obj',
  'OrderDual',
  'Set.Elem',
  'Subsingleton',
  'Unique',
]);
const technicalDeclarationNamePattern = /(^|\.)(Meta|Elab|Tactic|Linter)(\.|$)/;

function parseArgs(argv) {
  const options = {
    output: 'data/generated/mathlib-docgen4-graph.json',
    siteRoot: defaultSiteRoot,
    pretty: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--output' && next) {
      options.output = next;
      index += 1;
      continue;
    }

    if (current === '--site-root' && next) {
      options.siteRoot = next;
      index += 1;
      continue;
    }

    if (current === '--pretty') {
      options.pretty = true;
    }
  }

  return options;
}

function inferCategory(moduleName) {
  return moduleName.split('.')[1] ?? 'Other';
}

function isMathematicalModule(moduleName) {
  return (
    moduleName.startsWith('Mathlib.') &&
    !ignoredMathlibModulePatterns.some((pattern) => pattern.test(moduleName))
  );
}

function hasTechnicalDeclarationName(name) {
  return (
    !/^[\x00-\x7F]+$/.test(name) ||
    technicalDeclarationNames.has(name) ||
    technicalDeclarationNamePattern.test(name)
  );
}

function labelFromName(name) {
  return name.split('.').at(-1) ?? name;
}

function isLowPriorityConceptDependency(name) {
  return (
    lowPriorityConceptDependencyNames.has(name) ||
    lowPriorityConceptDependencyNames.has(labelFromName(name))
  );
}

function parseModuleName(docLink) {
  const match = docLink.match(/^\.\/(.+)\.html#/);

  if (!match) {
    return null;
  }

  return match[1].replaceAll('/', '.');
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function sortUniqueNumbers(values) {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function buildConceptDependencies(rawInstances, rawInstancesFor, declarationIndexByName, declarations) {
  const classByInstanceName = new Map();
  const groupedBySource = new Map();

  for (const [className, rawInstanceNames] of Object.entries(rawInstances ?? {})) {
    const classIndex = declarationIndexByName.get(className);

    if (
      classIndex === undefined ||
      !Array.isArray(rawInstanceNames) ||
      isLowPriorityConceptDependency(className)
    ) {
      continue;
    }

    for (const instanceName of rawInstanceNames) {
      classByInstanceName.set(instanceName, classIndex);
    }
  }

  for (const [typeName, rawInstanceNames] of Object.entries(rawInstancesFor ?? {})) {
    const typeIndex = declarationIndexByName.get(typeName);

    if (
      typeIndex === undefined ||
      !Array.isArray(rawInstanceNames) ||
      isLowPriorityConceptDependency(typeName)
    ) {
      continue;
    }

    const targets = groupedBySource.get(typeIndex) ?? [];

    for (const instanceName of rawInstanceNames) {
      const classIndex = classByInstanceName.get(instanceName);

      if (
        classIndex !== undefined &&
        classIndex !== typeIndex &&
        !isLowPriorityConceptDependency(declarations[classIndex]?.name ?? '')
      ) {
        targets.push(classIndex);
      }
    }

    if (targets.length > 0) {
      groupedBySource.set(typeIndex, targets);
    }
  }

  const grouped = Array.from(groupedBySource.entries())
    .map(([source, targets]) => ({
      source,
      targets: sortUniqueNumbers(targets),
    }))
    .filter((relation) => relation.targets.length > 0)
    .sort((left, right) => left.source - right.source);

  return {
    grouped,
    edgeCount: grouped.reduce((total, relation) => total + relation.targets.length, 0),
  };
}

async function fetchDocGen4Index(siteRoot) {
  const indexUrl = new URL('declarations/declaration-data.bmp', siteRoot);
  const response = await fetch(indexUrl);

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${indexUrl} (${response.status}).`);
  }

  const text = await response.text();
  return {
    indexUrl: indexUrl.toString(),
    payload: JSON.parse(text),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const siteRoot = ensureTrailingSlash(options.siteRoot);
  const outputPath = path.resolve(process.cwd(), options.output);
  const { indexUrl, payload } = await fetchDocGen4Index(siteRoot);

  const skipped = {
    declarationsWithoutDocLink: 0,
    declarationsWithoutModule: 0,
    declarationsWithUnknownModule: 0,
    moduleImportedByTargetsMissing: 0,
    excludedModules: 0,
    declarationsInExcludedModules: 0,
    declarationsWithExcludedKind: 0,
    declarationsWithTechnicalName: 0,
  };

  const rawModules = payload.modules ?? {};
  const allModuleNames = Object.keys(rawModules).sort((left, right) => left.localeCompare(right));
  const moduleNames = allModuleNames.filter(isMathematicalModule);
  skipped.excludedModules = allModuleNames.length - moduleNames.length;
  const moduleIndexByName = new Map(moduleNames.map((name, index) => [name, index]));
  const importsByModule = moduleNames.map(() => []);
  const importedByByModule = moduleNames.map(() => []);
  const moduleDeclarationCounts = moduleNames.map(() => 0);
  const moduleCategoryCounts = new Map();

  for (const moduleName of moduleNames) {
    const moduleIndex = moduleIndexByName.get(moduleName);
    const rawImportedBy = Array.isArray(rawModules[moduleName]?.importedBy)
      ? rawModules[moduleName].importedBy
      : [];

    if (moduleIndex === undefined) {
      continue;
    }

    for (const importerName of rawImportedBy) {
      if (!isMathematicalModule(importerName)) {
        continue;
      }

      const importerIndex = moduleIndexByName.get(importerName);

      if (importerIndex === undefined) {
        skipped.moduleImportedByTargetsMissing += 1;
        continue;
      }

      importedByByModule[moduleIndex].push(importerIndex);
      importsByModule[importerIndex].push(moduleIndex);
    }

    const category = inferCategory(moduleName);
    moduleCategoryCounts.set(category, (moduleCategoryCounts.get(category) ?? 0) + 1);
  }

  const declarationEntries = Object.entries(payload.declarations ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const declarations = [];
  const declarationIndexByName = new Map();
  const declarationKindCounts = new Map();
  const declarationCategoryCounts = new Map();

  for (const [name, value] of declarationEntries) {
    if (!value || typeof value.docLink !== 'string') {
      skipped.declarationsWithoutDocLink += 1;
      continue;
    }

    const moduleName = parseModuleName(value.docLink);

    if (!moduleName) {
      skipped.declarationsWithoutModule += 1;
      continue;
    }

    if (!isMathematicalModule(moduleName)) {
      skipped.declarationsInExcludedModules += 1;
      continue;
    }

    const moduleIndex = moduleIndexByName.get(moduleName);

    if (moduleIndex === undefined) {
      skipped.declarationsWithUnknownModule += 1;
      continue;
    }

    const kind = typeof value.kind === 'string' ? value.kind : 'unknown';

    if (!keptDeclarationKinds.has(kind)) {
      skipped.declarationsWithExcludedKind += 1;
      continue;
    }

    if (hasTechnicalDeclarationName(name)) {
      skipped.declarationsWithTechnicalName += 1;
      continue;
    }

    const category = inferCategory(moduleName);

    const declarationIndex = declarations.length;

    declarations.push({
      name,
      module: moduleIndex,
      kind,
      docLink: value.docLink,
    });
    declarationIndexByName.set(name, declarationIndex);
    moduleDeclarationCounts[moduleIndex] += 1;
    declarationKindCounts.set(kind, (declarationKindCounts.get(kind) ?? 0) + 1);
    declarationCategoryCounts.set(category, (declarationCategoryCounts.get(category) ?? 0) + 1);
  }

  const modules = moduleNames.map((name, index) => ({
    name,
    category: inferCategory(name),
    docLink: typeof rawModules[name]?.url === 'string' ? rawModules[name].url : null,
    declarationCount: moduleDeclarationCounts[index],
    imports: sortUniqueNumbers(importsByModule[index]),
    importedBy: sortUniqueNumbers(importedByByModule[index]),
  }));

  const conceptDependencies = buildConceptDependencies(
    payload.instances,
    payload.instancesFor,
    declarationIndexByName,
    declarations,
  );

  const moduleImportEdgeCount = modules.reduce((total, entry) => total + entry.imports.length, 0);
  const declarationModuleEdgeCount = declarations.length;
  const totalEdgeCount =
    declarationModuleEdgeCount +
    moduleImportEdgeCount +
    conceptDependencies.edgeCount;

  const graph = {
    schemaVersion: graphSchemaVersion,
    meta: {
      title: 'mathlib full graph',
      generatedAt: new Date().toISOString(),
      source: {
        kind: 'doc-gen4',
        description:
          'Mathematical graph built from the public mathlib4_docs declaration index. Retained edges are declaration->module, module->module imports, and inferred concept dependencies from typeclass instance relations. Excludes Lean runtime libraries, tooling modules, generated notation/tactic declarations, instances, constructors, and opaque declarations.',
        siteRoot,
        indexUrl,
      },
      counts: {
        modules: modules.length,
        declarations: declarations.length,
        nodes: modules.length + declarations.length,
        edges: totalEdgeCount,
      },
      edgeCounts: {
        declarationModule: declarationModuleEdgeCount,
        moduleImports: moduleImportEdgeCount,
        conceptDependencies: conceptDependencies.edgeCount,
      },
      moduleCategoryCounts: Object.fromEntries(
        Array.from(moduleCategoryCounts.entries()).sort(([left], [right]) => left.localeCompare(right)),
      ),
      declarationCategoryCounts: Object.fromEntries(
        Array.from(declarationCategoryCounts.entries()).sort(([left], [right]) => left.localeCompare(right)),
      ),
      declarationKindCounts: Object.fromEntries(
        Array.from(declarationKindCounts.entries()).sort(([left], [right]) => left.localeCompare(right)),
      ),
      skipped,
    },
    modules,
    declarations,
    relations: {
      conceptDependencies: conceptDependencies.grouped,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const json = options.pretty ? JSON.stringify(graph, null, 2) : JSON.stringify(graph);
  await fs.writeFile(outputPath, `${json}\n`, 'utf8');

  process.stdout.write(
    `Graph written to ${path.relative(process.cwd(), outputPath)} with ${graph.meta.counts.nodes} nodes and ${graph.meta.counts.edges} edges.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
