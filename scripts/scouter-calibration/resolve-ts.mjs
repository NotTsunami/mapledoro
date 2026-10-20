// Node module hooks that let a script import the app's .ts modules directly. Node strips the
// types itself (22.18+); these only fill the two gaps the Next/TypeScript build covers for us.

// Relative imports in the app omit the extension, so retry a missing one as .ts.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}

// package.json has no "type": "module", so Node would guess each file's format and warn. The app's
// .ts files are always ES modules, so say so up front.
export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) return nextLoad(url, { ...context, format: "module-typescript" });
  return nextLoad(url, context);
}
