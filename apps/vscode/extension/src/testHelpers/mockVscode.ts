import type * as vscode from "vscode";
import { setVscodeForTest } from "../vscodeApi";

export interface MockConfigUpdate {
  section: string;
  key: string;
  value: unknown;
  target: number;
}

export interface MockWebviewPanelHandle {
  panel: vscode.WebviewPanel;
  postedMessages: unknown[];
  revealedColumns: number[];
  disposed: boolean;
  emitMessage: (msg: unknown) => Promise<void>;
  triggerDispose: () => void;
  setPostMessageError: (err: Error | null) => void;
}

export interface MockVscodeEnv {
  vscode: typeof vscode;
  context: vscode.ExtensionContext;
  globalStateMap: Map<string, unknown>;
  secretsMap: Map<string, string>;
  configDefaults: Map<string, Record<string, unknown>>;
  configGlobalValues: Map<string, Record<string, unknown>>;
  configUpdates: MockConfigUpdate[];
  clipboardWrites: string[];
  openedExternalUrls: string[];
  executedCommands: Array<{ command: string; args: unknown[] }>;
  createdPanels: MockWebviewPanelHandle[];
  setColorThemeKind: (kind: number) => void;
  fireConfigurationChange: (affectedKeys: string[]) => void;
  setVisibleTextEditors: (editors: Array<{ document: vscode.TextDocument }>) => void;
  setTextDocuments: (docs: vscode.TextDocument[]) => void;
  setActiveTextEditor: (editor: { document: vscode.TextDocument } | undefined) => void;
  setWorkspaceFolders: (folders: Array<{ uri: vscode.Uri; name: string; index: number }>) => void;
  install: () => void;
  restore: () => void;
}

class MockDisposable {
  constructor(private readonly onDispose: () => void = () => {}) {}
  dispose(): void {
    this.onDispose();
  }
}

class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

class MockRange {
  constructor(
    public readonly start: MockPosition,
    public readonly end: MockPosition,
  ) {}
}

class MockInlineCompletionItem {
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(
    public readonly insertText: string,
    public readonly range?: MockRange,
  ) {}
}

class MockInlineCompletionList {
  constructor(public readonly items: MockInlineCompletionItem[]) {}
}

export function makeMockUri(fsPathOrStr: string, scheme = "file"): vscode.Uri {
  const normalized = fsPathOrStr.replace(/\\/g, "/");
  return {
    scheme,
    authority: "",
    path: normalized,
    query: "",
    fragment: "",
    fsPath: fsPathOrStr,
    with: () => makeMockUri(fsPathOrStr, scheme),
    toString: () => `${scheme}://${normalized}`,
    toJSON: () => ({ scheme, path: normalized }),
  } as unknown as vscode.Uri;
}

export function makeMockDocument(opts: {
  path: string;
  text: string;
  languageId?: string;
  scheme?: string;
  isClosed?: boolean;
}): vscode.TextDocument {
  const scheme = opts.scheme ?? "file";
  const uri = makeMockUri(opts.path, scheme);
  return {
    uri,
    fileName: opts.path,
    languageId: opts.languageId ?? "typescript",
    isClosed: opts.isClosed ?? false,
    getText: () => opts.text,
    offsetAt: (pos: { line: number; character: number }) => {
      const lines = opts.text.split("\n");
      let off = 0;
      for (let i = 0; i < pos.line && i < lines.length; i++) {
        off += lines[i]!.length + 1;
      }
      return Math.min(opts.text.length, off + pos.character);
    },
  } as unknown as vscode.TextDocument;
}

