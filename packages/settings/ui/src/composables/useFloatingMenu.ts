import { nextTick, onUnmounted, ref, type Ref } from "vue";

export type FloatingMenuStyle = {
  top: string;
  left: string;
  width: string;
  maxHeight: string;
};

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

  function measure() {
    const el = triggerRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(r.width, 96);
    const spaceBelow = vh - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openBelow =
      preferBelow
        ? spaceBelow >= Math.min(120, maxMenuHeight) || spaceBelow >= spaceAbove
        : spaceAbove < spaceBelow;
    const available = Math.max(80, openBelow ? spaceBelow : spaceAbove);
    const height = Math.min(maxMenuHeight, available);
    let left = r.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    if (left < 8) left = 8;
    const top = openBelow ? r.bottom + gap : Math.max(8, r.top - gap - height);
    menuStyle.value = {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.round(height)}px`,
    };
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

  function onViewportChange() {
    if (!open.value) return;
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
    measure();
    await nextTick();
    measure();
    bindDoc();
  }

  function close() {
    open.value = false;
    unbindDoc();
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
