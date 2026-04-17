/**
 * Optimized Effect diagnostics using a single shared TypeScript LanguageService.
 *
 * ## How it works
 *
 * ```
 * bun run check
 *     │
 *     ├── 1. Format (sequential - may modify files)
 *     │
 *     └── 2. Parallel:
 *             ├── lint
 *             ├── typecheck
 *             ├── effect ◄── THIS
 *             └── test
 * ```
 *
 * ### Effect diagnostics flow
 *
 * ```
 * effect check
 *     │
 *     ├── 1. Find all files with `from "effect"` import (~18ms)
 *     │
 *     ├── 2. Compute hash (files + tsconfigs + bun.lock)
 *     │
 *     ├── 3. Cache hit?
 *     │       │
 *     │       ├── YES + last result was OK + TTL < 1h
 *     │       │       └── Return cached result (~15ms) ✓
 *     │       │
 *     │       └── NO (or had errors, or TTL expired)
 *     │               │
 *     │               ├── 4. Create TypeScript LanguageService with Effect plugin
 *     │               │
 *     │               ├── 5. Run diagnostics for all files (~3.9s)
 *     │               │
 *     │               └── 6. If OK → save to cache
 *     │
 *     └── Result
 * ```
 *
 * ### Performance
 *
 * | Scenario                              | Time      |
 * |---------------------------------------|-----------|
 * | Cache hit (no changes)                | ~15ms     |
 * | Cache miss (first run / after change) | ~3.9s     |
 * | Original approach (6 processes)       | ~6.5s     |
 *
 * ### Cache invalidation
 *
 * Cache is automatically invalidated when:
 * - Content of any Effect file changes
 * - Effect file is added/removed
 * - Any tsconfig changes (`tsconfig.base.json` or per-project `tsconfig.json`)
 * - `bun.lock` changes (any dependency update including @effect/language-service)
 * - 1 hour TTL expires
 *
 * Cache is never saved if diagnostics find errors → you always see current errors.
 */

import { existsSync } from "node:fs";
import ts from "typescript";
// @ts-expect-error - no type definitions for @effect/language-service
import effectPlugin from "@effect/language-service";

const CACHE_DIR = ".effect-cache";
const CACHE_FILE = `${CACHE_DIR}/diagnostics.json`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type EffectDiagnostic = {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "message";
  code: number;
};

export type ProjectDiagnostics = {
  project: string;
  files: number;
  diagnostics: EffectDiagnostic[];
  duration: number;
};

export type EffectDiagnosticsResult = {
  projects: ProjectDiagnostics[];
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  totalMessages: number;
  duration: number;
  cacheHit?: boolean;
};

type CacheEntry = {
  hash: string;
  timestamp: number;
  result: EffectDiagnosticsResult;
};

type EffectFile = {
  project: string;
  relativePath: string;
  absolutePath: string;
  contentHash: string;
};

/**
 * Get hash of all tsconfig files (base + per-project)
 */
async function getTsconfigHash(cwd: string, projects: string[]): Promise<string> {
  const tsconfigPaths = [
    `${cwd}/tsconfig.base.json`,
    ...projects.map((p) => `${cwd}/${p}/tsconfig.json`),
  ];

  const hashes: string[] = [];
  for (const path of tsconfigPaths) {
    const file = Bun.file(path);
    if (await file.exists()) {
      const content = await file.text();
      hashes.push(Bun.hash(content).toString(16));
    }
  }

  return hashes.sort().join("|");
}

/**
 * Compute cache hash from files, tsconfig, and lockfile
 */
function computeCacheHash(files: EffectFile[], tsconfigHash: string, lockfileHash: string): string {
  const contentHashes = files.map((f) => f.contentHash).sort();
  const combined = [tsconfigHash, lockfileHash, ...contentHashes].join("|");
  return Bun.hash(combined).toString(16);
}

/**
 * Load cache entry if valid
 */
