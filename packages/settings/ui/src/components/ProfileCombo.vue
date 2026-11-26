<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
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

const baseId = useId();
const listboxId = `${baseId}-listbox`;
const inputRef = ref<HTMLInputElement | null>(null);
const toggleRef = ref<HTMLButtonElement | null>(null);
const activeIndex = ref(-1);

const { open, triggerRef, menuRef, menuStyle, close, openMenu } = useFloatingMenu({
  maxMenuHeight: 260,
  onClose: () => {
    activeIndex.value = -1;
  },
});

const selectedIndex = computed(() =>
  props.options.findIndex((p) => p.id === props.modelValue),
);

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

async function onToggleClick() {
  if (props.disabled || props.options.length === 0) return;
  if (open.value) {
    close();
  } else {
    emit("commitRename");
    const start = selectedIndex.value >= 0 ? selectedIndex.value : 0;
    await openAt(start);
  }
}

function pick(id: string) {
  close();
  emit("select", id);
  inputRef.value?.focus();
}

function onInput(e: Event) {
  emit("update:renameValue", (e.target as HTMLInputElement).value);
}

function onInputKey(e: KeyboardEvent) {
  const len = props.options.length;
  if (e.key === "ArrowDown" && len > 0) {
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
  if (e.key === "ArrowUp" && len > 0 && open.value) {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + len) % len;
    scrollActiveIntoView();
    return;
  }
  if (e.key === "Home" && open.value && len > 0) {
    e.preventDefault();
    activeIndex.value = 0;
    scrollActiveIntoView();
    return;
  }
  if (e.key === "End" && open.value && len > 0) {
    e.preventDefault();
    activeIndex.value = len - 1;
    scrollActiveIntoView();
    return;
  }
  if (e.key === "Enter" && open.value && activeIndex.value >= 0) {
    e.preventDefault();
    const target = props.options[activeIndex.value];
    if (target) pick(target.id);
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
  emit("renameKeydown", e);
}

function onToggleKey(e: KeyboardEvent) {
  if (props.disabled || props.options.length === 0) return;
  const len = props.options.length;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) void openAt(selectedIndex.value >= 0 ? selectedIndex.value : 0);
    else {
      activeIndex.value = (activeIndex.value + 1) % len;
      scrollActiveIntoView();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) void openAt(selectedIndex.value >= 0 ? selectedIndex.value : len - 1);
    else {
      activeIndex.value = (activeIndex.value - 1 + len) % len;
      scrollActiveIntoView();
    }
  } else if (e.key === "Home" && open.value) {
    e.preventDefault();
    activeIndex.value = 0;
    scrollActiveIntoView();
  } else if (e.key === "End" && open.value) {
    e.preventDefault();
    activeIndex.value = len - 1;
    scrollActiveIntoView();
  } else if ((e.key === "Enter" || e.key === " ") && open.value && activeIndex.value >= 0) {
    e.preventDefault();
    const target = props.options[activeIndex.value];
    if (target) pick(target.id);
  } else if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
    toggleRef.value?.focus();
  } else if (e.key === "Tab" && open.value) {
    close();
  }
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
      ref="inputRef"
      type="text"
      class="profile-combo-input"
      role="combobox"
      aria-autocomplete="none"
      :aria-expanded="open"
      :aria-controls="open ? listboxId : undefined"
      :aria-activedescendant="activeDescendantId"
      :value="renameValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @blur="emit('commitRename')"
      @keydown="onInputKey"
    />
    <button
      ref="toggleRef"
      type="button"
      class="profile-combo-toggle"
      :disabled="disabled || options.length === 0"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="onToggleClick"
      @keydown="onToggleKey"
    >
      <CaretIcon />
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listboxId"
        ref="menuRef"
        class="floating-menu profile-combo-menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <li
          v-for="(p, idx) in options"
          :id="`${baseId}-opt-${idx}`"
          :key="p.id"
          role="option"
          :aria-selected="p.id === modelValue"
        >
          <button
            type="button"
            tabindex="-1"
            class="floating-menu-item"
            :class="{
              active: p.id === modelValue,
              highlighted: idx === activeIndex,
            }"
            @mouseenter="activeIndex = idx"
            @click="pick(p.id)"
          >
            {{ p.name }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
