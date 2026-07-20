<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  /** Remote model ids from listModels (shown in full; no text filter). */
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  fetching?: boolean;
  fetchLabel: string;
  fetchingLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  fetch: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const query = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => {
    if (v !== query.value) query.value = v;
  },
);

/** Full list for the menu — no filtering against the input. */
const menuIds = computed(() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of props.options) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
});

function onDoc(ev: MouseEvent) {
  const t = ev.target as Node | null;
  if (rootRef.value && t && !rootRef.value.contains(t)) open.value = false;
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === "Escape") open.value = false;
}

watch(open, (v) => {
  if (v) {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  } else {
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  }
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  query.value = v;
  emit("update:modelValue", v);
}

function pick(id: string, e: MouseEvent) {
  e.preventDefault();
  query.value = id;
  emit("update:modelValue", id);
  open.value = false;
}

function toggleMenu(e: MouseEvent) {
  e.preventDefault();
  if (props.disabled) return;
  open.value = !open.value;
}

function openMenu() {
  if (props.disabled) return;
  if (menuIds.value.length > 0) open.value = true;
}

function onFetch(e: MouseEvent) {
  e.preventDefault();
  if (props.disabled || props.fetching) return;
  emit("fetch");
}
</script>

<template>
  <div class="model-combo-wrap">
    <div ref="rootRef" class="model-combo" :class="{ open, disabled }">
      <input
        type="text"
        class="model-combo-input"
        :value="query"
        :disabled="disabled"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        spellcheck="false"
        autocomplete="off"
        @input="onInput"
        @keydown.arrow-down.prevent="openMenu"
        @keydown.escape.prevent="open = false"
      />
      <button
        type="button"
        class="model-combo-toggle"
        :disabled="disabled"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        @mousedown="toggleMenu"
      >
        ▾
      </button>
      <ul v-if="open && menuIds.length" class="model-combo-menu" role="listbox">
        <li
          v-for="id in menuIds"
          :key="id"
          role="option"
          :aria-selected="id === modelValue"
        >
          <button
            type="button"
            :class="{ active: id === modelValue }"
            @mousedown="pick(id, $event)"
          >
            {{ id }}
          </button>
        </li>
      </ul>
    </div>
    <button
      type="button"
      class="btn btn-secondary model-fetch-btn"
      :disabled="disabled || fetching"
      @mousedown="onFetch"
    >
      {{ fetching ? fetchingLabel : fetchLabel }}
    </button>
  </div>
</template>
