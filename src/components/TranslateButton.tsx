import { Show } from "solid-js";

interface Props {
  disabled: boolean;
  loading: boolean;
  progress: number;
  onClick: () => void;
}

export default function TranslateButton(props: Props) {
  return (
    <div class="card">
      <button class="btn" disabled={props.disabled || props.loading} onClick={props.onClick}>
        <Show when={props.loading} fallback="Translate">
          <span class="spinner"></span>
        </Show>
      </button>

      <Show when={props.progress > 0}>
        <div class="progress">
          <div class="progress-label">
            <span>Translating</span>
            <span>{props.progress}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style={{ width: `${props.progress}%` }}></div>
          </div>
        </div>
      </Show>
    </div>
  );
}
