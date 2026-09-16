// Fetch top-level file structure (depth=2) to locate the two Dashboard frames.
const FILE_KEY = 'nvpGmK1je0QsesXtZcBdjg';
const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN not set');
  process.exit(1);
}

const url = `https://api.figma.com/v1/files/${FILE_KEY}?depth=2`;
const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
if (!res.ok) {
  console.error('Fetch failed', res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
const fs = await import('node:fs/promises');
await fs.writeFile('design/raw/file-depth2.json', JSON.stringify(json, null, 2));
console.log('Saved design/raw/file-depth2.json');

// Print a compact tree of pages/frames for locating IDs
function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${node.type} "${node.name}" id=${node.id}${node.absoluteBoundingBox ? ` size=${node.absoluteBoundingBox.width}x${node.absoluteBoundingBox.height}` : ''}`);
  if (node.children) {
    for (const child of node.children) walk(child, depth + 1);
  }
}
walk(json.document);
