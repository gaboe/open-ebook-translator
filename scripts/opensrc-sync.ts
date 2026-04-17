/**
 * OpenSrc Sync Script
 *
 * Syncs all source repositories defined in opensrc/sources.json in parallel.
 * Use this after cloning the repo to fetch all external source code.
 *
 * Usage: bun run scripts/opensrc-sync.ts
 */

import { existsSync, unlinkSync } from "node:fs";

type SourcesJson = {
  repos: Array<{
    name: string;
    version: string;
    path: string;
    fetchedAt: string;
  }>;
  packages: Array<{
    name: string;
    version: string;
    registry: string;
    path: string;
    fetchedAt: string;
  }>;
};

async function loadSources(): Promise<SourcesJson | null> {
  const sourcesPath = `${process.cwd()}/opensrc/sources.json`;

  if (!existsSync(sourcesPath)) {
    console.error("opensrc/sources.json not found");
    return null;
  }

  const content = await Bun.file(sourcesPath).text();
  return JSON.parse(content) as SourcesJson;
}

type SyncResult = {
  repo: string;
  success: boolean;
  error?: string;
};

async function syncRepo(name: string, version: string): Promise<SyncResult> {
  // name format: "github.com/owner/repo" -> "owner/repo@version"
  const repoPath = name.replace("github.com/", "");
  const args = ["bunx", "opensrc", "--modify", "false", `${repoPath}@${version}`];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return {
      repo: repoPath,
      success: false,
      error: stderr.trim(),
    };
  }

  return { repo: repoPath, success: true };
}

function deleteAgentsMd(): void {
  const agentsPath = `${process.cwd()}/AGENTS.md`;
  if (existsSync(agentsPath)) {
    unlinkSync(agentsPath);
    console.log("Deleted AGENTS.md");
  }
}

async function main(): Promise<void> {
  const sources = await loadSources();
  if (!sources) {
    process.exit(1);
  }

  const repoCount = sources.repos.length;
  console.log(`OpenSrc Sync - Fetching ${repoCount} repositories in parallel...\n`);

  // Sync all repos in parallel
  const results = await Promise.all(sources.repos.map((repo) => syncRepo(repo.name, repo.version)));

  // Print results
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const result of succeeded) {
    console.log(`  ✓ ${result.repo}`);
  }

  for (const result of failed) {
    console.log(`  ✗ ${result.repo}: ${result.error}`);
  }

  // Clean up AGENTS.md if it was created
  deleteAgentsMd();

  console.log(`\nDone: ${succeeded.length} succeeded, ${failed.length} failed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
