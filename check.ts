import {
  runEffectDiagnostics,
  formatDiagnostics as formatEffectDiagnostics,
} from "./scripts/effect-diagnostics";

const typecheckProjects = ["./src"];

type StepResult = {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
};

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function run(cmd: string[]): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { exitCode, stdout, stderr };
}

async function runStep(
  name: string,
  fn: () => Promise<{ success: boolean; output?: string }>,
): Promise<StepResult> {
  const start = performance.now();
  const { success, output } = await fn();
  const duration = (performance.now() - start) / 1000;
  return { name, success, duration, output };
}

function formatDuration(seconds: number): string {
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${(seconds * 1000).toFixed(0)}ms`;
}

function printResult(result: StepResult): void {
  const icon = result.success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`${icon} ${result.name} (${formatDuration(result.duration)})`);

  if (!result.success && result.output) {
    console.log();
    console.log(result.output);
  }
}

async function lint(typeAware: boolean): Promise<{
  success: boolean;
  output?: string;
}> {
  const cmd = ["bunx", "oxlint", "-c", "./.oxlintrc.json", "--deny-warnings"];

  if (typeAware) {
    cmd.push("--type-aware", "--tsconfig", "./apps/web-app/tsconfig.json");
  }

  const result = await run(cmd);
  return {
    success: result.exitCode === 0,
    output: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
  };
}

async function typecheckAll(verbose: boolean): Promise<{ success: boolean; output?: string }> {
  const processes = typecheckProjects.map(async (project) => {
    const projectStart = performance.now();
    const result = await run(["bun", "run", "typecheck"]);
    const duration = (performance.now() - projectStart) / 1000;
    return { project, result, duration };
  });

  const results = await Promise.all(processes);
  const failed = results.filter((r) => r.result.exitCode !== 0);

  if (verbose) {
    for (const r of results) {
      const icon = r.result.exitCode === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const name = r.project.replace("./", "").replace("/", "-");
      console.log(`  ${icon} ${name} (${formatDuration(r.duration)})`);
    }
  }

  if (failed.length === 0) {
    return { success: true };
  }

  const output = failed
    .map((r) => {
      // tsgo outputs errors to stdout, not stderr
      const errors = (r.result.stdout || r.result.stderr).trim();
      return errors ? `${r.project}:\n${errors}` : "";
    })
    .filter((s) => s.length > 0)
    .join("\n\n");

  return { success: false, output: output || undefined };
}

/**
 * Optimized Effect diagnostics using single LanguageService
 * ~47% faster than spawning multiple effect-language-service processes
 */
async function effectDiagnostics(verbose: boolean): Promise<{ success: boolean; output?: string }> {
  const result = await runEffectDiagnostics(typecheckProjects);

  if (verbose) {
    for (const project of result.projects) {
      const hasIssues = project.diagnostics.length > 0;
      const icon = hasIssues ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m";
      const name = project.project.replace("./", "").replace("/", "-");
      console.log(
        `  ${icon} ${name} [${project.files} files] (${formatDuration(project.duration / 1000)})`,
      );
    }
  }

  const hasErrors = result.totalErrors > 0 || result.totalWarnings > 0 || result.totalMessages > 0;

  if (!hasErrors) {
    return {
      success: true,
      output: `${result.totalFiles} files`,
    };
  }

  return {
    success: false,
    output: formatEffectDiagnostics(result),
  };
}

async function format(): Promise<{
  success: boolean;
  output?: string;
}> {
  const result = await run(["bunx", "oxfmt"]);
  return {
    success: result.exitCode === 0,
    output: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
  };
}

async function formatCheck(): Promise<{
  success: boolean;
  output?: string;
}> {
  const result = await run(["bunx", "oxfmt", "--check"]);
  return {
    success: result.exitCode === 0,
    output: result.exitCode !== 0 ? result.stderr || result.stdout : undefined,
  };
}

async function test(coverage: boolean): Promise<{
  success: boolean;
  output?: string;
}> {
  const cmd = ["bunx", "vitest", "run", "--reporter=dot", "--silent"];
  if (coverage) {
    cmd.push("--coverage");
  }

  const result = await run(cmd);

  if (result.exitCode === 0) {
    const match = result.stdout.match(/Tests\s+(\d+\s+passed)/);
    return {
      success: true,
      output: match ? match[1] : undefined,
    };
  }

  return {
    success: false,
    output: result.stderr || result.stdout,
  };
}

type Command = "all" | "lint" | "typecheck" | "format" | "test" | "effect" | "ci";

function parseArgs(): {
  command: Command;
  verbose: boolean;
} {
  const args = Bun.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const command = (args.find((a: string) => !a.startsWith("-")) as Command) ?? "all";
  return { command, verbose };
}

async function runAll(verbose: boolean): Promise<void> {
  // 1. Format first (may modify files)
  const formatResult = await runStep("format", format);
  printResult(formatResult);
  if (!formatResult.success) {
    process.exit(1);
  }

  // 2. Run lint, typecheck, effect, test in parallel
  const [lintResult, typecheckResult, effectResult, testResult] = await Promise.all([
    runStep("lint", () => lint(false)),
    runStep("typecheck", () => typecheckAll(verbose)),
    runStep("effect", () => effectDiagnostics(verbose)),
    runStep("test", () => test(false)),
  ]);

  if (testResult.success && testResult.output) {
    testResult.name = `test (${testResult.output})`;
    testResult.output = undefined;
  }

  if (effectResult.success && effectResult.output) {
    effectResult.name = `effect (${effectResult.output})`;
    effectResult.output = undefined;
  }

  printResult(lintResult);
  printResult(typecheckResult);
  printResult(effectResult);
  printResult(testResult);

  if (
    !lintResult.success ||
    !typecheckResult.success ||
    !effectResult.success ||
    !testResult.success
  ) {
    process.exit(1);
  }
}

async function runCi(): Promise<void> {
  // Run all checks in parallel (no format modification in CI)
  const [lintResult, typecheckResult, effectResult, formatResult, testResult] = await Promise.all([
    runStep("lint", () => lint(true)),
    runStep("typecheck", () => typecheckAll(false)),
    runStep("effect", () => effectDiagnostics(false)),
    runStep("format", formatCheck),
    runStep("test", () => test(true)),
  ]);

  if (testResult.success && testResult.output) {
    testResult.name = `test (${testResult.output})`;
    testResult.output = undefined;
  }

  if (effectResult.success && effectResult.output) {
    effectResult.name = `effect (${effectResult.output})`;
    effectResult.output = undefined;
  }

  printResult(lintResult);
  printResult(typecheckResult);
  printResult(effectResult);
  printResult(formatResult);
  printResult(testResult);

  if (
    !lintResult.success ||
    !typecheckResult.success ||
    !effectResult.success ||
    !formatResult.success ||
    !testResult.success
  ) {
    process.exit(1);
  }
}

async function runSingle(command: Command, verbose: boolean): Promise<void> {
  let result: StepResult;

  switch (command) {
    case "lint":
      result = await runStep("lint", () => lint(true));
      break;
    case "typecheck":
      result = await runStep("typecheck", () => typecheckAll(verbose));
      break;
    case "format":
      result = await runStep("format", format);
      break;
    case "test":
      result = await runStep("test", () => test(false));
      if (result.success && result.output) {
        result.name = `test (${result.output})`;
        result.output = undefined;
      }
      break;
    case "effect":
      result = await runStep("effect", () => effectDiagnostics(verbose));
      if (result.success && result.output) {
        result.name = `effect (${result.output})`;
        result.output = undefined;
      }
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Usage: bun check.ts [command] [--verbose]");
      console.log("Commands: all, lint, typecheck, effect, format, test, ci");
      process.exit(1);
  }

  printResult(result);

  if (!result.success) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { command, verbose } = parseArgs();

  switch (command) {
    case "all":
      await runAll(verbose);
      break;
    case "ci":
      await runCi();
      break;
    default:
      await runSingle(command, verbose);
  }
}

void main();
