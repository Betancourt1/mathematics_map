import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    input: 'data/generated/mathlib-docgen4-graph.json',
    output: 'data/generated/mathlib-docgen4-graph.gexf',
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

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function declarationNodeId(index) {
  return `d:${index}`;
}

function moduleNodeId(index) {
  return `m:${index}`;
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) {
    return;
  }

  await new Promise((resolve, reject) => {
    function onDrain() {
      stream.off('error', onError);
      resolve();
    }

    function onError(error) {
      stream.off('drain', onDrain);
      reject(error);
    }

    stream.once('drain', onDrain);
    stream.once('error', onError);
  });
}

async function loadGraph(inputPath) {
  const text = await fsp.readFile(inputPath, 'utf8');
  return JSON.parse(text);
}

function nodeAttValues(values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '');

  if (entries.length === 0) {
    return '';
  }

  const fragments = entries.map(
    ([attributeId, value]) => `<attvalue for="${attributeId}" value="${escapeXml(value)}" />`,
  );

  return `<attvalues>${fragments.join('')}</attvalues>`;
}

function edgeAttValues(relationKind) {
  return `<attvalues><attvalue for="relation_kind" value="${escapeXml(relationKind)}" /></attvalues>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output);
  const graph = await loadGraph(inputPath);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const stream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  await writeChunk(
    stream,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n` +
      `  <meta lastmodifieddate="${escapeXml(graph.meta.generatedAt.slice(0, 10))}">\n` +
      `    <creator>mathematics-map</creator>\n` +
      `    <description>${escapeXml(graph.meta.source.description)}</description>\n` +
      `  </meta>\n` +
      `  <graph defaultedgetype="directed" mode="static">\n` +
      `    <attributes class="node">\n` +
      `      <attribute id="node_type" title="node_type" type="string" />\n` +
      `      <attribute id="category" title="category" type="string" />\n` +
      `      <attribute id="decl_kind" title="decl_kind" type="string" />\n` +
      `      <attribute id="module_name" title="module_name" type="string" />\n` +
      `      <attribute id="doc_link" title="doc_link" type="string" />\n` +
      `      <attribute id="declaration_count" title="declaration_count" type="integer" />\n` +
      `      <attribute id="import_count" title="import_count" type="integer" />\n` +
      `      <attribute id="imported_by_count" title="imported_by_count" type="integer" />\n` +
      `    </attributes>\n` +
      `    <attributes class="edge">\n` +
      `      <attribute id="relation_kind" title="relation_kind" type="string" />\n` +
      `    </attributes>\n` +
      `    <nodes>\n`,
  );

  for (let index = 0; index < graph.modules.length; index += 1) {
    const module = graph.modules[index];
    const attvalues = nodeAttValues({
      node_type: 'module',
      category: module.category,
      doc_link: module.docLink,
      declaration_count: module.declarationCount,
      import_count: module.imports.length,
      imported_by_count: module.importedBy.length,
    });

    await writeChunk(
      stream,
      `      <node id="${moduleNodeId(index)}" label="${escapeXml(module.name)}">${attvalues}</node>\n`,
    );
  }

  for (let index = 0; index < graph.declarations.length; index += 1) {
    const declaration = graph.declarations[index];
    const moduleName = graph.modules[declaration.module]?.name ?? '';
    const category = graph.modules[declaration.module]?.category ?? '';
    const attvalues = nodeAttValues({
      node_type: 'declaration',
      category,
      decl_kind: declaration.kind,
      module_name: moduleName,
      doc_link: declaration.docLink,
    });

    await writeChunk(
      stream,
      `      <node id="${declarationNodeId(index)}" label="${escapeXml(declaration.name)}">${attvalues}</node>\n`,
    );
  }

  await writeChunk(stream, '    </nodes>\n    <edges>\n');

  let edgeId = 0;

  for (let index = 0; index < graph.declarations.length; index += 1) {
    const declaration = graph.declarations[index];

    await writeChunk(
      stream,
      `      <edge id="e${edgeId}" source="${declarationNodeId(index)}" target="${moduleNodeId(declaration.module)}">${edgeAttValues('declaration_module')}</edge>\n`,
    );
    edgeId += 1;
  }

  for (let index = 0; index < graph.modules.length; index += 1) {
    const module = graph.modules[index];

    for (const target of module.imports) {
      await writeChunk(
        stream,
        `      <edge id="e${edgeId}" source="${moduleNodeId(index)}" target="${moduleNodeId(target)}">${edgeAttValues('module_import')}</edge>\n`,
      );
      edgeId += 1;
    }
  }

  for (const relation of graph.relations.conceptDependencies ?? []) {
    for (const target of relation.targets) {
      await writeChunk(
        stream,
        `      <edge id="e${edgeId}" source="${declarationNodeId(relation.source)}" target="${declarationNodeId(target)}">${edgeAttValues('concept_dependency')}</edge>\n`,
      );
      edgeId += 1;
    }
  }

  await writeChunk(stream, '    </edges>\n  </graph>\n</gexf>\n');

  await new Promise((resolve, reject) => {
    function onError(error) {
      reject(error);
    }

    stream.once('error', onError);
    stream.end(() => {
      stream.off('error', onError);
      resolve();
    });
  });

  process.stdout.write(
    `GEXF written to ${path.relative(process.cwd(), outputPath)} with ${graph.meta.counts.nodes} nodes and ${graph.meta.counts.edges} edges.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
