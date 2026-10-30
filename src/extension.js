'use strict';

const vscode = require('vscode');
const path = require('node:path');
const { PinStore, sortEntries } = require('./pins');

class PinnedFoldersProvider {
  constructor(store) {
    this.store = store;
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
  }

  refresh() {
    this.changed.fire();
  }

  getParent(element) {
    return element.parent;
  }

  getTreeItem(element) {
    const { uri, directory, pinned } = element;
    const label = path.posix.basename(uri.path) || uri.authority || uri.path;
    const item = new vscode.TreeItem(
      label,
      directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    item.resourceUri = uri;
    item.id = `${element.root}:${uri.toString()}`;
    item.contextValue = pinned ? 'pinnedFolder' : directory ? 'folder' : 'file';
    item.iconPath = directory ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
    item.tooltip = uri.scheme === 'file' ? uri.fsPath : uri.toString();
    if (pinned) {
      item.description = vscode.workspace.asRelativePath(uri, true);
    }
    if (!directory) {
      item.command = { command: 'vscode.open', title: 'Открыть файл', arguments: [uri] };
    }
    return item;
  }

  async getChildren(element) {
    if (!element) {
      return this.store.getAll().map(value => ({
        uri: vscode.Uri.parse(value), directory: true, pinned: true, root: value
      }));
    }
    try {
      const entries = await vscode.workspace.fs.readDirectory(element.uri);
      return await Promise.all(sortEntries(entries, vscode.FileType.Directory).map(async ([name, type]) => {
        const uri = vscode.Uri.joinPath(element.uri, name);
        if (type & vscode.FileType.SymbolicLink) {
          try {
            type = (await vscode.workspace.fs.stat(uri)).type;
          } catch {
            // Broken links remain visible as files.
          }
        }
        return {
          uri,
          directory: Boolean(type & vscode.FileType.Directory),
          pinned: false,
          root: element.root,
          parent: element
        };
      }));
    } catch (error) {
      void vscode.window.showWarningMessage(`Не удалось открыть папку «${element.uri.fsPath}»: ${error.message}`);
      return [];
    }
  }

  dispose() {
    this.changed.dispose();
  }
}

function activate(context) {
  const store = new PinStore(context.workspaceState);
  const provider = new PinnedFoldersProvider(store);
  const view = vscode.window.createTreeView('folderPins.folders', {
    treeDataProvider: provider,
    showCollapseAll: true,
    canSelectMany: true
  });

  const register = (name, handler) => context.subscriptions.push(
    vscode.commands.registerCommand(name, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        void vscode.window.showErrorMessage(`Folder Pins: ${error.message}`);
      }
    })
  );

  register('folderPins.pin', async (target, selected) => {
    let uris;
    if (target) {
      const targets = Array.isArray(selected) && selected.length ? selected : [target];
      uris = targets.map(value => value.uri || value);
    } else {
      uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: 'Закрепить папку',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
      });
    }
    if (!uris?.length) return;
    const folders = [];
    for (const uri of uris) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) folders.push(uri.toString());
    }
    if (!folders.length) return;
    await store.add(folders);
    provider.refresh();
    await view.reveal({ uri: vscode.Uri.parse(folders[0]), directory: true, pinned: true, root: folders[0] }, { focus: false });
  });

  register('folderPins.unpin', async (target, selected) => {
    const targets = Array.isArray(selected) && selected.length ? selected : [target];
    for (const item of targets) {
      if (item?.pinned) await store.remove(item.uri.toString());
    }
    provider.refresh();
  });

  register('folderPins.clear', async () => {
    if (!store.getAll().length) return;
    const answer = await vscode.window.showWarningMessage(
      'Открепить все папки? Сами папки и файлы останутся на месте.',
      { modal: true },
      'Открепить все'
    );
    if (answer !== 'Открепить все') return;
    await store.clear();
    provider.refresh();
  });

  register('folderPins.refresh', () => provider.refresh());
  register('folderPins.reveal', item => item && vscode.commands.executeCommand('revealInExplorer', item.uri));

  let refreshTimer;
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => provider.refresh(), 250);
  };
  context.subscriptions.push(
    provider,
    view,
    watcher,
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    { dispose: () => clearTimeout(refreshTimer) }
  );
}

module.exports = { activate };
