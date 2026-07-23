import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSettingsExport } from "./settingsExport.js";

describe("redactSettingsExport", () => {
  it("removes credential-capable fields without mutating the local snapshot", () => {
    const snapshot = {
      schemaVersion: 1,
      enabled: true,
      profiles: [
        {
          id: "profile-1",
          name: "Gateway",
          baseUrl: "https://example.test/v1",
          model: "model-a",
          hasApiKey: true,
          apiKey: "must-not-escape",
          authHeaderTemplate: "X-API-Key: must-not-escape",
          extraHeadersJson: '{"X-API-Key":"must-not-escape"}',
          promptTemplate: "CHAT",
        },
      ],
    };

    const exported = redactSettingsExport(snapshot);

    assert.deepEqual(exported, {
      schemaVersion: 1,
      enabled: true,
      profiles: [
        {
          id: "profile-1",
          name: "Gateway",
          baseUrl: "https://example.test/v1",
          model: "model-a",
          promptTemplate: "CHAT",
        },
      ],
    });
    assert.equal(snapshot.profiles[0].authHeaderTemplate, "X-API-Key: must-not-escape");
    assert.equal(snapshot.profiles[0].extraHeadersJson, '{"X-API-Key":"must-not-escape"}');
  });
});
