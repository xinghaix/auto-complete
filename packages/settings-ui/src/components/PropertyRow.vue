<script setup lang="ts">
defineProps<{
  label: string;
  help?: string;
  required?: boolean;
  full?: boolean;
}>();
</script>

<template>
  <div class="row" :class="{ full }">
    <div v-if="!full" class="row-label">
      {{ label }}
      <span v-if="required" class="req">*</span>
    </div>
    <div class="row-control">
      <slot />
      <p v-if="help" class="row-help">{{ help }}</p>
    </div>
  </div>
</template>
