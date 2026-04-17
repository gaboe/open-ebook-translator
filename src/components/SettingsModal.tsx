import { onMount, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import ProviderSettingsPanel from "./ProviderSettingsPanel";
import LanguageSelect from "./LanguageSelect";
import { LANGUAGES } from "../config/catalog";
import { settings, updateLanguage } from "../stores/settingsStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onWebLLMDownload?: () => void;
  webLLMDownloadPct?: number;
  webLLMDownloaded?: boolean;
}

export default function SettingsModal(props: Props) {
  // eslint-disable-next-line no-unassigned-vars
  let modalRef: HTMLDivElement | undefined;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) {
      props.onClose();
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="modal-backdrop" onClick={props.onClose}>
          <div ref={modalRef} class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Settings</h2>
              <button class="btn-icon" onClick={props.onClose}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div class="modal-body">
              <div class="settings-section">
                <h3>Translation</h3>
                <div class="settings-field">
                  <label>Target Language</label>
                  <LanguageSelect
                    languages={LANGUAGES}
                    selected={settings.language}
                    onSelect={updateLanguage}
                  />
                </div>
              </div>

              <div class="settings-section">
                <h3>Provider Configuration</h3>
                <ProviderSettingsPanel
                  onWebLLMDownload={props.onWebLLMDownload}
                  webLLMDownloadPct={props.webLLMDownloadPct}
                  webLLMDownloaded={props.webLLMDownloaded}
                />
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
