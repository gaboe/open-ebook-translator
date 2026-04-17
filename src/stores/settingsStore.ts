import { createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { type ProviderId, type Language, getDefaultModel, BROWSER_PROVIDERS } from "../config/catalog";

export interface SettingsState {
  provider: ProviderId;
  language: Language;
  models: Record<ProviderId, string>;
  apiKeys: {
    openrouter: string;
    openai: string;
  };
  baseUrls: {
    lmstudio: string;
    openai: string;
    openrouter: string;
  };
}

const DEFAULT_SETTINGS: SettingsState = {
  provider: "webllm",
  language: "Slovak",
  models: {
    webllm: getDefaultModel("webllm"),
    openrouter: getDefaultModel("openrouter"),
    openai: getDefaultModel("openai"),
    lmstudio: getDefaultModel("lmstudio"),
    opencode: getDefaultModel("opencode"),
  },
  apiKeys: {
    openrouter: "",
    openai: "",
  },
  baseUrls: {
    lmstudio: "http://localhost:3500/v1",
    openai: "",
    openrouter: "",
  },
};

function loadSettings(): SettingsState {
  try {
    if (typeof localStorage === "undefined") return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    const stored = localStorage.getItem("epub-translator-settings");
    if (!stored) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    const parsed = JSON.parse(stored);

    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      models: { ...DEFAULT_SETTINGS.models, ...parsed.models },
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...parsed.apiKeys },
      baseUrls: { ...DEFAULT_SETTINGS.baseUrls, ...parsed.baseUrls },
    };

    if (!(merged.provider in BROWSER_PROVIDERS)) {
      merged.provider = DEFAULT_SETTINGS.provider;
    }

    return merged;
  } catch (e) {
    console.error("Failed to load settings:", e);
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

const [settings, setSettings] = createStore<SettingsState>(loadSettings());

// Persist on change
createEffect(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("epub-translator-settings", JSON.stringify(settings));
  }
});

export const updateProvider = (provider: ProviderId) => {
  setSettings("provider", provider);
};

export const updateLanguage = (language: Language) => {
  setSettings("language", language);
};

export const updateModel = (provider: ProviderId, model: string) => {
  setSettings("models", provider, model);
};

export const updateApiKey = (provider: "openrouter" | "openai", key: string) => {
  setSettings("apiKeys", provider, key);
};

export const updateBaseUrl = (provider: "lmstudio" | "openai" | "openrouter", url: string) => {
  setSettings("baseUrls", provider, url);
};

export const resetSettings = () => {
  setSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
};

export { settings };
