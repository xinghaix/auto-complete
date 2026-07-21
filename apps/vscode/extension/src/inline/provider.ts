import * as vscode from "vscode";
import {
  CancellationToken as EngineCancel,
  CancelledError,
  CompletionEngine,
  inspectContext,
  normalizeLanguage,
  type CompletionOutcome,
} from "@auto-complete/core-ts";

export class AutoCompleteInlineProvider implements vscode.InlineCompletionItemProvider {
  constructor(private engine: CompletionEngine) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | undefined> {
    if (document.uri.scheme !== "file" && document.uri.scheme !== "untitled") {
      return undefined;
    }

    const offset = document.offsetAt(position);
    const full = document.getText();
    const prefix = full.slice(0, offset);
    const suffix = full.slice(offset);
    const language = normalizeLanguage(document.languageId, document.fileName);
    const probe = inspectContext(prefix, language);

    const engineToken = new EngineCancel();
    const dispose = token.onCancellationRequested(() => engineToken.cancel());

    const gen = this.engine.nextGeneration();
    const request = {
      id: this.engine.newRequestId(),
      path: document.uri.fsPath || document.fileName,
      language,
      prefix,
      suffix,
      offset,
      trigger:
        context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke
          ? ("MANUAL" as const)
          : ("AUTO" as const),
      generation: gen,
      fileSizeBytes: Buffer.byteLength(full, "utf8"),
      context: {
        inComment: probe.inComment,
        inString: probe.inString,
      },
      projectKey:
        vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
        "",
    };

    try {
      const outcome: CompletionOutcome = await this.engine.complete(request, {
        debounce: request.trigger === "AUTO",
        token: engineToken,
      });
      if (token.isCancellationRequested || engineToken.isCancelled()) return undefined;
      if (outcome.kind !== "success" || !outcome.response.text) return undefined;

      const item = new vscode.InlineCompletionItem(
        outcome.response.text,
        new vscode.Range(position, position),
      );
      return new vscode.InlineCompletionList([item]);
    } catch (e) {
      if (e instanceof CancelledError || token.isCancellationRequested) return undefined;
      return undefined;
    } finally {
      dispose.dispose();
    }
  }
}
