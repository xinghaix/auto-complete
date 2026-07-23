<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useFloatingMenu } from "../composables/useFloatingMenu";
import CaretIcon from "./CaretIcon.vue";

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

const query = ref(props.modelValue);
const { open, triggerRef, menuRef, menuStyle, openMenu, close, toggle } = useFloatingMenu({
  maxMenuHeight: 260,
});

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

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  query.value = v;
  emit("update:modelValue", v);
}

function pick(id: string, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  query.value = id;
  emit("update:modelValue", id);
  close();
}

async function onToggle(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (props.disabled) return;
  if (menuIds.value.length === 0) {
    close();
    return;
  }
  await toggle();
}

async function onArrowOpen() {
  if (props.disabled) return;
  if (menuIds.value.length > 0) await openMenu();
}

function onFetch(e: MouseEvent) {
  e.preventDefault();
  if (props.disabled || props.fetching) return;
  emit("fetch");
}
</script>

<template>
  <div class="model-combo-wrap">
    <div
      ref="triggerRef"
      class="model-combo"
      :class="{ open, disabled }"
    >
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
        @keydown.arrow-down.prevent="onArrowOpen"
        @keydown.escape.prevent="close()"
      />
      <button
        type="button"
        class="model-combo-toggle"
        :disabled="disabled"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        @mousedown="onToggle"
      >
        <CaretIcon />
      </button>
    </div>
    <Teleport to="body">
      <ul
        v-if="open && menuIds.length"
        ref="menuRef"
        class="floating-menu model-combo-menu"
        role="listbox"
        :style="menuStyle"
      >
        <li
          v-for="id in menuIds"
          :key="id"
          role="option"
          :aria-selected="id === modelValue"
        >
          <button
            type="button"
            class="floating-menu-item"
            :class="{ active: id === modelValue }"
            @mousedown="pick(id, $event)"
          >
            {{ id }}
          </button>
        </li>
      </ul>
    </Teleport>
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
