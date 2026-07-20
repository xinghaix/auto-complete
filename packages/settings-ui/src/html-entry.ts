/**
 * Post-process Vite-built index.html so classic IIFE scripts run after #root.
 * Vite injects <script src="..."> into <head>; sync execution there finds no
 * #root and never mounts the app under JCEF/file://.
 */
export function ensureScriptAfterRoot(html: string): string {
  let out = html
    .replace(/\s*type="module"/g, "")
    .replace(/\s*crossorigin(?:="[^"]*")?/gi, "");

  const scripts: string[] = [];
  out = out.replace(
    /<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/script>\s*/gi,
    (full, _q: string, src: string) => {
      // Keep only entry / asset scripts that must run after #root
      if (/assets\/index\.js|\.js$/i.test(src)) {
        scripts.push(full.trim());
        return "";
      }
      return full;
    },
  );

  if (scripts.length === 0) return out;

  if (/id=["']root["']/.test(out)) {
    out = out.replace(
      /(<div\s+id=["']root["']\s*><\/div>)/i,
      `$1\n    ${scripts.join("\n    ")}`,
    );
  } else {
    // Fallback: append before </body>
    out = out.replace(/<\/body>/i, `    ${scripts.join("\n    ")}\n  </body>`);
  }
  return out;
}

/** True when every classic script with src appears after the #root element. */
export function scriptsRunAfterRoot(html: string): boolean {
  const rootIdx = html.search(/id=["']root["']/i);
  if (rootIdx < 0) return false;
  const re = /<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index < rootIdx) return false;
  }
  return true;
}
