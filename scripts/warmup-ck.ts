/**
 * CK Semantic Search Index Warmup Script
 *
 * Runs CK indexing for the current project.
 * Uses delta indexing - only changed files are re-indexed (80-90% cache hit rate).
 * Automatically cleans old index if model mismatch is detected.
 *
 * Usage: bun run scripts/warmup-ck.ts [--verbose|-v]
 *
 * Options:
 *   --verbose, -v  Show progress bars and detailed output
 */

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

async function runIndex(): Promise<number> {
  const args = ["ck", "--index", ".", "--model", "jina-code"];

  if (!verbose) {
    args.push("--quiet");
  }

  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: verbose ? "inherit" : "pipe",
  });

  if (!verbose && proc.stderr) {
    const stderrText = await new Response(proc.stderr).text();
    if (stderrText) {
      console.error(stderrText);
    }
  }

  const exitCode = await proc.exited;
  return exitCode;
}

async function cleanIndex(): Promise<void> {
  console.log("Cleaning old index due to model mismatch...");
  const proc = Bun.spawn(["ck", "--clean", "."], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

let exitCode = await runIndex();

// If model mismatch, clean and retry
if (exitCode !== 0) {
  await cleanIndex();
  exitCode = await runIndex();
}

if (exitCode !== 0) {
  console.error("CK warmup failed with exit code:", exitCode);
  throw new Error(`CK warmup failed with exit code: ${exitCode}`);
}

console.log("CK semantic search index ready");

export {};
