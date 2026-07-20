<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  label: string;
  help?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();
</script>

<template>
  <div class="row full">
    <label class="check">
      <input
        type="checkbox"
        :checked="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span class="check-text">
        <strong>{{ label }}</strong>
        <span v-if="help" class="row-help">{{ help }}</span>
      </span>
    </label>
  </div>
</template>
