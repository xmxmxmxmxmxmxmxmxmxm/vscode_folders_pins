'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createProvider() {
  const source = fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8');
  const sandbox = {
    module: { exports: {} },
    require: name => name === 'vscode' ? {
      EventEmitter: class { event = () => {}; },
      FileType: { Directory: 2, SymbolicLink: 64 },
      Uri: {
        parse: value => ({ path: value, toString: () => value }),
        joinPath: (uri, name) => ({ path: `${uri.path}/${name}` })
      },
      workspace: { fs: { readDirectory: async () => [['child', 2]] } }
    } : name === './pins' ? require('../src/pins') : require(name)
  };
  vm.runInNewContext(`${source}\nmodule.exports.Provider = PinnedFoldersProvider;`, sandbox);
  return new sandbox.module.exports.Provider({ getAll: () => ['file:///project'] });
}

test('pinned roots have no parent, as required by TreeView.reveal', async () => {
  const provider = createProvider();
  const [root] = await provider.getChildren();
  assert.equal(provider.getParent(root), undefined);
});

test('nested entries return their actual parent for TreeView.reveal', async () => {
  const provider = createProvider();
  const [root] = await provider.getChildren();
  const [child] = await provider.getChildren(root);
  const [grandchild] = await provider.getChildren(child);
  assert.equal(provider.getParent(child), root);
  assert.equal(provider.getParent(grandchild), child);
});
