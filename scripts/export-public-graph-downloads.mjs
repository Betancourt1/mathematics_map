import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    input: 'public/data/mathlib-map.json',
    gexf: 'public/data/mathlib-map.gexf',
    csv: 'public/data/mathlib-map.csv',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--input' && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (current === '--gexf' && next) {
      options.gexf = next;
      index += 1;
      continue;
    }

    if (current === '--csv' && next) {
      options.csv = next;
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

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
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

function nodeAttributes(node) {
  const values = {
    kind: node.kind,
    category: node.category,
    module: node.module,
    doc_link: node.docLink,
    out_degree: node.outDegree,
    in_degree: node.inDegree,
    degree: node.degree,
    x: node.position?.x,
    y: node.position?.y,
    z: node.position?.z,
  };
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '');

  if (entries.length === 0) {
    return '';
  }

  return `<attvalues>${entries
    .map(([key, value]) => `<attvalue for="${key}" value="${escapeXml(value)}" />`)
    .join('')}</attvalues>`;
}

function edgeAttributes(edge) {
  return `<attvalues><attvalue for="relation_kind" value="${escapeXml(edge.kind)}" /></attvalues>`;
}

async function writeGexf(graph, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const stream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  const generatedAt = graph.meta?.generatedAt ? String(graph.meta.generatedAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const description = graph.meta?.source?.description ?? graph.meta?.title ?? 'Mathematical dependency graph';

  await writeChunk(
    stream,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n` +
      `  <meta lastmodifieddate="${escapeXml(generatedAt)}">\n` +
      `    <creator>mathematics-map</creator>\n` +
      `    <description>${escapeXml(description)}</description>\n` +
      `  </meta>\n` +
      `  <graph defaultedgetype="directed" mode="static">\n` +
      `    <attributes class="node">\n` +
      `      <attribute id="kind" title="kind" type="string" />\n` +
      `      <attribute id="category" title="category" type="string" />\n` +
      `      <attribute id="module" title="module" type="string" />\n` +
      `      <attribute id="doc_link" title="doc_link" type="string" />\n` +
      `      <attribute id="out_degree" title="out_degree" type="integer" />\n` +
      `      <attribute id="in_degree" title="in_degree" type="integer" />\n` +
      `      <attribute id="degree" title="degree" type="integer" />\n` +
      `      <attribute id="x" title="x" type="float" />\n` +
      `      <attribute id="y" title="y" type="float" />\n` +
      `      <attribute id="z" title="z" type="float" />\n` +
      `    </attributes>\n` +
      `    <attributes class="edge">\n` +
      `      <attribute id="relation_kind" title="relation_kind" type="string" />\n` +
      `    </attributes>\n` +
      `    <nodes>\n`,
  );

  for (const node of graph.nodes) {
    await writeChunk(
      stream,
      `      <node id="${escapeXml(node.id)}" label="${escapeXml(node.name)}">${nodeAttributes(node)}</node>\n`,
    );
  }

  await writeChunk(stream, '    </nodes>\n    <edges>\n');

  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];

    await writeChunk(
      stream,
      `      <edge id="e${index}" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">${edgeAttributes(edge)}</edge>\n`,
    );
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
}

async function writeCsv(graph, outputPath) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const stream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  await writeChunk(
    stream,
    'source_id,source_name,source_kind,source_module,target_id,target_name,target_kind,target_module,relation_kind\n',
  );

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const row = [
      edge.source,
      source?.name,
      source?.kind,
      source?.module,
      edge.target,
      target?.name,
      target?.kind,
      target?.module,
      edge.kind,
    ];

    await writeChunk(stream, `${row.map(csvCell).join(',')}\n`);
  }

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
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const gexfPath = path.resolve(process.cwd(), options.gexf);
  const csvPath = path.resolve(process.cwd(), options.csv);
  const graph = JSON.parse(await fsp.readFile(inputPath, 'utf8'));

  await writeGexf(graph, gexfPath);
  await writeCsv(graph, csvPath);

  process.stdout.write(
    `Downloads written: ${path.relative(process.cwd(), gexfPath)} and ${path.relative(process.cwd(), csvPath)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
