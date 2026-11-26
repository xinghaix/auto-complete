import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { VsCodeProjectContext, type RecentContextSettings } from "./context.js";
import {
  createMockVscodeEnv,
  makeMockDocument,
  type MockVscodeEnv,
} from "../testHelpers/mockVscode.js";

describe("VsCodeProjectContext.recentSnippets", () => {
  let env: MockVscodeEnv;

  beforeEach(() => {
    env = createMockVscodeEnv();
    env.install();
  });

  afterEach(() => {
    env.restore();
  });

  it("filters visibleTextEditors and textDocuments by ignore rules, workspace, scheme, size, and current document", () => {
    const settings: RecentContextSettings = {
      ignoreGlobs: ["**/.env", "**/secret/**"],
      respectGitignore: true,
      maxFileSizeKb: 1, // 1024 bytes
      sendFilePath: true,
    };
    const ctx = new VsCodeProjectContext(() => settings);
    ctx.setGitignorePatterns("/workspace/app", ["*.key", "ignored_dir/"]);

    const currentDoc = makeMockDocument({ path: "/workspace/app/src/current.ts", text: "export const cur = 1;" });
    const allowedDoc = makeMockDocument({ path: "/workspace/app/src/helper.ts", text: "export const add = (a: number, b: number) => a + b;" });
    const envSecretDoc = makeMockDocument({ path: "/workspace/app/.env", text: "SECRET_TOKEN=supersecret" });
    const gitignoredDoc = makeMockDocument({ path: "/workspace/app/private.key", text: "PRIVATE KEY" });
    const outsideWorkspaceDoc = makeMockDocument({ path: "/other-repo/passwords.txt", text: "other repo secret" });
    const outputSchemeDoc = makeMockDocument({ path: "extension-output", text: "internal log", scheme: "output" });
    const oversizedDoc = makeMockDocument({ path: "/workspace/app/src/huge.ts", text: "x".repeat(2048) });

    env.setActiveTextEditor({ document: currentDoc });
    env.setVisibleTextEditors([
      { document: currentDoc },
      { document: outsideWorkspaceDoc },
      { document: outputSchemeDoc },
      { document: envSecretDoc },
      { document: allowedDoc },
    ]);
    env.setTextDocuments([
      currentDoc,
      envSecretDoc,
      gitignoredDoc,
      outsideWorkspaceDoc,
      outputSchemeDoc,
      oversizedDoc,
      allowedDoc,
    ]);

    const snippets = ctx.recentSnippets("/workspace/app", true, 5, 500);
    assert.equal(snippets.length, 1);
    assert.ok(snippets[0]!.includes("src/helper.ts"));
    assert.ok(snippets[0]!.includes("export const add"));
    assert.ok(!snippets.some((s) => s.includes("SECRET_TOKEN")));
    assert.ok(!snippets.some((s) => s.includes("PRIVATE KEY")));
    assert.ok(!snippets.some((s) => s.includes("other repo secret")));
    assert.ok(!snippets.some((s) => s.includes("internal log")));
    assert.ok(!snippets.some((s) => s.includes("export const cur")));
  });

  it("omits local file paths completely when sendFilePath is false", () => {
    const ctx = new VsCodeProjectContext(() => ({
      ignoreGlobs: [],
      respectGitignore: false,
      maxFileSizeKb: 512,
      sendFilePath: false,
    }));

    const doc = makeMockDocument({
      path: "/workspace/app/src/utils.ts",
      text: "export function greet() { return 'hi'; }",
    });
    env.setTextDocuments([doc]);

    const snippets = ctx.recentSnippets("/workspace/app", true, 3, 500);
    assert.equal(snippets.length, 1);
    assert.equal(snippets[0], "export function greet() { return 'hi'; }");
    assert.ok(!snippets[0]!.includes("/workspace"));
    assert.ok(!snippets[0]!.includes("utils.ts"));
    assert.ok(!snippets[0]!.startsWith("File:"));
  });

  it("excludes document set via setCurrentDocumentUri even without activeTextEditor", () => {
    const ctx = new VsCodeProjectContext(() => ({
      ignoreGlobs: [],
      respectGitignore: false,
      maxFileSizeKb: 512,
      sendFilePath: true,
    }));
    const docA = makeMockDocument({ path: "/workspace/app/a.ts", text: "const a = 1;" });
    const docB = makeMockDocument({ path: "/workspace/app/b.ts", text: "const b = 2;" });
    env.setTextDocuments([docA, docB]);
    ctx.setCurrentDocumentUri(docA.uri.toString());

    const snippets = ctx.recentSnippets("/workspace/app", true, 3, 500);
    assert.equal(snippets.length, 1);
    assert.ok(snippets[0]!.includes("const b = 2;"));
  });
});
