'use strict';

const STORAGE_KEY = 'folderPins.folders';

class PinStore {
  constructor(state) {
    this.state = state;
    this.pending = Promise.resolve();
  }

  getAll() {
    const stored = this.state.get(STORAGE_KEY, []);
    return Array.isArray(stored)
      ? [...new Set(stored.filter(value => typeof value === 'string'))]
      : [];
  }

  update(transform) {
    const operation = this.pending.then(() =>
      this.state.update(STORAGE_KEY, transform(this.getAll()))
    );
    this.pending = operation.catch(() => {});
    return operation;
  }

  add(uris) {
    return this.update(current => [...new Set([...current, ...uris])]);
  }

  remove(uri) {
    return this.update(current => current.filter(value => value !== uri));
  }

  clear() {
    return this.update(() => []);
  }
}

function sortEntries(entries, directoryFlag) {
  return [...entries].sort(([nameA, typeA], [nameB, typeB]) => {
    const directoryA = Boolean(typeA & directoryFlag);
    const directoryB = Boolean(typeB & directoryFlag);
    return Number(directoryB) - Number(directoryA) ||
      nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

module.exports = { PinStore, sortEntries };
