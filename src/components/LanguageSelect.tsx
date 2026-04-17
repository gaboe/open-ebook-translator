import { For } from "solid-js";

interface Props {
  languages: readonly string[];
  selected: string;
  onSelect: (l: any) => void;
}

export default function LanguageSelect(props: Props) {
  return (
    <div class="card">
      <div class="card-label">Translate To</div>
      <div class="select-wrap">
        <select value={props.selected} onChange={(e) => props.onSelect(e.target.value)}>
          <For each={props.languages}>{(l) => <option value={l}>{l}</option>}</For>
        </select>
      </div>
    </div>
  );
}
