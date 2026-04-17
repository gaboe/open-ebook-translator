import { describe, it, expect, beforeEach } from "vitest";
import {
  updateProvider,
  settings,
  resetSettings,
  updateApiKey,
  updateModel,
  updateLanguage,
} from "./settingsStore";

// Simple mock for localStorage if not present (Node env)
if (typeof localStorage === "undefined") {
  const store: Record<string, string> = {};
  global.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      for (const key in store) delete store[key];
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    length: 0,
    key: () => null,
  };
}

describe("settingsStore", () => {
  beforeEach(() => {
    resetSettings();
  });

  it("updates provider", () => {
    updateProvider("openai");
    expect(settings.provider).toBe("openai");
  });

  it("updates language", () => {
    updateLanguage("Spanish");
    expect(settings.language).toBe("Spanish");
  });

  it("updates model for specific provider", () => {
    updateModel("openai", "gpt-4");
    expect(settings.models.openai).toBe("gpt-4");
    // Should not affect other providers
    expect(settings.models.webllm).not.toBe("gpt-4");
  });

  it("updates api key", () => {
    updateApiKey("openai", "sk-test-123");
    expect(settings.apiKeys.openai).toBe("sk-test-123");
  });

  it("resets to defaults", () => {
    updateProvider("openai");
    updateLanguage("French");
    resetSettings();
    expect(settings.provider).toBe("webllm"); // default
    expect(settings.language).toBe("Slovak"); // default
  });
});
