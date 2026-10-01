import type { Page } from "@playwright/test";

// A visual-bug detector that needs no baseline image. Baselines (visual.spec.ts)
// only prove the screen did not change; they happily accept a broken screen
// the day they are regenerated (the decided panel shipped with its text
// touching the border and a chip printed over a word, and CI stayed green).
// These checks read the rendered page and fail on the *shape* of the bugs
// the owner kept finding by hand:
//
//   touching  text within 5px (3px above/below) of the border or fill of the box it sits in
//   overlap   two pieces of text drawn over each other
//   cut       text truncated with an ellipsis or clamped away
//   tiny      text under 11.5px
//   image     a visible <img> that failed to load
//   overflow  the page scrolls sideways
//
// An element opts out with data-ui-ok="<reason>" (on it or an ancestor); the
// reason is the point: a bare opt-out is a bug being hidden.

export interface Finding {
  kind: "touching" | "overlap" | "cut" | "tiny" | "image" | "overflow" | "under-nav";
  detail: string;
}

export async function scanPage(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const seen = new Set<string>();
    const add = (kind: string, detail: string) => {
      const key = `${kind}|${detail}`;
      if (!seen.has(key) && out.length < 60) { seen.add(key); out.push({ kind, detail }); }
    };
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const name = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      return el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
    };
    const optedOut = (el: Element) => !!el.closest("[data-ui-ok]");
    const alpha = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const p = m[1].split(/[,/ ]+/).filter(Boolean);
      return p.length > 3 ? Number(p[3]) : 1;
    };
    const effectiveOpacity = (el: Element) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    };

    // Every visible run of text, with where it is drawn.
    const boxes: { el: Element; r: DOMRect; text: string; lines: DOMRect[]; floating: boolean }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const el = node.parentElement;
      if (!text || !el || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TEXTAREA)$/.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || effectiveOpacity(el) < 0.05) continue;
      if (el.closest("[hidden], [inert], canvas") || optedOut(el)) continue;
      // Content of a closed <details> is not drawn (only its summary is).
      const closed = el.closest("details:not([open])");
      if (closed && !el.closest("summary")) continue;
      // Visually hidden text (screen-reader-only, clipped to a pixel) is not seen.
      let clippedAway = false;
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const nr = n.getBoundingClientRect();
        const ncs = getComputedStyle(n);
        if ((nr.width < 3 || nr.height < 3) && ncs.overflow !== "visible") { clippedAway = true; break; }
        if (ncs.clip !== "auto" && ncs.clip !== "") { clippedAway = true; break; }
        if (ncs.clipPath.startsWith("inset(50%")) { clippedAway = true; break; }
      }
      if (clippedAway) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right < 0 || r.left > vw) continue;
      let floating = false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === "fixed" || pos === "sticky") { floating = true; break; }
      }
      // Text a photo is drawn over (the cover mosaic keeps each venue's name
      // under its picture) is not seen; the photo counts as covering it.
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = r.top + r.height / 2;
      const top = cy >= 0 && cy < window.innerHeight ? document.elementFromPoint(cx, cy) : null;
      if (top && /^(IMG|PICTURE|VIDEO|CANVAS)$/.test(top.tagName) && !el.contains(top)) continue;
      const lines = Array.from(range.getClientRects()).filter((q) => q.width > 1 && q.height > 1);
      boxes.push({ el, r, text, lines: lines.length ? lines : [r], floating });
    }

    // touching: per side, the nearest ancestor that draws an edge there.
    const filled = (el: Element) => {
      if (el === document.body || el === document.documentElement) return false;
      const cs = getComputedStyle(el);
      if (alpha(cs.backgroundColor) < 0.5) return false;
      const parent = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : "";
      return cs.backgroundColor !== parent;
    };
    for (const b of boxes) {
      for (const side of ["Left", "Right", "Top", "Bottom"] as const) {
        for (let a: Element | null = b.el; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const width = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
          const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
          const edge = (width >= 1 && style !== "none" && alpha(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)) > 0.1) || filled(a);
          if (!edge) continue;
          const ar = a.getBoundingClientRect();
          if (ar.width < 2 || ar.height < 2) break;
          // A circle (initials badge) has no corners for text to touch.
          const radius = parseFloat(cs.borderTopLeftRadius);
          if (radius >= Math.min(ar.width, ar.height) * 0.45 && Math.abs(ar.width - ar.height) < 6) break;
          const gap = side === "Left" ? b.r.left - ar.left : side === "Right" ? ar.right - b.r.right : side === "Top" ? b.r.top - ar.top : ar.bottom - b.r.bottom;
          // The text box includes line-height air, so top and bottom need less than the sides.
          const limit = side === "Left" || side === "Right" ? 5 : 3;
          if (gap < limit && gap > -2 && !optedOut(a)) add("touching", `${side.toLowerCase()} ${gap.toFixed(1)}px: "${b.text.slice(0, 34)}" in ${name(a)}`);
          break;
        }
      }
    }

    // overlap: two lines of text drawn over each other. Fixed or sticky bars
    // (tab bar, nav, action bar) are meant to float over content; and two
    // tight display lines may graze (line boxes include air), so the overlap
    // must cover a quarter of the shorter line.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || a.floating !== b.floating) continue;
        let hit = false;
        for (const p of a.lines) for (const q of b.lines) {
          const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
          const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (w > 4 && h > 4 && h > Math.min(p.height, q.height) * 0.25) hit = true;
        }
        if (hit) add("overlap", `"${a.text.slice(0, 26)}" (${name(a.el)}) over "${b.text.slice(0, 26)}" (${name(b.el)})`);
      }
    }

    // cut: ellipsis or a line clamp that is hiding text; tiny: under the floor.
    for (const b of boxes) {
      for (let a: Element | null = b.el, depth = 0; a && depth < 4; a = a.parentElement, depth++) {
        const cs = getComputedStyle(a);
        const ellipsis = cs.textOverflow === "ellipsis" && a.scrollWidth > a.clientWidth + 1;
        const clamped = (cs as unknown as { webkitLineClamp: string }).webkitLineClamp !== "none" && a.scrollHeight > a.clientHeight + 1;
        if ((ellipsis || clamped) && !optedOut(a)) { add("cut", `"${b.text.slice(0, 40)}" truncated in ${name(a)}`); break; }
      }
      const px = parseFloat(getComputedStyle(b.el).fontSize);
      if (px < 11.5) add("tiny", `${px.toFixed(1)}px "${b.text.slice(0, 30)}" in ${name(b.el)}`);
    }

    for (const img of Array.from(document.images)) {
      const r = img.getBoundingClientRect();
      if (r.width > 2 && r.height > 2 && img.complete && img.naturalWidth === 0 && img.currentSrc && !optedOut(img)) add("image", `broken ${name(img)} ${img.currentSrc.slice(0, 80)}`);
    }
    if (document.documentElement.scrollWidth > vw + 1) add("overflow", `page is ${document.documentElement.scrollWidth}px wide in a ${vw}px window`);
    void vh;
    return out;
  }) as Promise<Finding[]>;
}

/** Scrolling a heading into view must leave it below the sticky nav. */
export async function headingsClearNav(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const nav = document.querySelector(".home-nav");
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
    if (!navBottom) return out;
    const room = document.documentElement.scrollHeight - window.innerHeight;
    for (const h of Array.from(document.querySelectorAll<HTMLElement>("h1, h2"))) {
      const r0 = h.getBoundingClientRect();
      if (r0.width < 2 || r0.height < 2 || h.closest("[data-ui-ok]")) continue;
      h.scrollIntoView({ block: "start" });
      const top = h.getBoundingClientRect().top;
      const atEnd = window.scrollY >= room - 2; // the page cannot scroll further: nothing to do
      if (!atEnd && top < navBottom - 1) out.push({ kind: "under-nav", detail: `"${(h.textContent ?? "").trim().slice(0, 40)}" lands at ${Math.round(top)}px, nav ends at ${Math.round(navBottom)}px` });
    }
    window.scrollTo(0, 0);
    return out;
  }) as Promise<Finding[]>;
}
