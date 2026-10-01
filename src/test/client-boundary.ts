import ts from "typescript";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The analysis behind `client-boundary.test.ts`, over an in-memory file
 * map so the test can run it against the real tree AND against small
 * hand-written cases (the bypasses earlier versions of this missed).
 *
 * Parsed with the TypeScript compiler, not regexes: a regex over
 * `(import|export) … from` swallowed whole function bodies from an
 * `export async function` to the next re-export, lost default imports
 * that followed `import "server-only"`, never saw `import * as X`, and
 * counted a name in a comment as a use.
 *
 * Deliberately strict in one place: a client function passed as a
 * prop from a server component is flagged even though React can
 * serialise the reference. Import it in the client component instead;
 * the guard is simpler for having one rule.
 */

export type Files = Map<string, string>;

interface Binding {
  /** The exported name asked for; "default" for a default import, "*" for a namespace. */
  imported: string;
  local: string;
  namespace: boolean;
}

interface ImportLike {
  spec: string;
  bindings: Binding[];
  /** The declaration the bindings come from — skipped when counting uses. */
  node: ts.Node;
}

interface Parsed {
  sf: ts.SourceFile;
  client: boolean;
  server: boolean;
  /** Static imports and `const … = await import("…")`. */
  imports: ImportLike[];
  /** Every module this file pulls in: imports, re-exports, `import()`. */
  edges: string[];
  /** `export { a as b } from "x"` (names: exported → imported) and `export * from "x"` (names: null). */
  reexports: Array<{ spec: string; names: Map<string, string> | null }>;
  /** `export * as N from "x"`: N → spec. */
  namespaceReexports: Map<string, string>;
  /** Exported name → the local it exports (`export { a as b }`). */
  localExports: Map<string, string>;
  /** Names this module defines and exports itself. */
  defines: Set<string>;
  /** The declared name behind `export default`, or null if anonymous. */
  defaultName: string | null;
}

const hasDirective = (sf: ts.SourceFile, text: string) =>
  sf.statements.length > 0 &&
  ts.isExpressionStatement(sf.statements[0]) &&
  ts.isStringLiteral(sf.statements[0].expression) &&
  sf.statements[0].expression.text === text;

const isDynamicImport = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword &&
  n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0]);

