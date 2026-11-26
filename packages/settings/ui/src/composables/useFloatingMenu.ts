import { nextTick, onUnmounted, ref, type Ref } from "vue";

export type FloatingMenuStyle = {
  top?: string;
  bottom?: string;
  left: string;
  width: string;
  maxHeight: string;
};

export type RectLike = {
  top: number;
  left: number;
  right?: number;
  width: number;
  bottom: number;
};

export type FloatingMenuPlacement = {
  style: FloatingMenuStyle;
  placement: "below" | "above";
};

/**
 * Pure placement calculator for fixed-position floating menus.
 *
 * When opening below, anchors via `top`.
 * When flipping above, anchors via `bottom: ${vh - r.top + gap}px` so short
 * menus hug the top of the trigger instead of floating away by maxMenuHeight.
 */
export function computeFloatingMenuPlacement(opts: {
  trigger: RectLike;
  viewport: { width: number; height: number };
  preferBelow?: boolean;
  maxMenuHeight?: number;
  gap?: number;
}): FloatingMenuPlacement {
  const preferBelow = opts.preferBelow ?? true;
  const maxMenuHeight = opts.maxMenuHeight ?? 240;
  const gap = opts.gap ?? 4;
  const r = opts.trigger;
  const vw = opts.viewport.width;
  const vh = opts.viewport.height;
  const width = Math.max(r.width, 96);
  const spaceBelow = vh - r.bottom - gap - 8;
  const spaceAbove = r.top - gap - 8;
  const openBelow = preferBelow
    ? spaceBelow >= Math.min(120, maxMenuHeight) || spaceBelow >= spaceAbove
    : spaceAbove < spaceBelow;
  const available = Math.max(80, openBelow ? spaceBelow : spaceAbove);
  const height = Math.min(maxMenuHeight, available);

  let left = r.left;
  if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
  if (left < 8) left = 8;

  if (openBelow) {
    return {
      placement: "below",
      style: {
        top: `${Math.round(r.bottom + gap)}px`,
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        maxHeight: `${Math.round(height)}px`,
      },
    };
  }

  const bottom = Math.max(8, vh - r.top + gap);
  return {
    placement: "above",
    style: {
      bottom: `${Math.round(bottom)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.round(height)}px`,
    },
  };
}

/**
 * Returns false when the trigger anchor has scrolled outside the viewport or
 * its enclosing scroll container.
 */
export function isAnchorVisible(
  trigger: RectLike,
  viewport: { width: number; height: number },
  scrollContainer?: Pick<RectLike, "top" | "bottom" | "left" | "right"> | null,
): boolean {
  const right = trigger.right ?? trigger.left + trigger.width;
  if (
    trigger.bottom <= 0 ||
    trigger.top >= viewport.height ||
    right <= 0 ||
    trigger.left >= viewport.width
  ) {
    return false;
  }
  if (scrollContainer) {
    if (trigger.bottom <= scrollContainer.top || trigger.top >= scrollContainer.bottom) {
      return false;
    }
    if (
      typeof scrollContainer.right === "number" &&
      (right <= scrollContainer.left || trigger.left >= scrollContainer.right)
    ) {
      return false;
    }
  }
  return true;
}

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let cur = el.parentElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = typeof getComputedStyle === "function" ? getComputedStyle(cur) : null;
    if (style && /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Dropdown menu for JCEF + Webview.
 *
 * Native <select> popups are clipped or non-interactive under overflow
 * ancestors in JCEF. Absolute menus inside cards also clip under `.scroll`.
 * Teleport + position:fixed avoids both failure modes.
 */
export function useFloatingMenu(opts?: {
  /** Prefer opening below the trigger; flip above when space is tight. */
  preferBelow?: boolean;
  maxMenuHeight?: number;
  gap?: number;
  onClose?: () => void;
}) {
  const preferBelow = opts?.preferBelow ?? true;
  const maxMenuHeight = opts?.maxMenuHeight ?? 240;
  const gap = opts?.gap ?? 4;

  const open = ref(false);
  const triggerRef = ref<HTMLElement | null>(null);
  const menuRef = ref<HTMLElement | null>(null);
  const menuStyle = ref<FloatingMenuStyle>({
    top: "0px",
    left: "0px",
    width: "0px",
    maxHeight: `${maxMenuHeight}px`,
  });

  let docBound = false;

  function measure(): boolean {
    const el = triggerRef.value;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const container = findScrollContainer(el);
    const containerRect = container?.getBoundingClientRect() ?? null;
    if (!isAnchorVisible(r, viewport, containerRect)) {
      close();
      return false;
    }
    const { style } = computeFloatingMenuPlacement({
      trigger: r,
      viewport,
      preferBelow,
      maxMenuHeight,
      gap,
    });
    menuStyle.value = style;
    return true;
  }

  function onDocPointer(ev: Event) {
    const t = ev.target as Node | null;
    if (!t) return;
    if (triggerRef.value?.contains(t)) return;
    if (menuRef.value?.contains(t)) return;
    close();
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  function onViewportChange(ev?: Event) {
    if (!open.value) return;
    // Ignore internal scrolling inside the floating menu itself.
    if (ev && ev.target && menuRef.value?.contains(ev.target as Node)) return;
    measure();
  }

  function bindDoc() {
    if (docBound) return;
    docBound = true;
    // pointerdown captures outside clicks before focus moves; works in JCEF.
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onViewportChange);
    // Capture scroll from any ancestor (tool window body).
    window.addEventListener("scroll", onViewportChange, true);
  }

  function unbindDoc() {
    if (!docBound) return;
    docBound = false;
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
  }

  async function openMenu() {
    open.value = true;
    if (!measure()) return;
    await nextTick();
    if (!open.value) return;
    if (!measure()) return;
    bindDoc();
  }

  function close() {
    const wasOpen = open.value;
    open.value = false;
    unbindDoc();
    if (wasOpen) opts?.onClose?.();
  }

  async function toggle() {
    if (open.value) close();
    else await openMenu();
  }

  onUnmounted(() => {
    unbindDoc();
  });

  return {
    open: open as Ref<boolean>,
    triggerRef,
    menuRef,
    menuStyle: menuStyle as Ref<FloatingMenuStyle>,
    openMenu,
    close,
    toggle,
    measure,
  };
}