async function loadCache(): Promise<CacheEntry | null> {
  try {
    const cacheFile = Bun.file(CACHE_FILE);
    if (!(await cacheFile.exists())) {
      return null;
    }
    const cache = (await cacheFile.json()) as CacheEntry;

    // Check TTL
    if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

/**
 * Save cache entry (only called when diagnostics pass)
 */
async function saveCache(hash: string, result: EffectDiagnosticsResult): Promise<void> {
  try {
    const cacheDir = `${process.cwd()}/${CACHE_DIR}`;
    if (!existsSync(cacheDir)) {
      await Bun.spawn(["mkdir", "-p", cacheDir]).exited;
    }

    const entry: CacheEntry = {
      hash,
      timestamp: Date.now(),
      result,
    };

    await Bun.write(CACHE_FILE, JSON.stringify(entry, null, 2));
  } catch {
    // Cache write failures are non-fatal
  }
}

/**
 * Scan a project for files that import from "effect"
 */
async function findEffectFiles(project: string): Promise<EffectFile[]> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const effectFiles: EffectFile[] = [];
  const cwd = process.cwd();

  // Check if project directory exists
  const projectPath = `${cwd}/${project}`;
  if (!existsSync(projectPath)) {
    return [];
  }

  try {
    for await (const file of glob.scan({
      cwd: project,
      onlyFiles: true,
    })) {
      if (file.includes("node_modules") || file.includes(".test.") || file.includes(".spec.")) {
        continue;
      }

      const absolutePath = `${cwd}/${project}/${file}`;
      const content = await Bun.file(absolutePath).text();
      if (content.includes('from "effect"') || content.includes("from 'effect'")) {
        effectFiles.push({
          project,
          relativePath: file,
          absolutePath,
          contentHash: Bun.hash(content).toString(16),
        });
      }
    }
  } catch {
    // Project directory doesn't exist or is not accessible
    return [];
  }

  return effectFiles;
}

/**
 * Convert TS diagnostic to our format, filtering for Effect-specific diagnostics
 */
function convertDiagnostic(
  diag: ts.Diagnostic,
  severity: "error" | "warning" | "message",
): EffectDiagnostic | null {
  const file = diag.file;
  if (!file) return null;

  const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");

  // Filter for Effect-specific diagnostics (message contains "effect(" suffix)
  if (!message.includes("effect(")) {
    return null;
  }

  const { line, character } = file.getLineAndCharacterOfPosition(diag.start ?? 0);

  return {
    file: file.fileName,
    line: line + 1,
    column: character + 1,
    message,
    severity,
    code: diag.code,
  };
}

/**
 * Run Effect diagnostics for all projects using a single LanguageService
 */
export async function runEffectDiagnostics(projects: string[]): Promise<EffectDiagnosticsResult> {
  const totalStart = performance.now();
  const cwd = process.cwd();

  // Step 1: Find all Effect files across all projects in parallel
  const allEffectFiles: EffectFile[] = [];
  const projectFileCounts = new Map<string, number>();

  const fileResults = await Promise.all(projects.map((project) => findEffectFiles(project)));

  for (const files of fileResults) {
    for (const file of files) {
      allEffectFiles.push(file);
      projectFileCounts.set(file.project, (projectFileCounts.get(file.project) ?? 0) + 1);
    }
  }

  if (allEffectFiles.length === 0) {
    return {
      projects: [],
      totalFiles: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalMessages: 0,
      duration: performance.now() - totalStart,
    };
  }

  // Step 2: Check cache
  const tsconfigHash = await getTsconfigHash(cwd, projects);
  const lockfile = Bun.file(`${cwd}/bun.lock`);
  const lockfileHash = (await lockfile.exists())
    ? Bun.hash(await lockfile.text()).toString(16)
    : "no-lockfile";
  const currentHash = computeCacheHash(allEffectFiles, tsconfigHash, lockfileHash);

  const cache = await loadCache();
  if (cache && cache.hash === currentHash) {
    // Cache hit! But only if the cached result was a pass (no diagnostics)
    const cachedResult = cache.result;
    const hadErrors =
      cachedResult.totalErrors > 0 ||
      cachedResult.totalWarnings > 0 ||
      cachedResult.totalMessages > 0;

    if (!hadErrors) {
      return {
        ...cachedResult,
        duration: performance.now() - totalStart,
        cacheHit: true,
      };
    }
    // If cached result had errors, re-run to show current state
  }

  // Step 3: Read base tsconfig for compiler options
  const baseTsconfig = ts.readConfigFile(`${cwd}/tsconfig.base.json`, (path) =>
    ts.sys.readFile(path),
  );
  const baseOptions = ts.parseJsonConfigFileContent(baseTsconfig.config, ts.sys, cwd).options;

  // Override some options for our use case
  const compilerOptions: ts.CompilerOptions = {
    ...baseOptions,
    noEmit: true,
    skipLibCheck: true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    incremental: false,
    composite: false,
    // Ensure we can resolve all project paths
    baseUrl: cwd,
    paths: {
      "@/*": [`${cwd}/apps/web-app/src/*`],
      "@blogic-template/*": [`${cwd}/packages/*/src`],
    },
  };

  // Step 3: Create file map for LanguageServiceHost
  const fileContents = new Map<string, string>();
  const fileNames = allEffectFiles.map((f) => f.absolutePath);

  for (const file of allEffectFiles) {
    const content = await Bun.file(file.absolutePath).text();
    fileContents.set(file.absolutePath, content);
  }

  // Step 4: Create LanguageServiceHost
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const content = fileContents.get(fileName) ?? ts.sys.readFile(fileName);
      if (content) return ts.ScriptSnapshot.fromString(content);
      return undefined;
    },
    getCurrentDirectory: () => cwd,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (path) => ts.sys.fileExists(path),
    readFile: (path) => ts.sys.readFile(path),
    readDirectory: (path, ext, exclude, include, depth) =>
      ts.sys.readDirectory(path, ext, exclude, include, depth),
    directoryExists: (path) => ts.sys.directoryExists(path),
    getDirectories: (path) => ts.sys.getDirectories(path),
  };

  // Step 5: Create LanguageService and wrap with Effect plugin
  const documentRegistry = ts.createDocumentRegistry();
  const baseLS = ts.createLanguageService(host, documentRegistry);

  const plugin = effectPlugin({ typescript: ts });
  const languageService = plugin.create({
    languageService: baseLS,
    languageServiceHost: host,
    project: {
      log: () => {},
      getProjectName: () => "effect-check",
    },
    config: { diagnostics: { enabled: true } },
    serverHost: ts.sys,
  } as unknown as ts.server.PluginCreateInfo);

  // Step 6: Get diagnostics for all files
  const diagnosticsByProject = new Map<string, EffectDiagnostic[]>();
  const projectDurations = new Map<string, number>();

  // Initialize maps
  for (const project of projects) {
    diagnosticsByProject.set(project, []);
    projectDurations.set(project, 0);
  }

  for (const file of allEffectFiles) {
    const fileStart = performance.now();
    const semanticDiags = languageService.getSemanticDiagnostics(file.absolutePath);
    const fileDuration = performance.now() - fileStart;

    projectDurations.set(file.project, (projectDurations.get(file.project) ?? 0) + fileDuration);

    for (const diag of semanticDiags) {
      let severity: "error" | "warning" | "message";
      switch (diag.category) {
        case ts.DiagnosticCategory.Error:
          severity = "error";
          break;
        case ts.DiagnosticCategory.Warning:
          severity = "warning";
          break;
        default:
          severity = "message";
      }

      const converted = convertDiagnostic(diag, severity);
      if (converted) {
        const projectDiags = diagnosticsByProject.get(file.project) ?? [];
        projectDiags.push(converted);
        diagnosticsByProject.set(file.project, projectDiags);
      }
    }
  }

  // Step 7: Build results
  const projectResults: ProjectDiagnostics[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalMessages = 0;

  for (const project of projects) {
    const diags = diagnosticsByProject.get(project) ?? [];
    const fileCount = projectFileCounts.get(project) ?? 0;

    if (fileCount === 0) continue;

    for (const diag of diags) {
      switch (diag.severity) {
        case "error":
          totalErrors++;
          break;
        case "warning":
          totalWarnings++;
          break;
        case "message":
          totalMessages++;
          break;
      }
    }

    projectResults.push({
      project,
      files: fileCount,
      diagnostics: diags,
      duration: projectDurations.get(project) ?? 0,
    });
  }

  const result: EffectDiagnosticsResult = {
    projects: projectResults,
    totalFiles: allEffectFiles.length,
    totalErrors,
    totalWarnings,
    totalMessages,
    duration: performance.now() - totalStart,
  };

  // Step 8: Save cache for this exact hash, including failing diagnostics
  // Cache purpose is to detect file changes, not to only store "clean" results.
  // Without this, projects with existing warnings have perpetual cold cache (~87.5s every run).
  await saveCache(currentHash, result);

  return result;
}

/**
 * Format diagnostics for pretty printing
 */
export function formatDiagnostics(result: EffectDiagnosticsResult): string {
  const lines: string[] = [];

  for (const project of result.projects) {
    if (project.diagnostics.length === 0) {
      continue;
    }

    lines.push(`\n${project.project}:`);
    for (const diag of project.diagnostics) {
      const severityColor =
        diag.severity === "error"
          ? "\x1b[31m"
          : diag.severity === "warning"
            ? "\x1b[33m"
            : "\x1b[36m";
      const reset = "\x1b[0m";
      lines.push(
        `  ${severityColor}${diag.severity}${reset} [${diag.code}] ${diag.file}:${diag.line}:${diag.column}`,
      );
      lines.push(`    ${diag.message}`);
    }
  }

  return lines.join("\n");
}