export function createMockVscodeEnv(opts?: {
  extensionPath?: string;
  language?: string;
  themeKind?: number;
  initialAutoCompleteDefaults?: Record<string, unknown>;
  initialAutoCompleteGlobal?: Record<string, unknown>;
  initialHttpGlobal?: Record<string, unknown>;
}): MockVscodeEnv {
  const globalStateMap = new Map<string, unknown>();
  const secretsMap = new Map<string, string>();
  const configDefaults = new Map<string, Record<string, unknown>>([
    [
      "autoComplete",
      {
        enabled: true,
        autoTrigger: true,
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen2.5-coder:7b",
        promptTemplate: "AUTO",
        timeoutMs: 3000,
        settingsTimeoutMs: 15000,
        maxTokens: 128,
        temperature: 0,
        stream: false,
        maxPrefixChars: 8000,
        maxSuffixChars: 2000,
        debounceMinMs: 150,
        debounceInitialMs: 300,
        debounceMaxMs: 1000,
        enableInComments: true,
        enableInStrings: true,
        firstLineOnlyWhenMidLine: true,
        sendFilePath: true,
        maxFileSizeKb: 512,
        logLevel: "info",
        logPromptBodies: false,
        showStatusBar: true,
        uiTheme: "auto",
        uiLocale: "auto",
        respectGitignore: true,
        enableRecentFileContext: false,
        notifyOnFatalError: true,
        showCostApprox: false,
        fimPath: "",
        chatPath: "/chat/completions",
        completionsPath: "",
        ...(opts?.initialAutoCompleteDefaults ?? {}),
      },
    ],
    [
      "http",
      {
        proxy: "",
        proxyStrictSSL: true,
        proxySupport: "override",
        proxyAuthorization: null,
      },
    ],
  ]);

  const configGlobalValues = new Map<string, Record<string, unknown>>([
    ["autoComplete", { ...(opts?.initialAutoCompleteGlobal ?? {}) }],
    ["http", { ...(opts?.initialHttpGlobal ?? {}) }],
  ]);

  const configUpdates: MockConfigUpdate[] = [];
  const clipboardWrites: string[] = [];
  const openedExternalUrls: string[] = [];
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];
  const createdPanels: MockWebviewPanelHandle[] = [];

  const themeListeners = new Set<(e: { kind: number }) => void>();
  const configListeners = new Set<(e: vscode.ConfigurationChangeEvent) => void>();

  let currentThemeKind = opts?.themeKind ?? 2; // Dark
  let visibleTextEditors: Array<{ document: vscode.TextDocument }> = [];
  let textDocuments: vscode.TextDocument[] = [];
  let activeTextEditor: { document: vscode.TextDocument } | undefined;
  let workspaceFolders: Array<{ uri: vscode.Uri; name: string; index: number }> = [];

  const fireConfigurationChange = (affectedKeys: string[]) => {
    const event: vscode.ConfigurationChangeEvent = {
      affectsConfiguration(section: string) {
        return affectedKeys.some(
          (k) => k === section || k.startsWith(`${section}.`) || section.startsWith(`${k}.`),
        );
      },
    };
    for (const l of themeListeners) void l;
    for (const l of configListeners) l(event);
  };

  const mockVscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    InlineCompletionTriggerKind: { Invoke: 0, Automatic: 1 },
    Disposable: MockDisposable,
    Position: MockPosition,
    Range: MockRange,
    InlineCompletionItem: MockInlineCompletionItem,
    InlineCompletionList: MockInlineCompletionList,
    Uri: {
      file: (p: string) => makeMockUri(p, "file"),
      parse: (s: string) => {
        const idx = s.indexOf("://");
        return makeMockUri(idx >= 0 ? s.slice(idx + 3) : s, idx >= 0 ? s.slice(0, idx) : "https");
      },
      joinPath: (base: vscode.Uri, ...parts: string[]) =>
        makeMockUri([base.fsPath.replace(/\/+$/, ""), ...parts].join("/"), base.scheme),
    },
    env: {
      language: opts?.language ?? "en",
      clipboard: {
        writeText: async (text: string) => {
          clipboardWrites.push(text);
        },
      },
      openExternal: async (uri: vscode.Uri) => {
        openedExternalUrls.push(uri.toString());
        return true;
      },
    },
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        executedCommands.push({ command, args });
      },
    },
    workspace: {
      get textDocuments() {
        return textDocuments;
      },
      get workspaceFolders() {
        return workspaceFolders;
      },
      getWorkspaceFolder: (uri: vscode.Uri) => {
        const p = uri.fsPath.replace(/\\/g, "/");
        return workspaceFolders.find((f) => {
          const root = f.uri.fsPath.replace(/\\/g, "/").replace(/\/+$/, "");
          return p === root || p.startsWith(root + "/");
        });
      },
      onDidChangeConfiguration: (listener: (e: vscode.ConfigurationChangeEvent) => void) => {
        configListeners.add(listener);
        return new MockDisposable(() => configListeners.delete(listener));
      },
      getConfiguration: (section = "") => {
        const defs = configDefaults.get(section) ?? {};
        const globals = configGlobalValues.get(section) ?? {};
        return {
          get<T>(key: string, defaultValue?: T): T {
            if (key in globals && globals[key] !== undefined) return globals[key] as T;
            if (key in defs) return defs[key] as T;
            return defaultValue as T;
          },
          inspect<T>(key: string) {
            return {
              key: section ? `${section}.${key}` : key,
              defaultValue: defs[key] as T | undefined,
              globalValue: globals[key] as T | undefined,
              workspaceValue: undefined,
              workspaceFolderValue: undefined,
            };
          },
          async update(key: string, value: unknown, target = 1) {
            configUpdates.push({ section, key, value, target });
            if (!configGlobalValues.has(section)) configGlobalValues.set(section, {});
            const store = configGlobalValues.get(section)!;
            if (value === undefined) {
              delete store[key];
            } else {
              store[key] = value;
            }
            const fullKey = section ? `${section}.${key}` : key;
            fireConfigurationChange([fullKey]);
          },
        };
      },
      fs: {
        readFile: async () => {
          throw new Error("ENOENT");
        },
      },
    },
    window: {
      get activeColorTheme() {
        return { kind: currentThemeKind };
      },
      get visibleTextEditors() {
        return visibleTextEditors;
      },
      get activeTextEditor() {
        return activeTextEditor;
      },
      onDidChangeActiveColorTheme: (listener: (e: { kind: number }) => void) => {
        themeListeners.add(listener);
        return new MockDisposable(() => themeListeners.delete(listener));
      },
      createWebviewPanel: (
        _viewType: string,
        _title: string,
        _showOptions: number,
        _options?: unknown,
      ) => {
        const postedMessages: unknown[] = [];
        const revealedColumns: number[] = [];
        const messageListeners: Array<(msg: unknown) => unknown> = [];
        const disposeListeners: Array<() => void> = [];
        let postErr: Error | null = null;
        const handle: MockWebviewPanelHandle = {
          panel: undefined as unknown as vscode.WebviewPanel,
          postedMessages,
          revealedColumns,
          disposed: false,
          async emitMessage(msg: unknown) {
            for (const l of [...messageListeners]) {
              await l(msg);
            }
          },
          triggerDispose() {
            if (handle.disposed) return;
            handle.disposed = true;
            for (const l of [...disposeListeners]) l();
          },
          setPostMessageError(err: Error | null) {
            postErr = err;
          },
        };

        const panel = {
          webview: {
            cspSource: "vscode-webview://mock-origin",
            html: "",
            asWebviewUri: (uri: vscode.Uri) =>
              `https://file+.vscode-resource.vscode-cdn.net${uri.path}`,
            postMessage: async (msg: unknown) => {
              if (postErr) throw postErr;
              postedMessages.push(msg);
              return true;
            },
            onDidReceiveMessage: (
              cb: (msg: unknown) => unknown,
              _thisArg?: unknown,
              disposables?: vscode.Disposable[],
            ) => {
              messageListeners.push(cb);
              const d = new MockDisposable(() => {
                const idx = messageListeners.indexOf(cb);
                if (idx >= 0) messageListeners.splice(idx, 1);
              });
              disposables?.push(d);
              return d;
            },
          },
          reveal: (col?: number) => {
            revealedColumns.push(col ?? -1);
          },
          onDidDispose: (
            cb: () => void,
            _thisArg?: unknown,
            disposables?: vscode.Disposable[],
          ) => {
            disposeListeners.push(cb);
            const d = new MockDisposable(() => {
              const idx = disposeListeners.indexOf(cb);
              if (idx >= 0) disposeListeners.splice(idx, 1);
            });
            disposables?.push(d);
            return d;
          },
          dispose: () => {
            handle.triggerDispose();
          },
        } as unknown as vscode.WebviewPanel;

        handle.panel = panel;
        createdPanels.push(handle);
        return panel;
      },
    },
  } as unknown as typeof vscode;

  const context = {
    extensionPath: opts?.extensionPath ?? "/tmp/mock-ext-nonexistent",
    subscriptions: [],
    globalState: {
      get<T>(key: string, defaultValue?: T): T {
        return (globalStateMap.has(key) ? globalStateMap.get(key) : defaultValue) as T;
      },
      async update(key: string, value: unknown) {
        if (value === undefined) globalStateMap.delete(key);
        else globalStateMap.set(key, value);
      },
      keys: () => [...globalStateMap.keys()],
      setKeysForSync: () => {},
    },
    secrets: {
      async get(key: string) {
        return secretsMap.get(key);
      },
      async store(key: string, value: string) {
        secretsMap.set(key, value);
      },
      async delete(key: string) {
        secretsMap.delete(key);
      },
      onDidChange: () => new MockDisposable(),
    },
  } as unknown as vscode.ExtensionContext;

  return {
    vscode: mockVscode,
    context,
    globalStateMap,
    secretsMap,
    configDefaults,
    configGlobalValues,
    configUpdates,
    clipboardWrites,
    openedExternalUrls,
    executedCommands,
    createdPanels,
    setColorThemeKind(kind: number) {
      currentThemeKind = kind;
      for (const l of themeListeners) l({ kind });
    },
    fireConfigurationChange,
    setVisibleTextEditors(editors) {
      visibleTextEditors = editors;
    },
    setTextDocuments(docs) {
      textDocuments = docs;
    },
    setActiveTextEditor(editor) {
      activeTextEditor = editor;
    },
    setWorkspaceFolders(folders) {
      workspaceFolders = folders;
    },
    install() {
      setVscodeForTest(mockVscode);
    },
    restore() {
      setVscodeForTest(undefined);
    },
  };
}
