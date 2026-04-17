import { createEffect, For } from "solid-js";

export interface LogEntry {
  id: string;
  chapter: number;
  chunk: number;
  original: string;
  translated: string;
}

interface Props {
  entries: LogEntry[];
}

export default function TranslationLog(props: Props) {
  // eslint-disable-next-line no-unassigned-vars
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    // Track length to trigger scroll
    // eslint-disable-next-line no-unused-expressions
    props.entries.length;
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  });

  return (
    <div class="card translation-log">
      <div class="card-label">Live Preview</div>
      <div ref={containerRef} class="log-container">
        <For each={props.entries}>
          {(entry) => (
            <div class="log-entry">
              <div class="log-meta">
                Chapter {entry.chapter + 1} · Chunk {entry.chunk + 1}
              </div>
              <div class="log-content">
                <div class="log-original" title={entry.original}>
                  {entry.original.substring(0, 150)}
                  {entry.original.length > 150 ? "..." : ""}
                </div>
                <div class="log-arrow">↓</div>
                <div class="log-translated">{entry.translated}</div>
              </div>
            </div>
          )}
        </For>
        {props.entries.length === 0 && <div class="log-empty">Waiting for translation...</div>}
      </div>
    </div>
  );
}
