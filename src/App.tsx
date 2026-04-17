import { createSignal, Show } from "solid-js";
import { translate, SubmitKind } from "./index";
import LanguageSelect from "./components/LanguageSelect";
import FileDrop from "./components/FileDrop";
import TranslateButton from "./components/TranslateButton";
import ProviderSelect from "./components/ProviderSelect";
import SettingsModal from "./components/SettingsModal";
import TranslationLog, { type LogEntry } from "./components/TranslationLog";
import { settings, updateLanguage } from "./stores/settingsStore";
import { createProvider } from "./providers/factory";
import { LANGUAGES } from "./config/catalog";
import type { WebLLMProvider } from "./types";

export default function App() {
  const [file, setFile] = createSignal<File | null>(null);
  const [providerInstance, setProviderInstance] = createSignal<WebLLMProvider | null>(null);

  // WebLLM specific state (persisted separately as it's environment-dependent)
  const [downloaded, setDownloaded] = createSignal(
    localStorage.getItem("modelDownloaded") === "true",
  );
  const [downloadPct, setDownloadPct] = createSignal(0);

  const [transPct, setTransPct] = createSignal(0);
  const [status, setStatus] = createSignal("");
  const [statusType, setStatusType] = createSignal<"info" | "error" | "success" | "">("");
  const [translating, setTranslating] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [logEntries, setLogEntries] = createSignal<LogEntry[]>([]);

  const handleDownload = async () => {
    try {
      setStatus("Downloading model...");
      setStatusType("info");
      setDownloadPct(0);

      const p = createProvider({
        providerId: "webllm",
        model: settings.models.webllm,
        initProgressCallback: (progress) => {
          console.log("Download progress:", Math.round(progress * 100) + "%");
          setDownloadPct(Math.round(progress * 100));
        },
      });

      console.log("Initializing WebLLM...");
      await p.initialize();
      console.log("WebLLM initialized");

      setProviderInstance(p);
      setDownloaded(true);
      localStorage.setItem("modelDownloaded", "true");
      setStatus("Model ready");
      setStatusType("success");

      // Auto-close settings if open
      // setSettingsOpen(false);
    } catch (e: any) {
      console.error("WebLLM init failed:", e);
      setStatus(e.message || "Download failed");
      setStatusType("error");
      setDownloadPct(0);
    }
  };

  const handleTranslate = async () => {
    const f = file();
    if (!f) return;

    // Use existing instance if available and matching current settings,
    // or create new one.
    // For simplicity, we recreate for non-WebLLM providers to ensure settings apply.
    // For WebLLM, we try to reuse if initialized.

    let p = providerInstance();
    const currentProviderId = settings.provider;

    if (currentProviderId !== "webllm" || !p) {
      try {
        p = createProvider({
          providerId: currentProviderId,
          model: settings.models[currentProviderId],
          apiKey:
            currentProviderId === "openai"
              ? settings.apiKeys.openai
              : currentProviderId === "openrouter"
                ? settings.apiKeys.openrouter
                : undefined,
          baseUrl:
            currentProviderId === "lmstudio"
              ? settings.baseUrls.lmstudio
              : currentProviderId === "openai"
                ? settings.baseUrls.openai
                : currentProviderId === "openrouter"
                  ? settings.baseUrls.openrouter
                  : undefined,
        });

        // Non-WebLLM providers might need init, but usually it's lightweight
        // WebLLM needs init for sure if not already done
        if (currentProviderId === "webllm") {
          // Should have been downloaded already via settings
          await p.initialize();
        } else {
          await p.initialize();
        }
        setProviderInstance(p);
      } catch (e: any) {
        setStatus(e.message || "Provider init failed");
        setStatusType("error");
        return;
      }
    }

    setTranslating(true);
    setTransPct(0);
    setLogEntries([]);
    setStatus("Translating...");
    setStatusType("info");

    try {
      const buffer = await f.arrayBuffer();
      console.log("Starting translation with provider:", currentProviderId);

      const result = await translate({
        source: buffer,
        targetLanguage: settings.language,
        submit: SubmitKind.APPEND_BLOCK,
        provider: p,
        maxGroupTokens: 1000,
        onProgress: (prog) => {
          console.log("Translation progress:", Math.round(prog * 100) + "%");
          setTransPct(Math.round(prog * 100));
        },
        onChunkTranslated: (chapterIndex, chunkIndex, original, translated) => {
          setLogEntries((prev) => {
            const newEntry: LogEntry = {
              id: `${chapterIndex}-${chunkIndex}-${Date.now()}`,
              chapter: chapterIndex,
              chunk: chunkIndex,
              original,
              translated,
            };
            return [...prev, newEntry].slice(-50);
          });
        },
      });
      console.log("Translation complete:", result.stats);

      const blob = new Blob([result.epub], { type: "application/epub+zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name.replace(".epub", `.${settings.language.toLowerCase()}.epub`);
      a.click();
      URL.revokeObjectURL(url);

      setStatus(
        `Done! ${result.stats.chaptersTranslated} chapters · ${result.stats.totalTokens} tokens`,
      );
      setStatusType("success");
    } catch (e: any) {
      setStatus(e.message || "Failed");
      setStatusType("error");
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div class="container">
      <header>
        <div class="header-row">
          <div style={{ width: "36px" }}></div> {/* spacer for centering */}
          <div class="header-center">
            <h1>EPUB Translator</h1>
            <p class="tagline">Private · In-browser AI</p>
          </div>
          <button class="btn-icon" onClick={() => setSettingsOpen(true)} title="Settings">
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
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen()}
        onClose={() => setSettingsOpen(false)}
        onWebLLMDownload={handleDownload}
        webLLMDownloadPct={downloadPct()}
        webLLMDownloaded={downloaded()}
      />

      <div class="row">
        <ProviderSelect />
        <LanguageSelect
          languages={LANGUAGES}
          selected={settings.language}
          onSelect={updateLanguage}
        />
      </div>

      <FileDrop file={file()} onFile={setFile} />

      <TranslateButton
        disabled={!file() || translating() || (settings.provider === "webllm" && !downloaded())}
        loading={translating()}
        progress={transPct()}
        onClick={handleTranslate}
      />

      <Show when={logEntries().length > 0 || translating()}>
        <TranslationLog entries={logEntries()} />
      </Show>

      <Show when={settings.provider === "webllm" && !downloaded() && !translating()}>
        <div style={{ "text-align": "center", "margin-top": "8px" }}>
          <p class="hint">
            WebLLM model needs to be downloaded first. Open Settings ⚙️ to download.
          </p>
        </div>
      </Show>

      <Show when={status()}>
        <div class={`status ${statusType()}`}>{status()}</div>
      </Show>

      <footer>
        Made by{" "}
        <a href="https://github.com/gaboe" target="_blank">
          gaboe
        </a>
      </footer>
    </div>
  );
}
