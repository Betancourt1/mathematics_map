import fs from 'node:fs/promises';
import path from 'node:path';

const defaultSiteRoot = 'https://leanprover-community.github.io/mathlib4_docs/';
const kindRank = {
  class: 9,
  structure: 8,
  inductive: 7,
  def: 5,
  theorem: 4,
  axiom: 1,
};
const preferredKinds = new Set(['class', 'structure', 'inductive', 'def', 'theorem']);
const ignoredMathlibModulePatterns = [
  /^Mathlib\.(Init|Tactic|Util|Testing|Meta|Lean)\b/,
  /\.(Tactic|Meta|Elab|Notation|Simps|Linter)\b/,
];
const technicalDeclarationNames = new Set(['DFunLike', 'SetLike', 'Set.Elem']);
const lowPriorityRepresentativeNames = new Set([
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
    output: 'public/data/mathlib-map.json',
    siteRoot: defaultSiteRoot,
    maxPerCategory: 14,
    maxPerModule: 2,
    maxEdgesPerNode: 3,
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

    if (current === '--max-per-category' && next) {
      options.maxPerCategory = Number(next);
      index += 1;
      continue;
    }

    if (current === '--max-per-module' && next) {
      options.maxPerModule = Number(next);
      index += 1;
      continue;
    }

    if (current === '--max-edges-per-node' && next) {
      options.maxEdgesPerNode = Number(next);
      index += 1;
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

function parseModuleName(docLink) {
  const match = docLink.match(/^\.\/(.+)\.html#/);

  if (!match) {
    return null;
  }

  return match[1].replaceAll('/', '.');
}

function parseModulePath(moduleName) {
  return moduleName.replaceAll('.', '/');
}

function labelFromName(name) {
  return name.split('.').at(-1) ?? name;
}

function isLowPriorityRepresentativeName(name) {
  return (
    lowPriorityRepresentativeNames.has(name) ||
    lowPriorityRepresentativeNames.has(labelFromName(name))
  );
}

function isGoodRepresentative(entry) {
  return !isLowPriorityRepresentativeName(entry.name) && !isLowPriorityRepresentativeName(entry.label);
}

function buildCategories(declarations) {
  const counts = new Map();

  for (const declaration of declarations) {
    counts.set(declaration.category, (counts.get(declaration.category) ?? 0) + 1);
  }

  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category]) => category);
}

function createLayout(category, index, total, categories) {
  const categoryIndex = Math.max(0, categories.indexOf(category));
  const xBase = categories.length <= 1 ? 50 : 8 + (categoryIndex * 84) / (categories.length - 1);
  const yBase = total <= 1 ? 50 : 12 + (index * 76) / (total - 1);
  const xJitter = index % 2 === 0 ? 0 : 3.25;
  const yJitter = index % 3 === 0 ? 0 : index % 3 === 1 ? 2.5 : -2.5;

  return {
    x: Math.min(94, Number((xBase + xJitter).toFixed(2))),
    y: Math.min(92, Number((yBase + yJitter).toFixed(2))),
  };
}

function edgeCount(nodes) {
  const seen = new Set();

  for (const node of nodes) {
    for (const target of node.links) {
      seen.add([node.id, target].sort().join(':'));
    }
  }

  return seen.size;
}

function addMapValue(map, key, value) {
  const bucket = map.get(key) ?? [];
  bucket.push(value);
  map.set(key, bucket);
}

function buildConceptDependencies(rawInstances, rawInstancesFor, declarationsByName) {
  const classByInstanceName = new Map();
  const dependenciesByName = new Map();
  const dependentsByName = new Map();
  const degreeByName = new Map();

  for (const [className, rawInstanceNames] of Object.entries(rawInstances ?? {})) {
    if (
      !declarationsByName.has(className) ||
      !Array.isArray(rawInstanceNames) ||
      isLowPriorityRepresentativeName(className)
    ) {
      continue;
    }

    for (const instanceName of rawInstanceNames) {
      classByInstanceName.set(instanceName, className);
    }
  }

  for (const [typeName, rawInstanceNames] of Object.entries(rawInstancesFor ?? {})) {
    if (
      !declarationsByName.has(typeName) ||
      !Array.isArray(rawInstanceNames) ||
      isLowPriorityRepresentativeName(typeName)
    ) {
      continue;
    }

    for (const instanceName of rawInstanceNames) {
      const className = classByInstanceName.get(instanceName);

      if (!className || className === typeName || isLowPriorityRepresentativeName(className)) {
        continue;
      }

      addMapValue(dependenciesByName, typeName, className);
      addMapValue(dependentsByName, className, typeName);
      degreeByName.set(typeName, (degreeByName.get(typeName) ?? 0) + 1);
      degreeByName.set(className, (degreeByName.get(className) ?? 0) + 1);
    }
  }

  for (const [name, dependencies] of dependenciesByName) {
    dependenciesByName.set(name, Array.from(new Set(dependencies)).sort((left, right) => left.localeCompare(right)));
  }

  for (const [name, dependents] of dependentsByName) {
    dependentsByName.set(name, Array.from(new Set(dependents)).sort((left, right) => left.localeCompare(right)));
  }

  degreeByName.clear();

  for (const [name, dependencies] of dependenciesByName) {
    degreeByName.set(name, (degreeByName.get(name) ?? 0) + dependencies.length);
  }

  for (const [name, dependents] of dependentsByName) {
    degreeByName.set(name, (degreeByName.get(name) ?? 0) + dependents.length);
  }

  return {
    dependenciesByName,
    dependentsByName,
    degreeByName,
    edgeCount: Array.from(dependenciesByName.values()).reduce(
      (total, dependencies) => total + dependencies.length,
      0,
    ),
  };
}

async function fetchDocGen4Index(siteRoot) {
  const target = new URL('declarations/declaration-data.bmp', siteRoot);
  const response = await fetch(target);

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${target} (${response.status}).`);
  }

  const text = await response.text();
  return JSON.parse(text);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(process.cwd(), options.output);
  const siteRoot = options.siteRoot.endsWith('/') ? options.siteRoot : `${options.siteRoot}/`;
  const raw = await fetchDocGen4Index(siteRoot);
  const allModuleEntries = Object.entries(raw.modules ?? {});
  const moduleEntries = allModuleEntries.filter(([name]) => isMathematicalModule(name));
  const declarationEntries = Object.entries(raw.declarations ?? {});
  const moduleInfoByName = new Map(
    moduleEntries.map(([name, value]) => [
      name,
      {
        importedBy: Array.isArray(value.importedBy) ? value.importedBy : [],
        url: typeof value.url === 'string' ? new URL(value.url, siteRoot).toString() : undefined,
      },
    ]),
  );

  const declarationsByModule = new Map();

  const declarations = declarationEntries.flatMap(([name, value]) => {
    if (!value || typeof value.docLink !== 'string') {
      return [];
    }

    const moduleName = parseModuleName(value.docLink);

    if (!moduleName || !isMathematicalModule(moduleName)) {
      return [];
    }

    const kind = typeof value.kind === 'string' ? value.kind : 'unknown';

    if (!preferredKinds.has(kind) || hasTechnicalDeclarationName(name)) {
      return [];
    }

    const category = inferCategory(moduleName);
    const declaration = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
      name,
      label: labelFromName(name),
      kind,
      category,
      moduleName,
      modulePath: parseModulePath(moduleName),
      docLink: new URL(value.docLink, siteRoot).toString(),
      importedByCount: moduleInfoByName.get(moduleName)?.importedBy.length ?? 0,
    };

    const bucket = declarationsByModule.get(moduleName) ?? [];
    bucket.push(declaration);
    declarationsByModule.set(moduleName, bucket);
    return declaration;
  });

  const declarationsByName = new Map(declarations.map((declaration) => [declaration.name, declaration]));
  const conceptDependencies = buildConceptDependencies(raw.instances, raw.instancesFor, declarationsByName);
  const categories = buildCategories(declarations);

  const candidates = declarations
    .filter((entry) => preferredKinds.has(entry.kind))
    .filter(isGoodRepresentative)
    .sort((left, right) => {
      const degreeDelta =
        (conceptDependencies.degreeByName.get(right.name) ?? 0) -
        (conceptDependencies.degreeByName.get(left.name) ?? 0);

      if (degreeDelta !== 0) {
        return degreeDelta;
      }

      const importedDelta = right.importedByCount - left.importedByCount;

      if (importedDelta !== 0) {
        return importedDelta;
      }

      const kindDelta = (kindRank[right.kind] ?? 0) - (kindRank[left.kind] ?? 0);

      if (kindDelta !== 0) {
        return kindDelta;
      }

      const moduleDensityDelta =
        (declarationsByModule.get(right.moduleName)?.length ?? 0) -
        (declarationsByModule.get(left.moduleName)?.length ?? 0);

      if (moduleDensityDelta !== 0) {
        return moduleDensityDelta;
      }

      const labelDelta = left.label.length - right.label.length;

      if (labelDelta !== 0) {
        return labelDelta;
      }

      return left.name.localeCompare(right.name);
    });

  const selected = [];
  const categoryCounts = new Map(categories.map((category) => [category, 0]));
  const moduleCounts = new Map();

  for (const candidate of candidates) {
    if ((categoryCounts.get(candidate.category) ?? 0) >= options.maxPerCategory) {
      continue;
    }

    if ((moduleCounts.get(candidate.moduleName) ?? 0) >= options.maxPerModule) {
      continue;
    }

    selected.push(candidate);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
    moduleCounts.set(candidate.moduleName, (moduleCounts.get(candidate.moduleName) ?? 0) + 1);

    const isDone = categories.every(
      (category) => (categoryCounts.get(category) ?? 0) >= options.maxPerCategory,
    );

    if (isDone) {
      break;
    }
  }

  const selectedByModule = new Map();

  for (const declaration of selected) {
    const bucket = selectedByModule.get(declaration.moduleName) ?? [];
    bucket.push(declaration);
    selectedByModule.set(declaration.moduleName, bucket);
  }

  const selectedByName = new Map(selected.map((declaration) => [declaration.name, declaration]));
  const groupedSelected = new Map(categories.map((category) => [category, []]));

  for (const declaration of selected) {
    groupedSelected.get(declaration.category)?.push(declaration);
  }

  const nodes = [];

  for (const category of categories) {
    const bucket = groupedSelected.get(category) ?? [];

    bucket.forEach((entry, index) => {
      const { x, y } = createLayout(category, index, bucket.length, categories);
      const moduleInfo = moduleInfoByName.get(entry.moduleName);
      const sameModule = (selectedByModule.get(entry.moduleName) ?? [])
        .filter((candidate) => candidate.id !== entry.id)
        .slice(0, 1);
      const importedByNeighbors = (moduleInfo?.importedBy ?? [])
        .flatMap((moduleName) => selectedByModule.get(moduleName) ?? [])
        .filter((candidate) => candidate.id !== entry.id)
        .slice(0, options.maxEdgesPerNode);
      const dependencyNeighbors = [
        ...(conceptDependencies.dependenciesByName.get(entry.name) ?? []),
        ...(conceptDependencies.dependentsByName.get(entry.name) ?? []),
      ]
        .map((name) => selectedByName.get(name))
        .filter((candidate) => candidate && candidate.id !== entry.id)
        .slice(0, options.maxEdgesPerNode);
      const fallbackNeighbors = [...sameModule, ...importedByNeighbors];
      const links = (dependencyNeighbors.length > 0 ? dependencyNeighbors : fallbackNeighbors).map(
        (candidate) => candidate.id,
      );
      const declarationCountInModule = declarationsByModule.get(entry.moduleName)?.length ?? 0;
      const dependencyDegree = conceptDependencies.degreeByName.get(entry.name) ?? 0;

      nodes.push({
        id: entry.id,
        name: entry.name,
        label: entry.label,
        category,
        kind: entry.kind,
        docLink: entry.docLink,
        summary: `${entry.kind} en ${entry.modulePath}. Modulo con ${declarationCountInModule} declaraciones, ${dependencyDegree} dependencias conceptuales e importado por ${entry.importedByCount} modulos.`,
        module: entry.modulePath,
        x,
        y,
        links: Array.from(new Set(links)),
      });
    });
  }

  const dataset = {
    meta: {
      title: 'mathlib declaration map',
      version: '0.3.0',
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edgeCount(nodes),
      catalogCount: declarations.length,
      moduleCount: moduleEntries.length,
      conceptDependencyCount: conceptDependencies.edgeCount,
      excluded: {
        modules: allModuleEntries.length - moduleEntries.length,
        declarations: declarationEntries.length - declarations.length,
      },
      source: {
        kind: 'doc-gen4',
        description:
          'Representative mathematical declaration map generated from the public mathlib4_docs index. Links prefer inferred concept dependencies from typeclass instance relations and fall back to nearby module-import context when no selected concept dependency is available. Lean runtime libraries, tooling modules, generated notation/tactic declarations, instances, constructors, and opaque declarations are excluded.',
        url: siteRoot,
      },
    },
    categories,
    nodes,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `Generated ${nodes.length} map nodes from ${declarations.length} declarations and ${moduleEntries.length} modules.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