function parse(path: string, text: string): Parsed {
  const sf = ts.createSourceFile(
    path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Parsed = {
    sf,
    client: hasDirective(sf, "use client"),
    server: hasDirective(sf, "use server"),
    imports: [], edges: [], reexports: [], namespaceReexports: new Map(),
    localExports: new Map(), defines: new Set(), defaultName: null,
  };
  const modifiers = (n: ts.Node) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []);
  const exported = (n: ts.Node) => modifiers(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (n: ts.Node) => modifiers(n).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      out.edges.push(spec);
      const clause = st.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const bindings: Binding[] = [];
      if (clause.name) bindings.push({ imported: "default", local: clause.name.text, namespace: false });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) bindings.push({ imported: "*", local: nb.name.text, namespace: true });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (el.isTypeOnly) continue;
          bindings.push({ imported: (el.propertyName ?? el.name).text, local: el.name.text, namespace: false });
        }
      }
      out.imports.push({ spec, bindings, node: st });
    } else if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (spec) out.edges.push(spec);
      if (!st.exportClause) {
        if (spec) out.reexports.push({ spec, names: null });
      } else if (ts.isNamespaceExport(st.exportClause)) {
        if (spec) out.namespaceReexports.set(st.exportClause.name.text, spec);
      } else if (ts.isNamedExports(st.exportClause)) {
        const names = new Map<string, string>();
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          names.set(el.name.text, (el.propertyName ?? el.name).text);
        }
        if (spec) out.reexports.push({ spec, names });
        else for (const [exp, loc] of names) out.localExports.set(exp, loc);
      }
    } else if (ts.isExportAssignment(st)) {
      out.defines.add("default");
      if (ts.isIdentifier(st.expression)) out.defaultName = st.expression.text;
    } else if (exported(st)) {
      const named = (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name
        ? st.name.text : null;
      if (isDefault(st)) {
        out.defines.add("default");
        out.defaultName = named;
      } else if (named) {
        out.defines.add(named);
      }
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.defines.add(d.name.text);
      }
    }
  }

  const visit = (n: ts.Node) => {
    if (isDynamicImport(n)) {
      const spec = (n.arguments[0] as ts.StringLiteral).text;
      out.edges.push(spec);
      // `const m = await import("x")` / `const { a, b: c } = await import("x")`
      const decl = ts.isAwaitExpression(n.parent) && ts.isVariableDeclaration(n.parent.parent) ? n.parent.parent : null;
      if (decl) {
        const bindings: Binding[] = [];
        if (ts.isIdentifier(decl.name)) {
          bindings.push({ imported: "*", local: decl.name.text, namespace: true });
        } else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (!ts.isIdentifier(el.name)) continue;
            const imported = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
            bindings.push({ imported, local: el.name.text, namespace: false });
          }
        }
        if (bindings.length) out.imports.push({ spec, bindings, node: decl.name });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A component is PascalCase with a lowercase letter: `Podium`, not `SCORING_ROWS`. */
export const isComponent = (name: string) => /^[A-Z]/.test(name) && /[a-z]/.test(name);

/** Next.js file conventions that render on the server. */
const ROUTE_ENTRY =
  /\/(page|layout|template|loading|not-found|global-not-found|forbidden|unauthorized|default|route|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.tsx?$/;

/** Imports that aren't code: stylesheets, images, data. */
const ASSET = /\.(s?css|svg|png|jpe?g|gif|webp|avif|ico|json|txt|woff2?)$/;

/** Where a name comes from: the defining module and the name it declares there. */
interface Origin {
  file: string;
  /** The declared name; null for an anonymous default export. */
  name: string | null;
  /** The name is a whole module namespace (`export * as N`, or a re-exported `import * as`). */
  namespace: boolean;
}

export function analyse(
  files: Files,
  srcRoot: string,
): { server: string[]; violations: string[]; unresolved: string[] } {
  const parsed = new Map<string, Parsed>();
  const get = (f: string) => {
    let p = parsed.get(f);
    if (!p) {
      p = parse(f, files.get(f) ?? "");
      parsed.set(f, p);
    }
    return p;
  };

  const resolveSpec = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(srcRoot, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    // `./x.js` names `./x.ts` under bundler resolution.
    const stem = base.replace(/\.(m?jsx?)$/, "");
    for (const c of [base, `${stem}.ts`, `${stem}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (files.has(c)) return c;
    }
    return null;
  };

  /** Follow a name through re-exports to the module that defines it. */
  const origin = (file: string, name: string, seen = new Set<string>()): Origin | null => {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const p = get(file);
    if (p.defines.has(name)) return { file, name: name === "default" ? p.defaultName : name, namespace: false };
    const nsSpec = p.namespaceReexports.get(name);
    if (nsSpec) {
      const t = resolveSpec(file, nsSpec);
      return t ? { file: t, name: null, namespace: true } : null;
    }
    const local = p.localExports.get(name);
    if (local) {
      for (const imp of p.imports) {
        const b = imp.bindings.find((x) => x.local === local);
        const t = b && resolveSpec(file, imp.spec);
        if (!t || !b) continue;
        if (b.namespace) return { file: t, name: null, namespace: true };
        return origin(t, b.imported, seen) ?? { file: t, name: b.imported, namespace: false };
      }
      return { file, name: local, namespace: false };
    }
    for (const r of p.reexports) {
      const t = resolveSpec(file, r.spec);
      if (!t) continue;
      if (r.names) {
        const from = r.names.get(name);
        if (from) return origin(t, from, seen) ?? { file: t, name: from, namespace: false };
      } else {
        const found = origin(t, name, seen);
        if (found) return found;
      }
    }
    return null;
  };

  /** Every name a module exports (for a namespace used as a whole). */
  const exportedNames = (file: string, seen = new Set<string>()): string[] => {
    if (seen.has(file)) return [];
    seen.add(file);
    const p = get(file);
    const names = new Set<string>([...p.defines, ...p.localExports.keys(), ...p.namespaceReexports.keys()]);
    for (const r of p.reexports) {
      if (r.names) for (const n of r.names.keys()) names.add(n);
      else {
        const t = resolveSpec(file, r.spec);
        if (t) for (const n of exportedNames(t, seen)) if (n !== "default") names.add(n);
      }
    }
    return [...names];
  };

  const clientValue = (file: string, name: string): Origin | null => {
    const o = get(file).client
      ? { file, name: name === "default" ? get(file).defaultName : name, namespace: false }
      : origin(file, name);
    if (!o || o.namespace || !get(o.file).client) return null;
    // An anonymous default export has no name to call a component.
    return o.name !== null && isComponent(o.name) ? null : o;
  };

  // The server graph: route entries, server actions, the proxy and
  // instrumentation — then everything they reach without crossing a
  // "use client" boundary.
  const repoRoot = dirname(srcRoot);
  const roots = [...files.keys()].filter((f) => {
    const p = get(f);
    if (p.client) return false;
    if (p.server) return true;
    if ([join(srcRoot, "proxy.ts"), join(srcRoot, "middleware.ts"), join(srcRoot, "instrumentation.ts"),
      join(repoRoot, "instrumentation.ts")].includes(f)) return true;
    return f.startsWith(join(srcRoot, "app")) && (ROUTE_ENTRY.test(f) || /actions\.ts$/.test(f));
  });
  const server = new Set(roots);
  const unresolved: string[] = [];
  const rel = (f: string) => relative(srcRoot, f);
  const queue = [...roots];
  while (queue.length) {
    const f = queue.shift() as string;
    for (const spec of get(f).edges) {
      const internal = spec.startsWith("@/") || spec.startsWith(".");
      const t = resolveSpec(f, spec);
      if (!t) {
        if (internal && !ASSET.test(spec)) unresolved.push(`${rel(f)} -> ${spec}`);
        continue;
      }
      if (!get(t).client && !server.has(t)) {
        server.add(t);
        queue.push(t);
      }
    }
  }

  const violations: string[] = [];

  /** Check every member of a namespace `ns` (a module `target`) that a server file reads. */
  const checkNamespace = (file: string, sf: ts.SourceFile, ns: string, target: string, skip: ts.Node) => {
    const { members, whole } = namespaceUses(sf, ns, skip);
    const names = whole ? exportedNames(target) : members;
    for (const member of names) {
      const o = clientValue(target, member);
      if (o) violations.push(`${rel(file)} uses ${ns}${whole ? " (whole namespace)" : ""}.${member} from ${rel(o.file)}`);
    }
  };

  for (const file of server) {
    const p = get(file);
    for (const imp of p.imports) {
      const target = resolveSpec(file, imp.spec);
      if (!target) continue;
      for (const b of imp.bindings) {
        if (b.namespace) {
          checkNamespace(file, p.sf, b.local, target, imp.node);
          continue;
        }
        // A named import that is itself a re-exported namespace.
        const o = get(target).client ? null : origin(target, b.imported);
        if (o?.namespace) {
          checkNamespace(file, p.sf, b.local, o.file, imp.node);
          continue;
        }
        const cv = clientValue(target, b.imported);
        if (cv && valueUses(p.sf, b.local, imp.node) > 0) {
          violations.push(`${rel(file)} uses ${b.local} from ${rel(cv.file)}`);
        }
      }
    }
  }
  return { server: [...server], violations: [...new Set(violations)], unresolved };
}

/** Skip type-only syntax, but not a class's `extends` expression, which is a value. */
function isTypeOnlySyntax(node: ts.Node): boolean {
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return true;
  if (ts.isExpressionWithTypeArguments(node)) {
    const clause = node.parent;
    return !(ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent));
  }
  return ts.isTypeNode(node);
}

/**
 * Value references to `name`: identifiers outside type positions,
 * outside the import itself, and not a property name or an export
 * specifier.
 */
function valueUses(sf: ts.SourceFile, name: string, skip: ts.Node): number {
  let n = 0;
  const visit = (node: ts.Node) => {
    if (node === skip || isTypeOnlySyntax(node)) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const parent = node.parent;
      const notAUse =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ts.isExportSpecifier(parent);
      if (!notAUse) n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/**
 * What a file reads off a namespace: `ns.member` (and `<ns.Member>`) as
 * named members; any other use — `ns["x"]`, `const { x } = ns`,
 * `{ ...ns }`, `f(ns)` — counts as the WHOLE namespace.
 */
function namespaceUses(sf: ts.SourceFile, ns: string, skip: ts.Node): { members: string[]; whole: boolean } {
  const members = new Set<string>();
  let whole = false;
  const visit = (node: ts.Node) => {
    if (node === skip || isTypeOnlySyntax(node)) return;
    if (ts.isIdentifier(node) && node.text === ns) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        members.add(parent.name.text);
      } else if (
        !(ts.isPropertyAccessExpression(parent) && parent.name === node) &&
        !(ts.isPropertyAssignment(parent) && parent.name === node) &&
        !ts.isExportSpecifier(parent)
      ) {
        whole = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { members: [...members], whole };
}
