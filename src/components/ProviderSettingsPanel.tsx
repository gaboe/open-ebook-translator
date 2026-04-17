import { createSignal, Show, For } from "solid-js";
import {
  settings,
  updateProvider,
  updateModel,
  updateApiKey,
  updateBaseUrl,
} from "../stores/settingsStore";
import { BROWSER_PROVIDERS, type ProviderId, getModelsForProvider } from "../config/catalog";

interface Props {
  onWebLLMDownload?: () => void;
  webLLMDownloadPct?: number;
  webLLMDownloaded?: boolean;
}

export default function ProviderSettingsPanel(props: Props) {
  const [showApiKey, setShowApiKey] = createSignal(false);

  const isDownloading = () =>
    (props.webLLMDownloadPct || 0) > 0 && (props.webLLMDownloadPct || 0) < 100;

  return (
    <div>
      <div class="provider-tabs">
        <For each={Object.values(BROWSER_PROVIDERS)}>
          {(provider) => (
            <button
              class={`provider-tab ${settings.provider === provider.id ? "active" : ""}`}
              onClick={() => updateProvider(provider.id as ProviderId)}
            >
              {provider.name}
            </button>
          )}
        </For>
      </div>

      <div class="settings-section">
        {/* Model Selection (if applicable) */}
        <Show when={settings.provider !== "opencode"}>
          <div class="settings-field">
            <label>Model</label>
            <Show
              when={settings.provider === "lmstudio"}
              fallback={
                <div class="select-wrap">
                  <select
                    value={settings.models[settings.provider] || ""}
                    onChange={(e) => updateModel(settings.provider, e.currentTarget.value)}
                  >
                    <For each={getModelsForProvider(settings.provider)}>
                      {(model) => (
                        <option value={model.id}>
                          {model.name} {"size" in model ? `(${model.size})` : ""}
                        </option>
                      )}
                    </For>
                  </select>
                </div>
              }
            >
              <input
                type="text"
                class="text-input"
                placeholder="e.g. meta-llama-3.1-8b-instruct"
                value={settings.models.lmstudio || ""}
                onInput={(e) => updateModel("lmstudio", e.currentTarget.value)}
              />
              <span class="field-hint">Enter the model ID loaded in LM Studio</span>
            </Show>
          </div>
        </Show>

        {/* WebLLM Download UI */}
        <Show when={settings.provider === "webllm"}>
          <div class="settings-field" style={{ "margin-top": "8px" }}>
            <Show when={!props.webLLMDownloaded && !isDownloading()}>
              <button class="btn-download" onClick={props.onWebLLMDownload}>
                Download Model
              </button>
              <span class="field-hint">Required for browser-based inference</span>
            </Show>

            <Show when={props.webLLMDownloaded}>
              <button class="btn-download" disabled>
                Model Ready ✓
              </button>
            </Show>

            <Show when={isDownloading()}>
              <div class="progress">
                <div class="progress-label">
                  <span>Downloading</span>
                  <span>{props.webLLMDownloadPct}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style={{ width: `${props.webLLMDownloadPct}%` }}></div>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* API Key (OpenAI / OpenRouter) */}
        <Show when={settings.provider === "openai" || settings.provider === "openrouter"}>
          <div class="settings-field">
            <label>API Key</label>
            <div class="api-key-group">
              <input
                type={showApiKey() ? "text" : "password"}
                class="text-input"
                placeholder="sk-..."
                value={
                  settings.provider === "openai"
                    ? settings.apiKeys.openai
                    : settings.apiKeys.openrouter
                }
                onInput={(e) =>
                  updateApiKey(settings.provider as "openai" | "openrouter", e.currentTarget.value)
                }
              />
              <button class="btn-toggle" onClick={() => setShowApiKey(!showApiKey())}>
                {showApiKey() ? "Hide" : "Show"}
              </button>
            </div>
            <span class="field-hint">
              {settings.provider === "openrouter"
                ? "Get key at openrouter.ai/keys"
                : "Get key at platform.openai.com/api-keys"}
            </span>
          </div>
        </Show>

        {/* Base URL (LM Studio / OpenAI / OpenRouter) */}
        <Show
          when={
            settings.provider === "lmstudio" ||
            settings.provider === "openai" ||
            settings.provider === "openrouter"
          }
        >
          <div class="settings-field">
            <label>Base URL</label>
            <input
              type="text"
              class="text-input"
              placeholder={settings.provider === "lmstudio" ? "http://localhost:3500/v1" : ""}
              value={
                settings.baseUrls[settings.provider as "lmstudio" | "openai" | "openrouter"] || ""
              }
              onInput={(e) =>
                updateBaseUrl(
                  settings.provider as "lmstudio" | "openai" | "openrouter",
                  e.currentTarget.value,
                )
              }
            />
            <span class="field-hint">Leave empty for default</span>
          </div>
        </Show>

        {/* Provider-specific hints */}
        <Show when={settings.provider === "opencode"}>
          <div class="field-hint" style={{ "margin-top": "8px" }}>
            Uses free MiniMax models via OpenCode.
          </div>
        </Show>
      </div>
    </div>
  );
}
