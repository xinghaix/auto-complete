import type * as vscode from "vscode";
import {
  CompletionEngine,
  IgnoreRules,
  inspectContext,
  isEnabledNow,
  normalizeLanguage,
  type CompletionOutcome,
  type EngineSettings,
} from "@auto-complete/core-ts";
import { normalizeKey, type VsCodeProjectContext } from "../project/context";
import { getVscode } from "../vscodeApi";

export const INTERNAL_ACCEPTED_COMMAND = "autoComplete.internal.accepted";

export type InlineActivityEvent =
  | { kind: "start" }
  | { kind: "done"; outcome: CompletionOutcome }
  | { kind: "skipped"; reason: string; manual: boolean };

function isLanguageDisabled(disabled: Set<string> | string[], language: string): boolean {
  const lower = language.toLowerCase();
  if (disabled instanceof Set) {
    if (disabled.has(lower)) return true;
    for (const item of disabled) {
      if (item.toLowerCase() === lower) return true;
    }
    return false;
  }
  return disabled.some((item) => item.toLowerCase() === lower);
}

export class AutoCompleteInlineProvider implements vscode.InlineCompletionItemProvider {
  private forceRefreshUntil = 0;

  constructor(
    private engine: CompletionEngine,
    private getSettings: () => EngineSettings,
    private projectContext?: VsCodeProjectContext,
    private onActivity?: (event: InlineActivityEvent) => void,
  ) {}

  /** Marks the next completion trigger (within 3s) as a cache-bypassing manual refresh. */
  requestForceRefresh(ttlMs = 3000): void {
    this.forceRefreshUntil = Date.now() + Math.max(100, ttlMs);
  }

  private consumeForceRefresh(): boolean {
    if (this.forceRefreshUntil <= 0) return false;
    const active = Date.now() <= this.forceRefreshUntil;
    this.forceRefreshUntil = 0;
    return active;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | undefined> {
    if (token.isCancellationRequested) return undefined;
    if (document.uri.scheme !== "file" && document.uri.scheme !== "untitled") {
      return undefined;
    }

    const vscode = getVscode();
    const s = this.getSettings();
    const forceRefresh = this.consumeForceRefresh();
    const trigger: "MANUAL" | "AUTO" =
      forceRefresh || context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke
        ? "MANUAL"
        : "AUTO";

    // Cheap pre-gating BEFORE reading full text, running inspectContext, or allocating a generation.
    if (!isEnabledNow(s)) {
      this.onActivity?.({ kind: "skipped", reason: "disabled", manual: trigger === "MANUAL" });
      return undefined;
    }
    if (trigger === "AUTO" && !s.autoTrigger) {
      return undefined;
    }

    const language = normalizeLanguage(document.languageId, document.fileName);
    if (isLanguageDisabled(s.disabledLanguages, language)) {
      this.onActivity?.({
        kind: "skipped",
        reason: `language "${language}" is disabled`,
        manual: trigger === "MANUAL",
      });
      return undefined;
    }

    const docPath = document.uri.fsPath || document.fileName;
    const projectKey =
      vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      "";
    const normalizedRoot = projectKey ? normalizeKey(projectKey) : "";
    const normalizedDocPath = document.uri.scheme === "file" ? normalizeKey(docPath) : docPath;
    const relPath =
      normalizedRoot &&
      document.uri.scheme === "file" &&
      normalizedDocPath.startsWith(normalizedRoot + "/")
        ? normalizedDocPath.slice(normalizedRoot.length + 1)
        : null;

    if (docPath) {
      const ignore = new IgnoreRules(
        s.ignoreGlobs ?? [],
        s.respectGitignore,
        this.projectContext?.gitignorePatterns(projectKey) ?? [],
      );
      if (ignore.isIgnored(normalizedDocPath, relPath)) {
        this.onActivity?.({
          kind: "skipped",
          reason: "ignored file",
          manual: trigger === "MANUAL",
        });
        return undefined;
      }
    }

    // Fast file-size pre-check before Buffer.byteLength or inspectContext.
    const maxBytes = Math.max(1, s.maxFileSizeKb) * 1024;
    const full = document.getText();
    if (full.length > maxBytes) {
      this.onActivity?.({
        kind: "skipped",
        reason: `file exceeds ${s.maxFileSizeKb} KB limit`,
        manual: trigger === "MANUAL",
      });
      return undefined;
    }
    const fileSizeBytes = Buffer.byteLength(full, "utf8");
    if (fileSizeBytes > maxBytes) {
      this.onActivity?.({
        kind: "skipped",
        reason: `file exceeds ${s.maxFileSizeKb} KB limit`,
        manual: trigger === "MANUAL",
      });
      return undefined;
    }

    if (token.isCancellationRequested) return undefined;

    const offset = document.offsetAt(position);
    const prefix = full.slice(0, offset);
    const suffix = full.slice(offset);

    // Skip inspectContext completely when both comments and strings are enabled.
    const needContextProbe = !s.enableInComments || !s.enableInStrings;
    const probe = needContextProbe
      ? inspectContext(prefix, language)
      : { inComment: false, inString: false };
    if ((!s.enableInComments && probe.inComment) || (!s.enableInStrings && probe.inString)) {
      this.onActivity?.({
        kind: "skipped",
        reason: probe.inComment ? "inside comment" : "inside string",
        manual: trigger === "MANUAL",
      });
      return undefined;
    }

    // Re-check cancellation BEFORE allocating generation, registering listener, or launching engine job.
    if (token.isCancellationRequested) return undefined;

    const scope = docPath || "untitled";
    const gen = this.engine.nextGeneration(scope);
    const requestId = this.engine.newRequestId();
    const request = {
      id: requestId,
      path: docPath,
      language,
      prefix,
      suffix,
      offset,
      trigger,
      generation: gen,
      fileSizeBytes,
      context: {
        inComment: probe.inComment,
        inString: probe.inString,
      },
      projectKey,
      forceRefresh: forceRefresh || undefined,
    };

    const disposeCancel = token.onCancellationRequested(() =>
      this.engine.cancelScope(scope, requestId),
    );
    if (token.isCancellationRequested) {
      disposeCancel.dispose();
      return undefined;
    }

    const docUriStr = document.uri.toString();
    this.projectContext?.setCurrentDocumentUri(docUriStr);
    this.onActivity?.({ kind: "start" });

    try {
      const outcome: CompletionOutcome = await new Promise((resolve) => {
        this.engine.completeAsync(request, resolve, request.trigger === "AUTO" && !forceRefresh);
      });
      this.onActivity?.({ kind: "done", outcome });
      if (token.isCancellationRequested) return undefined;
      if (outcome.kind !== "success" || !outcome.response.text) return undefined;

      // Plain string insertText + zero-width range at cursor preserves VS Code's native
      // acceptNextWord / acceptNextLine partial-accept support (paired with PARTIAL_TYPING cache).
      const item = new vscode.InlineCompletionItem(
        outcome.response.text,
        new vscode.Range(position, position),
      );
      item.command = {
        command: INTERNAL_ACCEPTED_COMMAND,
        title: "Record Auto Complete Acceptance",
      };
      return new vscode.InlineCompletionList([item]);
    } catch {
      return undefined;
    } finally {
      this.projectContext?.setCurrentDocumentUri(undefined);
      disposeCancel.dispose();
    }
  }
}
