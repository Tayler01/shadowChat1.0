const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/NativeLaunchLoader.tsx'), 'utf8');
const moduleStub = { exports: {} };
const imports = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-native': { Image: 'Image', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
  '../../assets/images/shado-round-mark.png': 'approved-bundled-mark',
};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: moduleStub, exports: moduleStub.exports, require: name => {
  assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
  return imports[name];
} });
const { NativeLaunchLoader } = moduleStub.exports;
function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props.children].flat(Infinity).flatMap(elements)];
}
const bar = tree => elements(tree).find(node => node.props.accessibilityRole === 'progressbar');

test('community preparation never invents a percentage and retains approved bundled branding', () => {
  for (const progress of [undefined, NaN, Infinity]) {
    const tree = NativeLaunchLoader({ stage: 'Preparing your community…', progress });
    assert.equal(bar(tree).props.accessibilityValue.now, undefined);
    assert.equal(bar(tree).props.accessibilityValue.text, 'Preparing');
    assert.equal(elements(tree).find(node => node.type === 'Image').props.source, 'approved-bundled-mark');
    assert.ok(elements(tree).some(node => node.type === 'Text' && node.props.children[0] === 'Preparing your community…'));
  }
});

test('only measured page loading supplies accessible percentage with bounded native values', () => {
  for (const [progress, expected] of [[0, 0], [0.427, 43], [1, 100], [-0.1, 0], [1.2, 100]]) {
    const tree = NativeLaunchLoader({ stage: 'Loading community page', progress });
    assert.equal(bar(tree).props.accessibilityValue.now, expected);
    assert.equal(bar(tree).props.accessibilityValue.text, `${expected}% of community page loaded`);
    assert.ok(elements(tree).some(node => node.type === 'Text' && node.props.children[1] === ` · ${expected}%`));
  }
});
