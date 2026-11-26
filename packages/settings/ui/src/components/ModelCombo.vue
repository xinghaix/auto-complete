<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useFloatingMenu } from "../composables/useFloatingMenu";
import type { ModelOption } from "../types";
import { formatContextLength } from "../utils/helpers";
import CaretIcon from "./CaretIcon.vue";

const props = defineProps<{
  modelValue: string;
  /** Remote model options from listModels (with optional contextLength). */
  options: Array<ModelOption | string>;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputId?: string;
  fetching?: boolean;
  fetchLabel: string;
  fetchingLabel: string;
  emptyHint?: string;
  noMatchHint?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  fetch: [];
}>();

const baseId = useId();
const listboxId = `${baseId}-listbox`;
const inputRef = ref<HTMLInputElement | null>(null);
const toggleRef = ref<HTMLButtonElement | null>(null);
const query = ref(props.modelValue);
const filterActive = ref(false);
const activeIndex = ref(-1);

const { open, triggerRef, menuRef, menuStyle, openMenu, close } = useFloatingMenu({
  maxMenuHeight: 260,
  onClose: () => {
    activeIndex.value = -1;
    filterActive.value = false;
  },
});

watch(
  () => props.modelValue,
  (v) => {
    if (v !== query.value) query.value = v;
  },
);

const normalizedOptions = computed<ModelOption[]>(() => {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const item of props.options) {
    const id = (typeof item === "string" ? item : item.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      contextLength: typeof item === "string" ? null : item.contextLength ?? null,
    });
  }
  return out;
});

const visibleOptions = computed<ModelOption[]>(() => {
  if (!filterActive.value) return normalizedOptions.value;
  const q = query.value.trim().toLowerCase();
  if (!q) return normalizedOptions.value;
  return normalizedOptions.value.filter((m) => m.id.toLowerCase().includes(q));
});

const activeDescendantId = computed(() =>
  open.value && activeIndex.value >= 0 && activeIndex.value < visibleOptions.value.length
    ? `${baseId}-opt-${activeIndex.value}`
    : undefined,
);

function scrollActiveIntoView() {
  void nextTick(() => {
    if (!menuRef.value || activeIndex.value < 0) return;
    const item = menuRef.value.querySelectorAll<HTMLElement>(".floating-menu-item")[activeIndex.value];
    item?.scrollIntoView({ block: "nearest" });
  });
}

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  query.value = v;
  emit("update:modelValue", v);
  if (normalizedOptions.value.length > 0) {
    filterActive.value = true;
    activeIndex.value = 0;
    if (!open.value) void openMenu();
  }
}

function pick(id: string) {
  query.value = id;
  filterActive.value = false;
  emit("update:modelValue", id);
  close();
  inputRef.value?.focus();
}

async function openFullList() {
  if (props.disabled) return;
  filterActive.value = false;
  const idx = normalizedOptions.value.findIndex((o) => o.id === props.modelValue);
  activeIndex.value = idx >= 0 ? idx : normalizedOptions.value.length > 0 ? 0 : -1;
  await openMenu();
  scrollActiveIntoView();
}

async function onToggleClick() {
  if (props.disabled) return;
  if (open.value) close();
  else await openFullList();
}

function onInputKey(e: KeyboardEvent) {
  if (props.disabled) return;
  const list = visibleOptions.value;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) {
      void openFullList();
    } else if (list.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % list.length;
      scrollActiveIntoView();
    }
    return;
  }

  if (e.key === "ArrowUp" && open.value && list.length > 0) {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
    scrollActiveIntoView();
    return;
  }

  if (e.key === "Home" && open.value && list.length > 0) {
    e.preventDefault();
    activeIndex.value = 0;
    scrollActiveIntoView();
    return;
  }

  if (e.key === "End" && open.value && list.length > 0) {
    e.preventDefault();
    activeIndex.value = list.length - 1;
    scrollActiveIntoView();
    return;
  }

  if (e.key === "Enter" && open.value && activeIndex.value >= 0 && list[activeIndex.value]) {
    e.preventDefault();
    pick(list[activeIndex.value].id);
    return;
  }

  if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
    return;
  }

  if (e.key === "Tab" && open.value) {
    close();
  }
}

function onToggleKey(e: KeyboardEvent) {
  if (props.disabled) return;
  const list = visibleOptions.value;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) void openFullList();
    else if (list.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % list.length;
      scrollActiveIntoView();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) void openFullList();
    else if (list.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
      scrollActiveIntoView();
    }
  } else if (e.key === "Home" && open.value && list.length > 0) {
    e.preventDefault();
    activeIndex.value = 0;
    scrollActiveIntoView();
  } else if (e.key === "End" && open.value && list.length > 0) {
    e.preventDefault();
    activeIndex.value = list.length - 1;
    scrollActiveIntoView();
  } else if ((e.key === "Enter" || e.key === " ") && open.value && list[activeIndex.value]) {
    e.preventDefault();
    pick(list[activeIndex.value].id);
  } else if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
    toggleRef.value?.focus();
  } else if (e.key === "Tab" && open.value) {
    close();
  }
}

function onFetchClick() {
  if (props.disabled || props.fetching) return;
  emit("fetch");
}
</script>

<template>
  <div class="model-combo-wrap">
    <div ref="triggerRef" class="model-combo" :class="{ open, disabled }">
      <input
        :id="inputId"
        ref="inputRef"
        type="text"
        class="model-combo-input"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="open ? listboxId : undefined"
        :aria-activedescendant="activeDescendantId"
        :value="query"
        :disabled="disabled"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        spellcheck="false"
        autocomplete="off"
        @input="onInput"
        @keydown="onInputKey"
      />
      <button
        ref="toggleRef"
        type="button"
        class="model-combo-toggle"
        :disabled="disabled"
        :title="normalizedOptions.length === 0 ? emptyHint : undefined"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        @click="onToggleClick"
        @keydown="onToggleKey"
      >
        <CaretIcon />
      </button>
    </div>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listboxId"
        ref="menuRef"
        class="floating-menu model-combo-menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <template v-if="visibleOptions.length > 0">
          <li
            v-for="(m, idx) in visibleOptions"
            :id="`${baseId}-opt-${idx}`"
            :key="m.id"
            role="option"
            :aria-selected="m.id === modelValue"
          >
            <button
              type="button"
              tabindex="-1"
              class="floating-menu-item model-combo-option"
              :class="{
                active: m.id === modelValue,
                highlighted: idx === activeIndex,
              }"
              @mouseenter="activeIndex = idx"
              @click="pick(m.id)"
            >
              <span class="model-combo-option-id">{{ m.id }}</span>
              <span v-if="formatContextLength(m.contextLength)" class="model-ctx-badge">
                {{ formatContextLength(m.contextLength) }}
              </span>
            </button>
          </li>
        </template>
        <li v-else class="floating-menu-empty" role="presentation">
          {{ normalizedOptions.length === 0 ? (emptyHint || "—") : (noMatchHint || "—") }}
        </li>
      </ul>
    </Teleport>
    <button
      type="button"
      class="btn btn-secondary model-fetch-btn"
      :disabled="disabled || fetching"
      :aria-busy="fetching"
      @click="onFetchClick"
    >
      {{ fetching ? fetchingLabel : fetchLabel }}
    </button>
  </div>
</template>
