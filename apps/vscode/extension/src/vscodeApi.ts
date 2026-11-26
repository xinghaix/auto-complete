import type * as vscode from "vscode";

let vscodeOverride: typeof vscode | undefined;

/**
 * Returns the VS Code host module at runtime, or an injected test double in unit tests.
 * Keeps `vscode` external when bundled to CJS by esbuild while allowing pure Node unit tests.
 */
export function getVscode(): typeof vscode {
  if (vscodeOverride) return vscodeOverride;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("vscode") as typeof vscode;
}

/** Test-only hook to inject a mock VS Code API surface. */
export function setVscodeForTest(mock: typeof vscode | undefined): void {
  vscodeOverride = mock;
}
