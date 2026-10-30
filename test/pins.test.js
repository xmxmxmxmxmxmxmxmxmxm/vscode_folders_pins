'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PinStore, sortEntries } = require('../src/pins');

function createStore(initial = []) {
  let value = initial;
  return new PinStore({
    get: () => value,
    update: async (_key, next) => { value = next; }
  });
}

test('adds folders in order without duplicates', async () => {
  const store = createStore();
  await store.add(['file:///a', 'file:///b', 'file:///a']);
  await store.add(['file:///b', 'file:///c']);
  assert.deepEqual(store.getAll(), ['file:///a', 'file:///b', 'file:///c']);
});

test('removes only the requested folder', async () => {
  const store = createStore(['file:///a', 'file:///b']);
  await store.remove('file:///a');
  assert.deepEqual(store.getAll(), ['file:///b']);
});

test('clears saved pins', async () => {
  const store = createStore(['file:///a']);
  await store.clear();
  assert.deepEqual(store.getAll(), []);
});

test('serializes concurrent updates without losing pins', async () => {
  const store = createStore();
  await Promise.all([store.add(['file:///a']), store.add(['file:///b'])]);
  assert.deepEqual(store.getAll(), ['file:///a', 'file:///b']);
});

test('ignores malformed saved values and deduplicates them', () => {
  assert.deepEqual(createStore(null).getAll(), []);
  assert.deepEqual(createStore(['file:///a', null, 42, 'file:///a']).getAll(), ['file:///a']);
});

test('puts directories first and sorts names naturally without mutating input', () => {
  const entries = [['file10', 1], ['z-dir', 2], ['file2', 1], ['a-dir', 2]];
  assert.deepEqual(sortEntries(entries, 2), [['a-dir', 2], ['z-dir', 2], ['file2', 1], ['file10', 1]]);
  assert.equal(entries[0][0], 'file10');
});
