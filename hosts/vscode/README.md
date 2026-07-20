# Auto Complete (VS Code)

Inline AI code completion for VS Code. Uses the TypeScript engine (`packages/core-ts`), dual of the JetBrains Kotlin `core`.

## Install (dev)

```bash
# from repo root
npm install
npm run build:js
# then in VS Code: Extensions → Install from VSIX
# or press F5 from hosts/vscode after opening that folder
```

## Configure

1. Open **Auto Complete: Open Settings Panel** (or native Settings → Auto Complete).
2. Set **Base URL** (e.g. `http://127.0.0.1:11434/v1` for Ollama).
3. Set **API Key** via the panel (SecretStorage) or command **Auto Complete: set API key** if registered.
4. Choose model / prompt template.

## Secrets

API keys are stored in VS Code **SecretStorage**, never in `settings.json`.

## Logs

Command **Auto Complete: Show Logs** opens the Output channel. The settings panel has a Logs tab that receives batched entries via UiBridge.
