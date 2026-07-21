import * as vscode from "vscode";
import { IgnoreRules, type ProjectContextPort } from "@auto-complete/core-ts";

/**
 * Supplies workspace .gitignore patterns and open-editor snippets to the TS engine.
 * gitignore is cached async; recent snippets are read synchronously from open documents.
 */
export class VsCodeProjectContext implements ProjectContextPort {
  private readonly gitignoreByRoot = new Map<string, string[]>();

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
    const root = projectKey ? normalizeKey(projectKey) : "";
    const docs = vscode.workspace.textDocuments.filter((d) => {
      if (d.isClosed) return false;
      if (d.uri.scheme !== "file" && d.uri.scheme !== "untitled") return false;
      if (!root) return true;
      const fp = d.uri.scheme === "file" ? normalizeKey(d.uri.fsPath) : "";
      return !fp || fp.startsWith(root + "/") || fp === root || fp.startsWith(root + "\\");
    });
    // Prefer visible editors order, then remaining open docs
    const visible = vscode.window.visibleTextEditors.map((e) => e.document);
    const ordered: vscode.TextDocument[] = [];
    const seen = new Set<string>();
    for (const d of [...visible, ...docs]) {
      const id = d.uri.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(d);
    }
    const snippets: string[] = [];
    for (const d of ordered) {
      if (snippets.length >= limit) break;
      const pathLabel = d.uri.scheme === "file" ? d.uri.fsPath : d.fileName;
      const clipped = d.getText().slice(0, maxChars);
      if (!clipped.trim()) continue;
      snippets.push(`File: ${pathLabel}\n${clipped}`);
    }
    return snippets;
  }

  /** Load/reload `.gitignore` for all workspace folders. */
  async refreshGitignore(): Promise<void> {
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

function normalizeKey(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}
