import { For } from "solid-js";
import { PROVIDERS, type ProviderId } from "../config/catalog";
import { settings, updateProvider } from "../stores/settingsStore";

export default function ProviderSelect() {
  return (
    <div class="card">
      <div class="card-label">Provider</div>
      <div class="select-wrap">
        <select
          value={settings.provider}
          onChange={(e) => updateProvider(e.currentTarget.value as ProviderId)}
        >
          <For each={Object.values(PROVIDERS)}>
            {(provider) => <option value={provider.id}>{provider.name}</option>}
          </For>
        </select>
      </div>
    </div>
  );
}
