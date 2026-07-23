/**
 * Removes profile fields that must never leave the current host.
 *
 * `extraHeadersJson` stays available in the in-process UI snapshot so the user
 * can edit non-secret routing headers, but it is intentionally non-portable:
 * arbitrary header values can contain credentials and are omitted from export.
 */
export function redactSettingsExport<T extends { profiles: readonly object[] }>(snapshot: T) {
  return {
    ...snapshot,
    profiles: snapshot.profiles.map((profile) => {
      const {
        apiKey: _apiKey,
        hasApiKey: _hasApiKey,
        authHeaderTemplate: _authHeaderTemplate,
        extraHeadersJson: _extraHeadersJson,
        ...safe
      } = profile as object & {
          apiKey?: unknown;
          hasApiKey?: unknown;
          authHeaderTemplate?: unknown;
          extraHeadersJson?: unknown;
        };
      return safe;
    }),
  };
}
