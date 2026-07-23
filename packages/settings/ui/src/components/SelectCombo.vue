<script setup lang="ts">
/**
 * Custom listbox for JCEF + Webview.
 *
 * Native <select> is unreliable under JCEF when any ancestor clips overflow
 * (tool-window `.scroll`, cards). Absolute in-row menus also paint under the
 * next property rows. Teleport + fixed positioning is the durable fix.
 */
import { computed } from "vue";
import { useFloatingMenu } from "../composables/useFloatingMenu";
import CaretIcon from "./CaretIcon.vue";

export type SelectOption = { value: string; label: string };

const props = defineProps<{
  modelValue: string;
  options: SelectOption[];
  disabled?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const { open, triggerRef, menuRef, menuStyle, toggle, close } = useFloatingMenu({
  maxMenuHeight: 260,
});

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit?.label ?? props.modelValue ?? "";
});

async function onToggle(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (props.disabled) return;
  await toggle();
}

function pick(value: string, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  emit("update:modelValue", value);
  close();
}

function onTriggerKey(e: KeyboardEvent) {
  if (props.disabled) return;
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    void toggle();
  }
}
</script>

<template>
  <div class="select-combo" :class="{ open, disabled }">
    <button
      ref="triggerRef"
      type="button"
      class="select-combo-trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @mousedown="onToggle"
      @keydown="onTriggerKey"
    >
      <span class="select-combo-label">{{ selectedLabel }}</span>
      <span class="select-combo-caret" aria-hidden="true"><CaretIcon /></span>
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        ref="menuRef"
        class="floating-menu select-combo-menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <li
          v-for="o in options"
          :key="o.value"
          role="option"
          :aria-selected="o.value === modelValue"
        >
          <button
            type="button"
            class="floating-menu-item"
            :class="{ active: o.value === modelValue }"
            @mousedown="pick(o.value, $event)"
          >
            {{ o.label }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
