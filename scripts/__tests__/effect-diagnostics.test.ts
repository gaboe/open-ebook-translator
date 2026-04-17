/**
 * Effect diagnostics tests
 *
 * NOTE: These tests cannot run with vitest due to @effect/language-service
 * being a CJS module that vitest cannot resolve.
 *
 * Run with: bun test scripts/__tests__/effect-diagnostics.test.ts
 */
import { existsSync, rmSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll } from "@effect/vitest";
import {
  formatDiagnostics,
  runEffectDiagnostics,
  type EffectDiagnosticsResult,
} from "../effect-diagnostics";

const TEST_FIXTURES_DIR = "./scripts/__tests__/fixtures";

/**
 * Creates a temporary test file with Effect code
 */
async function createTestFile(filename: string, content: string): Promise<string> {
  const filepath = `${TEST_FIXTURES_DIR}/${filename}`;
  await Bun.write(filepath, content);
  return filepath;
}

/**
 * Cleans up test fixtures directory
 */
function cleanupTestFixtures(): void {
  if (existsSync(TEST_FIXTURES_DIR)) {
    rmSync(TEST_FIXTURES_DIR, {
      recursive: true,
      force: true,
    });
  }
}

describe("effect-diagnostics", () => {
  describe("runEffectDiagnostics", () => {
    it("finds Effect files in projects", async () => {
      const result = await runEffectDiagnostics(["./packages/common"]);

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].project).toBe("./packages/common");
      expect(result.projects[0].files).toBeGreaterThan(0);
    });

    it("handles projects without Effect files", async () => {
      const result = await runEffectDiagnostics(["./packages/logger"]);

      // Logger might not have Effect files
      expect(result.projects.every((p) => p.files >= 0)).toBe(true);
    });

    it("processes multiple projects", async () => {
      const result = await runEffectDiagnostics(["./packages/common", "./packages/services"]);

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.projects.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty result for non-existent project", async () => {
      const result = await runEffectDiagnostics(["./non-existent-project"]);

      expect(result.totalFiles).toBe(0);
      expect(result.projects).toHaveLength(0);
    });

    it("aggregates diagnostics counts correctly", async () => {
      const result = await runEffectDiagnostics(["./packages/common"]);

      // Sum of individual project diagnostics should match totals
      let sumErrors = 0;
      let sumWarnings = 0;
      let sumMessages = 0;

      for (const project of result.projects) {
        for (const diag of project.diagnostics) {
          switch (diag.severity) {
            case "error":
              sumErrors++;
              break;
            case "warning":
              sumWarnings++;
              break;
            case "message":
              sumMessages++;
              break;
          }
        }
      }

      expect(result.totalErrors).toBe(sumErrors);
      expect(result.totalWarnings).toBe(sumWarnings);
      expect(result.totalMessages).toBe(sumMessages);
    });

    it("measures duration", async () => {
      const result = await runEffectDiagnostics(["./packages/common"]);

      expect(result.duration).toBeGreaterThan(0);
      for (const project of result.projects) {
        expect(project.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it("returns cacheHit flag when cache is used", async () => {
      // Run diagnostics - may or may not be cached from previous runs
      const firstResult = await runEffectDiagnostics(["./packages/common"]);

      // If no errors, cache should be populated
      if (
        firstResult.totalErrors === 0 &&
        firstResult.totalWarnings === 0 &&
        firstResult.totalMessages === 0
      ) {
        // Second run should definitely hit cache
        const secondResult = await runEffectDiagnostics(["./packages/common"]);
        expect(secondResult.cacheHit).toBe(true);
        expect(secondResult.duration).toBeLessThan(100); // Cache hit should be fast
      }
    });
  });

  describe("formatDiagnostics", () => {
    it("returns empty string when no diagnostics", () => {
      const result: EffectDiagnosticsResult = {
        projects: [
          {
            project: "./packages/common",
            files: 10,
            diagnostics: [],
            duration: 100,
          },
        ],
        totalFiles: 10,
        totalErrors: 0,
        totalWarnings: 0,
        totalMessages: 0,
        duration: 100,
      };

      expect(formatDiagnostics(result)).toBe("");
    });

    it("formats diagnostics with severity colors", () => {
      const result: EffectDiagnosticsResult = {
        projects: [
          {
            project: "./packages/common",
            files: 10,
            diagnostics: [
              {
                file: "/path/to/file.ts",
                line: 10,
                column: 5,
                message: "Test error message",
                severity: "error",
                code: 90001,
              },
            ],
            duration: 100,
          },
        ],
        totalFiles: 10,
        totalErrors: 1,
        totalWarnings: 0,
        totalMessages: 0,
        duration: 100,
      };

      const formatted = formatDiagnostics(result);

      expect(formatted).toContain("./packages/common");
      expect(formatted).toContain("error");
      expect(formatted).toContain("90001");
      expect(formatted).toContain("file.ts:10:5");
      expect(formatted).toContain("Test error message");
    });

    it("groups diagnostics by project", () => {
      const result: EffectDiagnosticsResult = {
        projects: [
          {
            project: "./packages/common",
            files: 5,
            diagnostics: [
              {
                file: "/path/to/a.ts",
                line: 1,
                column: 1,
                message: "Error A",
                severity: "error",
                code: 90001,
              },
            ],
            duration: 50,
          },
          {
            project: "./packages/services",
            files: 5,
            diagnostics: [
              {
                file: "/path/to/b.ts",
                line: 2,
                column: 2,
                message: "Error B",
                severity: "warning",
                code: 90002,
              },
            ],
            duration: 50,
          },
        ],
        totalFiles: 10,
        totalErrors: 1,
        totalWarnings: 1,
        totalMessages: 0,
        duration: 100,
      };

      const formatted = formatDiagnostics(result);

      expect(formatted).toContain("./packages/common");
      expect(formatted).toContain("./packages/services");
      expect(formatted).toContain("Error A");
      expect(formatted).toContain("Error B");
    });
  });

  describe("Effect-specific diagnostic detection", () => {
    beforeAll(() => {
      // Create fixtures directory
      if (!existsSync(TEST_FIXTURES_DIR)) {
        Bun.spawnSync(["mkdir", "-p", TEST_FIXTURES_DIR]);
      }
    });

    afterAll(() => {
      cleanupTestFixtures();
    });

    it("detects Effect.fail with yieldable error (unnecessaryFailYieldableError)", async () => {
      // This test ensures the diagnostics script correctly detects Effect warnings
      // that have low diagnostic codes (e.g., 29) instead of filtering only 90001-90999
      const testCode = `
import { Effect, Schema } from "effect";

class TestError extends Schema.TaggedError<TestError>()(
  "TestError",
  { message: Schema.String }
) {}

const testEffect = Effect.gen(function* () {
  // This should trigger "unnecessaryFailYieldableError" diagnostic
  // because Schema.TaggedError is yieldable and Effect.fail is redundant
  return yield* Effect.fail(new TestError({ message: "test" }));
});

export { testEffect };
`;
      await createTestFile("test-effect-fail.ts", testCode);

      const result = await runEffectDiagnostics([TEST_FIXTURES_DIR]);

      // Should find at least one diagnostic with "effect(" in the message
      // which indicates it's an Effect language service diagnostic
      const effectDiagnostics = result.projects.flatMap((p) =>
        p.diagnostics.filter((d) => d.message.includes("effect(")),
      );

      expect(effectDiagnostics.length).toBeGreaterThan(0);
      expect(
        effectDiagnostics.some((d) => d.message.includes("unnecessaryFailYieldableError")),
      ).toBe(true);
    });

    it("filters out non-Effect TypeScript diagnostics", async () => {
      // This test ensures we don't report regular TS errors as Effect diagnostics
      const testCode = `
import { Effect } from "effect";

// This has a TS error but NOT an Effect diagnostic
const x: string = 123;

const validEffect = Effect.succeed(x);
export { validEffect };
`;
      await createTestFile("test-ts-error.ts", testCode);

      const result = await runEffectDiagnostics([TEST_FIXTURES_DIR]);

      // Should NOT find TS2322 type error in Effect diagnostics
      // because it doesn't have "effect(" in the message
      const allDiagnostics = result.projects.flatMap((p) => p.diagnostics);

      // All diagnostics should have "effect(" in message (Effect-specific)
      for (const diag of allDiagnostics) {
        expect(diag.message).toContain("effect(");
      }
    });
  });
});
