// Node ESM loader hook, used only by the hermetic test suite.
//
// `node --test` has no bundler, so two things that Next's own build handles
// silently break a plain `node --experimental-strip-types` run:
//   - the `@/*` path alias from tsconfig.json is not a Node concept
//   - `next/navigation`, `next/headers`, etc. are extensionless specifiers
//     with no `exports` map entry in next's package.json, so Node's ESM
//     resolver refuses them ("Did you mean next/navigation.js?")
// This hook exists purely to make already-committed lib code importable
// from a test file; it changes no runtime behavior of the app itself.
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  // `server-only` is a build-time guard: its only job is to break a *client*
  // bundle that imports server code. A `node --test` run has no client
  // bundle, and the package isn't in node_modules (Next supplies it), so it
  // resolves to an empty module here. This keeps the guard fully in force
  // where it matters -- the real Next build still resolves the real package
  // -- while letting a test import a server-only module directly.
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: "data:text/javascript,", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const target = pathToFileURL(path.join(root, specifier.slice(2))).href;
    return nextResolve(`${target}.ts`, context);
  }
  if (specifier.startsWith("next/") && !path.extname(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier)
  ) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
