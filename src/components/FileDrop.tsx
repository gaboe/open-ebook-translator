import { Show } from "solid-js";

interface Props {
  file: File | null;
  onFile: (f: File) => void;
}

export default function FileDrop(props: Props) {
  // eslint-disable-next-line no-unassigned-vars
  let inputRef: HTMLInputElement | undefined;

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f?.name.endsWith(".epub")) props.onFile(f);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleClick = () => inputRef?.click();

  const handleChange = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) props.onFile(f);
  };

  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + " MB";

  return (
    <div class="card">
      <div class="card-label">Book</div>

      <Show
        when={!props.file}
        fallback={
          <div class="file-info">
            <div class="file-info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <div class="file-info-details">
              <div class="file-info-name">{props.file!.name}</div>
              <div class="file-info-size">{formatSize(props.file!.size)}</div>
            </div>
            <button class="file-remove" onClick={() => props.onFile(null as any)}>
              ✕
            </button>
          </div>
        }
      >
        <div
          class="drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleClick}
        >
          <div class="drop-zone-text">Drop EPUB or click</div>
          <div class="drop-zone-hint">.epub</div>
        </div>
      </Show>

      <input ref={inputRef} type="file" accept=".epub" hidden onChange={handleChange} />
    </div>
  );
}
