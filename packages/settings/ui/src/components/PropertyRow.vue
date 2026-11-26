<script setup lang="ts">
defineProps<{
  label: string;
  help?: string;
  required?: boolean;
  full?: boolean;
  inputId?: string;
  error?: string;
}>();
</script>

<template>
  <div class="row" :class="{ full, 'has-error': Boolean(error) }">
    <label v-if="!full && inputId" class="row-label" :for="inputId" :title="label">
      {{ label }}
      <span v-if="required" class="req" aria-hidden="true">*</span>
    </label>
    <div v-else-if="!full" class="row-label" :title="label">
      {{ label }}
      <span v-if="required" class="req" aria-hidden="true">*</span>
    </div>
    <div class="row-control">
      <slot />
      <p v-if="error" class="row-error" role="alert">{{ error }}</p>
      <p v-if="help" class="row-help">{{ help }}</p>
    </div>
  </div>
</template>
