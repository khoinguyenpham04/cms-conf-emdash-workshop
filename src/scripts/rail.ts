// The rail: scrollspy, progress, the sliding indicator, and the mobile sheet.
// The current step is the last target whose top has crossed 30% of the viewport; a part head
// counts as its part's first step, and the finale marks every step passed. A click or a
// hashchange pins its target until scrolling has been idle for 150ms; wheel, touch and scroll
// keys unpin at once.

function init() {
  const found = document.querySelector<HTMLElement>("[data-rail]");
  const items = found ? [...found.querySelectorAll<HTMLElement>("[data-rail-item]")] : [];
  if (!found || !items.length) return; // the empty state has no rows
  const rail: HTMLElement = found;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 960px)"); // keep in sync with the CSS breakpoint
  const groups = rail.querySelector<HTMLElement>(".rail-groups")!; // position: relative; offsetParent of rows
  const ids = items.map((el) => el.dataset.railItem!);
  const nums = items.map((el) => el.dataset.railNum!);
  const n = ids.length;
  const lastNum = nums[n - 1]!;
  const segs = [...rail.querySelectorAll<HTMLElement>("[data-seg]")];
  const counts = document.querySelectorAll<HTMLElement>("[data-rail-count], [data-topbar-count]");
  const numEls = document.querySelectorAll<HTMLElement>("[data-topbar-num]");
  const labelEls = document.querySelectorAll<HTMLElement>("[data-topbar-label]");
  const bars = document.querySelectorAll<HTMLElement>("[data-topbar-progress]");
  const indicator = rail.querySelector<HTMLElement>("[data-rail-indicator]")!;
  const finale = document.querySelector<HTMLElement>(".step--final");

  const firstOfPart = new Map<string, number>();
  rail.querySelectorAll(".rail-group").forEach((g) => {
    const part = g.querySelector(".rail-part a")?.getAttribute("href")?.slice(1);
    const first = g.querySelector<HTMLElement>("[data-rail-item]")?.dataset.railItem;
    if (part && first) firstOfPart.set(part, ids.indexOf(first));
  });
  const targets = [...document.querySelectorAll<HTMLElement>(".part-head, .step")].flatMap((el) => {
    if (el.classList.contains("part-head")) {
      const i = firstOfPart.get(el.closest(".part")?.id ?? "");
      return i === undefined ? [] : [{ el, idx: i }];
    }
    if (el === finale) return [{ el, idx: n }];
    const i = ids.indexOf(el.id);
    return i < 0 ? [] : [{ el, idx: i }];
  });
  const resolve = (hash: string): number | null => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const i = ids.indexOf(id);
    if (i >= 0) return i;
    return firstOfPart.get(id) ?? (finale && finale.id === id ? n : null);
  };
  const rowTop = (a: HTMLElement) => groups.offsetTop + a.offsetTop; // in the rail's scroll coordinates

  let current = -1;
  let pinned: number | null = null;
  let idle = 0;
  let raf = 0;
  let placed = false;

  function moveIndicator() {
    const a = items[current]?.querySelector<HTMLElement>("a");
    if (!a || current >= n || !a.offsetParent) {
      indicator.style.opacity = "0";
      return;
    }
    if (!placed) indicator.style.transition = "none"; // first placement: no glide from the top
    indicator.style.height = `${a.offsetHeight}px`;
    indicator.style.transform = `translateY(${a.offsetTop}px)`;
    indicator.style.opacity = "1";
    if (!placed) {
      void indicator.offsetHeight;
      indicator.style.transition = "";
      placed = true;
    }
  }

  function setActive(idx: number) {
    if (idx === current) return;
    current = idx;
    const done = idx >= n;
    items.forEach((el, i) => {
      el.dataset.state = i < idx ? "done" : i === idx ? "active" : "";
      const a = el.querySelector("a")!;
      if (i === idx) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
    segs.forEach((s, i) => {
      s.toggleAttribute("data-done", i < idx);
      s.toggleAttribute("data-current", i === idx);
    });
    const shown = done ? lastNum : nums[idx]!;
    counts.forEach((el) => {
      el.textContent = `${shown} / ${lastNum}`; // the real step number, e.g. "5 / 16"
    });
    bars.forEach((el) => {
      el.style.transform = `scaleX(${done ? 1 : n > 1 ? idx / (n - 1) : 1})`;
    });
    document.querySelectorAll(".step.is-current").forEach((el) => el.classList.remove("is-current"));
    if (done && finale) {
      finale.classList.add("is-current");
      const word = finale.querySelector(".step-word")?.textContent?.trim() ?? "";
      const title = finale.querySelector(".step-title")?.textContent?.trim() ?? "";
      numEls.forEach((el) => {
        el.textContent = word;
      });
      labelEls.forEach((el) => {
        el.textContent = title;
      });
    } else {
      const item = items[idx]!;
      document.getElementById(ids[idx]!)?.classList.add("is-current");
      numEls.forEach((el) => {
        el.textContent = `Step ${nums[idx]}`;
      });
      labelEls.forEach((el) => {
        el.textContent = item.querySelector(".rail-label")?.textContent ?? "";
      });
      if (!mobile.matches) {
        // keep the active row visible in a rail that scrolls
        const a = item.querySelector<HTMLElement>("a")!;
        const r = a.getBoundingClientRect();
        const rr = rail.getBoundingClientRect();
        if (r.top < rr.top + 48 || r.bottom > rr.bottom - 16)
          rail.scrollTo({ top: rowTop(a) - rail.clientHeight / 3, behavior: reduce.matches || !placed ? "auto" : "smooth" });
      }
    }
    moveIndicator();
  }

  function compute() {
    if (pinned !== null) return;
    const line = innerHeight * 0.3;
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let idx = 0;
    if (atBottom && targets.length) idx = targets[targets.length - 1]!.idx;
    else
      for (const t of targets) {
        if (t.el.getBoundingClientRect().top <= line) idx = t.idx;
        else break;
      }
    setActive(idx);
  }

  const pin = (idx: number | null) => {
    if (idx === null) return;
    pinned = idx;
    setActive(idx);
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      pinned = null;
    }, 300); // grace before the jump's first scroll event
  };
  const unpin = () => {
    if (pinned !== null) {
      pinned = null;
      compute();
    }
  };

  addEventListener(
    "scroll",
    () => {
      if (pinned !== null) {
        // release on idle, without recomputing
        clearTimeout(idle);
        idle = window.setTimeout(() => {
          pinned = null;
        }, 150);
        return;
      }
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          compute();
        });
    },
    { passive: true },
  );
  addEventListener("wheel", unpin, { passive: true });
  addEventListener("touchstart", unpin, { passive: true });
  addEventListener("keydown", (e) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) unpin();
  });
  addEventListener("hashchange", () => pin(resolve(location.hash)));
  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('[data-rail] a[href^="#"]');
    if (!a) return;
    pin(resolve(a.getAttribute("href")!));
    if (rail.dataset.open === "true") closeSheet(false);
  });
  // A rail taller than its window fades out at the bottom while more rows follow.
  const syncMore = () =>
    rail.toggleAttribute("data-more", rail.scrollHeight - rail.clientHeight - rail.scrollTop > 2);
  rail.addEventListener("scroll", syncMore, { passive: true });
  addEventListener("resize", () => {
    moveIndicator();
    compute();
    syncMore();
  });
  document.fonts.ready.then(() => {
    moveIndicator();
    syncMore();
  });
  syncMore();
  const initial = resolve(location.hash);
  if (initial !== null) pin(initial);
  else compute();

  // Mobile sheet: a disclosure, not a modal dialog. It has no close button (that would be new copy);
  // it closes on the bar button, Escape, the scrim, a link, or focus leaving it.
  const toggle = document.querySelector<HTMLButtonElement>("[data-rail-toggle]");
  const scrim = document.querySelector<HTMLElement>("[data-rail-scrim]");
  function openSheet() {
    rail.dataset.open = "true";
    document.documentElement.classList.add("rail-open");
    toggle?.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      moveIndicator();
      const a =
        rail.querySelector<HTMLElement>('[aria-current="step"]') ?? rail.querySelector<HTMLElement>(".rail-item a");
      // the sheet is still translated off-screen here, so scrollIntoView would scroll the page
      if (a) {
        rail.scrollTop = rowTop(a) - rail.clientHeight / 2;
        a.focus({ preventScroll: true });
      }
    });
  }
  function closeSheet(restore = true) {
    if (rail.dataset.open !== "true") return;
    rail.dataset.open = "false";
    document.documentElement.classList.remove("rail-open");
    toggle?.setAttribute("aria-expanded", "false");
    if (restore) toggle?.focus();
  }
  toggle?.addEventListener("click", () => (rail.dataset.open === "true" ? closeSheet() : openSheet()));
  scrim?.addEventListener("click", () => closeSheet());
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });
  rail.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (rail.dataset.open === "true" && to && !rail.contains(to) && !toggle?.contains(to)) closeSheet(false);
  });
  mobile.addEventListener("change", (m) => {
    if (!m.matches) closeSheet(false);
    moveIndicator();
  });
}

init();
