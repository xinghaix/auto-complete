import type * as vscode from "vscode";
import {
  DEFAULT_GLOBS,
  IgnoreRules,
  type EngineSettings,
  type ProjectContextPort,
} from "@auto-complete/core-ts";
import { getVscode } from "../vscodeApi";

export type RecentContextSettings = Pick<
  EngineSettings,
  "ignoreGlobs" | "respectGitignore" | "maxFileSizeKb" | "sendFilePath"
>;

const DEFAULT_RECENT_SETTINGS: RecentContextSettings = {
  ignoreGlobs: DEFAULT_GLOBS,
  respectGitignore: true,
  maxFileSizeKb: 512,
  sendFilePath: true,
};

/**
 * Supplies workspace .gitignore patterns and open-editor snippets to the TS engine.
 * Enforces workspace boundaries, IgnoreRules (.gitignore + ignoreGlobs), maxFileSizeKb,
 * current-document exclusion, and `sendFilePath === false` redaction uniformly across
 * both `visibleTextEditors` and `workspace.textDocuments`.
 */
export class VsCodeProjectContext implements ProjectContextPort {
  private readonly gitignoreByRoot = new Map<string, string[]>();
  private currentDocumentUri: string | undefined;

  constructor(private readonly getSettings?: () => RecentContextSettings) {}

  setCurrentDocumentUri(uri: string | undefined): void {
    this.currentDocumentUri = uri;
  }

  /** Test helper / manual override for cached workspace gitignore patterns. */
  setGitignorePatterns(projectKey: string, patterns: string[]): void {
    if (!projectKey) return;
    this.gitignoreByRoot.set(normalizeKey(projectKey), [...patterns]);
  }

  gitignorePatterns(projectKey: string): string[] {
    if (!projectKey) return [];
    return this.gitignoreByRoot.get(normalizeKey(projectKey)) ?? [];
  }

  recentSnippets(
    projectKey: string,
    enabled: boolean,
    limit: number,
    maxChars: number,
  ): string[] {
    if (!enabled || limit <= 0 || maxChars <= 0) return [];
    const vscode = getVscode();
    const settings = this.getSettings?.() ?? DEFAULT_RECENT_SETTINGS;
    const root = projectKey ? normalizeKey(projectKey) : "";
    const maxBytes = Math.max(1, settings.maxFileSizeKb) * 1024;
    const ignore = new IgnoreRules(
      settings.ignoreGlobs ?? [],
      settings.respectGitignore,
      this.gitignorePatterns(projectKey),
    );

    const excludedUris = new Set<string>();
    if (this.currentDocumentUri) excludedUris.add(this.currentDocumentUri);
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc) excludedUris.add(activeDoc.uri.toString());

    // Prefer visible editors order, then remaining open docs — applying the SAME
    // scheme/workspace/ignore/size/current-file filters to every candidate.
    const visible = (vscode.window.visibleTextEditors ?? []).map((e) => e.document);
    const openDocs = vscode.workspace.textDocuments ?? [];
    const seen = new Set<string>();
    const snippets: string[] = [];

    for (const d of [...visible, ...openDocs]) {
      if (snippets.length >= limit) break;
      if (!d || d.isClosed) continue;

      const id = d.uri.toString();
      if (seen.has(id)) continue;
      seen.add(id);

      if (excludedUris.has(id)) continue;
      if (d.uri.scheme !== "file" && d.uri.scheme !== "untitled") continue;

      let docPath: string;
      let relPath: string | null = null;
      if (d.uri.scheme === "file") {
        docPath = normalizeKey(d.uri.fsPath);
        if (root) {
          if (docPath !== root && !docPath.startsWith(root + "/")) {
            continue;
          }
          relPath = docPath.startsWith(root + "/") ? docPath.slice(root.length + 1) : null;
        }
      } else {
        // When scoped to a workspace, skip untitled scratchpads to avoid leaking unrelated notes.
        if (root) continue;
        docPath = d.fileName;
      }

      if (ignore.isIgnored(docPath, relPath)) continue;

      const text = d.getText();
      if (text.length > maxBytes || Buffer.byteLength(text, "utf8") > maxBytes) {
        continue;
      }
      const clipped = text.slice(0, maxChars);
      if (!clipped.trim()) continue;

      if (settings.sendFilePath === false) {
        snippets.push(clipped);
      } else {
        const pathLabel = relPath ?? docPath;
        snippets.push(`File: ${pathLabel}\n${clipped}`);
      }
    }

    return snippets;
  }

  /** Load/reload `.gitignore` for all workspace folders. */
  async refreshGitignore(): Promise<void> {
    const vscode = getVscode();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const next = new Map<string, string[]>();
    for (const folder of folders) {
      const key = normalizeKey(folder.uri.fsPath);
      const gi = vscode.Uri.joinPath(folder.uri, ".gitignore");
      try {
        const data = await vscode.workspace.fs.readFile(gi);
        const text = Buffer.from(data).toString("utf8");
        next.set(key, IgnoreRules.parseGitignore(text));
      } catch {
        next.set(key, []);
      }
    }
    this.gitignoreByRoot.clear();
    for (const [k, v] of next) this.gitignoreByRoot.set(k, v);
  }
}

export function normalizeKey(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}
