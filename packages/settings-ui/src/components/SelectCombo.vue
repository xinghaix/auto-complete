<script setup lang="ts">
/**
 * Native <select> for JCEF/Webview.
 * Custom absolute menus paint under following .row siblings (stacking);
 * OS-native listboxes are drawn above the page and avoid that.
 */
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

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLSelectElement).value);
}
</script>

<template>
  <select
    class="native-select"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @change="onChange"
  >
    <option v-for="o in options" :key="o.value" :value="o.value">
      {{ o.label }}
    </option>
  </select>
</template>
