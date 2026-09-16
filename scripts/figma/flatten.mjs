// Walks the two frame trees and prints a compact, readable dump of every node's
// geometry, fills/strokes (resolved to hex/rgba), corner radius, effects, layout
// (autolayout mode/padding/gap), and text style info. Used as an intermediate
// research artifact (not part of the final deliverables) to build figma-spec.md.
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('design/raw/nodes-full.json', 'utf8'));

function toHex(c) {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (c.a !== undefined && c.a < 1) {
    return `${hex} / rgba(${r}, ${g}, ${b}, ${c.a.toFixed(3)})`;
  }
  return hex;
}

function fillsStr(fills) {
  if (!fills || !fills.length) return '';
  return fills
    .filter((f) => f.visible !== false)
    .map((f) => {
      if (f.type === 'SOLID') return toHex(f.color) + (f.opacity !== undefined && f.opacity < 1 ? ` op${f.opacity}` : '');
      if (f.type === 'IMAGE') return `IMAGE(${f.imageRef})`;
      if (f.type.startsWith('GRADIENT')) return `${f.type}(${(f.gradientStops || []).map((s) => toHex(s.color)).join('->')})`;
      return f.type;
    })
    .join(', ');
}

function effectsStr(effects) {
  if (!effects || !effects.length) return '';
  return effects
    .filter((e) => e.visible !== false)
    .map((e) => `${e.type}(${e.color ? toHex(e.color) : ''} off=${e.offset ? `${e.offset.x},${e.offset.y}` : ''} r=${e.radius} spread=${e.spread || 0})`)
    .join('; ');
}

function radiusStr(node) {
  if (node.cornerRadius !== undefined) return String(node.cornerRadius);
  if (node.rectangleCornerRadii) return node.rectangleCornerRadii.join('/');
  return '';
}

function layoutStr(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return '';
  const parts = [node.layoutMode];
  if (node.itemSpacing !== undefined) parts.push(`gap=${node.itemSpacing}`);
  if (node.paddingLeft !== undefined) parts.push(`pad=${node.paddingTop}/${node.paddingRight}/${node.paddingBottom}/${node.paddingLeft}`);
  if (node.primaryAxisAlignItems) parts.push(`primary=${node.primaryAxisAlignItems}`);
  if (node.counterAxisAlignItems) parts.push(`counter=${node.counterAxisAlignItems}`);
  return parts.join(' ');
}

function walk(node, depth, out, parentAbs) {
  const bb = node.absoluteBoundingBox;
  const rel = bb && parentAbs ? ` rel=[${Math.round(bb.x - parentAbs.x)},${Math.round(bb.y - parentAbs.y)}]` : '';
  const line = [
    '  '.repeat(depth) + node.type,
    JSON.stringify(node.name),
    'id=' + node.id,
    bb ? `abs=[${Math.round(bb.x)},${Math.round(bb.y)} ${Math.round(bb.width)}x${Math.round(bb.height)}]${rel}` : '',
    node.fills ? 'fill=' + fillsStr(node.fills) : '',
    node.strokes && node.strokes.length ? `stroke=${fillsStr(node.strokes)} w=${node.strokeWeight}` : '',
    radiusStr(node) ? 'radius=' + radiusStr(node) : '',
    node.effects && node.effects.length ? 'fx=' + effectsStr(node.effects) : '',
    layoutStr(node) ? 'layout=' + layoutStr(node) : '',
  ]
    .filter(Boolean)
    .join(' ');
  out.push(line);
  if (node.type === 'TEXT') {
    out.push(
      '  '.repeat(depth + 1) +
        `TEXT-STYLE font=${node.style.fontFamily} weight=${node.style.fontWeight} size=${node.style.fontSize} lh=${node.style.lineHeightPx?.toFixed(2)}px(${node.style.lineHeightPercent}%) ls=${node.style.letterSpacing} align=${node.style.textAlignHorizontal} case=${node.style.textCase || 'ORIGINAL'}`
    );
    out.push('  '.repeat(depth + 1) + `TEXT-CONTENT: ${JSON.stringify(node.characters)}`);
  }
  if (node.children) {
    for (const c of node.children) walk(c, depth + 1, out, bb);
  }
}

const out1 = [];
walk(j.nodes['1:1481'].document, 0, out1, null);
fs.writeFileSync('design/raw/flat-default.txt', out1.join('\n'));

const out2 = [];
walk(j.nodes['1:762'].document, 0, out2, null);
fs.writeFileSync('design/raw/flat-expanded.txt', out2.join('\n'));

console.log('default lines:', out1.length, 'expanded lines:', out2.length);
