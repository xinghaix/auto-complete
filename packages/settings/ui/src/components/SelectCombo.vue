<script setup lang="ts">
/**
 * Custom accessible listbox for JCEF + Webview.
 *
 * Uses @click (so keyboard Enter/Space works and right-click never triggers)
 * plus full ArrowDown/ArrowUp/Home/End/Enter/Space/Escape navigation and focus restore.
 */
import { computed, nextTick, ref, useId } from "vue";
import { useFloatingMenu } from "../composables/useFloatingMenu";
import CaretIcon from "./CaretIcon.vue";

export type SelectOption = { value: string; label: string };

const props = defineProps<{
  modelValue: string;
  options: SelectOption[];
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const baseId = useId();
const listboxId = `${baseId}-listbox`;
const activeIndex = ref(-1);

const { open, triggerRef, menuRef, menuStyle, openMenu, close } = useFloatingMenu({
  maxMenuHeight: 260,
  onClose: () => {
    activeIndex.value = -1;
  },
});

const selectedIndex = computed(() =>
  props.options.findIndex((o) => o.value === props.modelValue),
);

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit?.label ?? props.modelValue ?? "";
});

const activeDescendantId = computed(() =>
  open.value && activeIndex.value >= 0 && activeIndex.value < props.options.length
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

async function openAt(index: number) {
  if (props.disabled || props.options.length === 0) return;
  activeIndex.value = Math.max(0, Math.min(index, props.options.length - 1));
  await openMenu();
  scrollActiveIntoView();
}

async function onTriggerClick() {
  if (props.disabled) return;
  if (open.value) {
    close();
  } else {
    const initial = selectedIndex.value >= 0 ? selectedIndex.value : 0;
    await openAt(initial);
  }
}

function pick(value: string, restoreFocus = true) {
  emit("update:modelValue", value);
  close();
  if (restoreFocus) triggerRef.value?.focus();
}

function onTriggerKey(e: KeyboardEvent) {
  if (props.disabled) return;
  const len = props.options.length;
  if (len === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) {
      const start = selectedIndex.value >= 0 ? selectedIndex.value : 0;
      void openAt(start);
    } else {
      activeIndex.value = (activeIndex.value + 1) % len;
      scrollActiveIntoView();
    }
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) {
      const start = selectedIndex.value >= 0 ? selectedIndex.value : len - 1;
      void openAt(start);
    } else {
      activeIndex.value = (activeIndex.value - 1 + len) % len;
      scrollActiveIntoView();
    }
    return;
  }

  if (e.key === "Home" && open.value) {
    e.preventDefault();
    activeIndex.value = 0;
    scrollActiveIntoView();
    return;
  }

  if (e.key === "End" && open.value) {
    e.preventDefault();
    activeIndex.value = len - 1;
    scrollActiveIntoView();
    return;
  }

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (open.value) {
      const target = props.options[activeIndex.value];
      if (target) pick(target.value, true);
      else close();
    } else {
      const start = selectedIndex.value >= 0 ? selectedIndex.value : 0;
      void openAt(start);
    }
    return;
  }

  if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
    triggerRef.value?.focus();
    return;
  }

  if (e.key === "Tab" && open.value) {
    close();
  }
}
</script>

<template>
  <div class="select-combo" :class="{ open, disabled }">
    <button
      :id="id"
      ref="triggerRef"
      type="button"
      class="select-combo-trigger"
      role="combobox"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-activedescendant="activeDescendantId"
      @click="onTriggerClick"
      @keydown="onTriggerKey"
    >
      <span class="select-combo-label">{{ selectedLabel }}</span>
      <span class="select-combo-caret" aria-hidden="true"><CaretIcon /></span>
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listboxId"
        ref="menuRef"
        class="floating-menu select-combo-menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <li
          v-for="(o, idx) in options"
          :id="`${baseId}-opt-${idx}`"
          :key="o.value"
          role="option"
          :aria-selected="o.value === modelValue"
        >
          <button
            type="button"
            tabindex="-1"
            class="floating-menu-item"
            :class="{
              active: o.value === modelValue,
              highlighted: idx === activeIndex,
            }"
            @mouseenter="activeIndex = idx"
            @click="pick(o.value, true)"
          >
            {{ o.label }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
