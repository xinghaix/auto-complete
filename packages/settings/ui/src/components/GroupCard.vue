<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { measureSharedLabelWidth } from "../utils/helpers";

const props = defineProps<{
  title: string;
  measureKey?: string | number;
}>();

const cardRef = ref<HTMLElement | null>(null);
let raf = 0;
let ro: ResizeObserver | null = null;

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (cardRef.value) measureSharedLabelWidth(cardRef.value);
  });
}

onMounted(() => {
  schedule();
  if (typeof ResizeObserver !== "undefined" && cardRef.value) {
    ro = new ResizeObserver(schedule);
    ro.observe(cardRef.value);
  }
  window.addEventListener("resize", schedule);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  window.removeEventListener("resize", schedule);
});

watch(
  () => [props.measureKey, props.title],
  async () => {
    await nextTick();
    schedule();
  },
);
</script>

<template>
  <div class="group">
    <h2 class="group-title">{{ title }}</h2>
    <div ref="cardRef" class="group-card">
      <div v-if="$slots.toolbar" class="toolbar">
        <slot name="toolbar" />
      </div>
      <slot />
    </div>
  </div>
</template>
