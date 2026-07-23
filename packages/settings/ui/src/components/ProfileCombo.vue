<script setup lang="ts">
import { useFloatingMenu } from "../composables/useFloatingMenu";
import CaretIcon from "./CaretIcon.vue";

export type ProfileOption = { id: string; name: string };

const props = defineProps<{
  modelValue: string;
  options: ProfileOption[];
  renameValue: string;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:renameValue": [value: string];
  select: [id: string];
  commitRename: [];
  renameKeydown: [e: KeyboardEvent];
}>();

const { open, triggerRef, menuRef, menuStyle, toggle, close, openMenu } = useFloatingMenu({
  maxMenuHeight: 260,
});

async function onToggle(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (props.disabled || props.options.length === 0) return;
  await toggle();
}

function pick(id: string, e: Event) {
  e.preventDefault();
  e.stopPropagation();
  emit("select", id);
  close();
}

function onInput(e: Event) {
  emit("update:renameValue", (e.target as HTMLInputElement).value);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (props.options.length > 0) void openMenu();
  }
  emit("renameKeydown", e);
  if (e.key === "Escape") close();
}
</script>

<template>
  <div
    ref="triggerRef"
    class="profile-combo"
    :class="{ open }"
    role="group"
    :aria-label="ariaLabel"
  >
    <input
      type="text"
      class="profile-combo-input"
      :value="renameValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @blur="emit('commitRename')"
      @keydown="onKey"
    />
    <button
      type="button"
      class="profile-combo-toggle"
      :disabled="disabled || options.length === 0"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @mousedown="onToggle"
    >
      <CaretIcon />
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        ref="menuRef"
        class="floating-menu profile-combo-menu"
        role="listbox"
        :style="menuStyle"
      >
        <li
          v-for="p in options"
          :key="p.id"
          role="option"
          :aria-selected="p.id === modelValue"
        >
          <button
            type="button"
            class="floating-menu-item"
            :class="{ active: p.id === modelValue }"
            @mousedown="pick(p.id, $event)"
          >
            {{ p.name }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
