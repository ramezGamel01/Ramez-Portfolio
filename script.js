// Everything lives in this function so nothing leaks into the page's global
// scope: the Lenis bundle defines one-letter globals (t, e, s…) of its own.
(() => {
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, t) => from + (to - from) * t;
  const escapeHTML = (text) =>
    text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
  };

  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const header = $("[data-header]");
  const burger = $(".burger");
  const menu = $("#menu");
  const note = $("[data-motion-note]");

  /* ---------- Language ---------- */
  const I18N = window.I18N || { en: {}, ar: {} };
  let lang = root.lang === "ar" ? "ar" : "en";

  function t(key, vars) {
    let text = (lang === "ar" ? I18N.ar[key] : undefined) ?? I18N.en[key] ?? key;
    for (const name in vars) text = text.replace(`{${name}}`, vars[name]);
    return text;
  }

  // English stays in the HTML; remember it the first time an element is swapped
  const originals = new WeakMap();

  function translatePage() {
    $$("[data-i18n]").forEach((el) => {
      if (!originals.has(el)) originals.set(el, { html: el.innerHTML, attrs: {} });
      const arabic = I18N.ar[el.dataset.i18n];
      el.innerHTML = lang === "ar" && arabic != null ? arabic : originals.get(el).html;
    });

    $$("[data-i18n-attr]").forEach((el) => {
      if (!originals.has(el)) originals.set(el, { html: null, attrs: {} });
      const saved = originals.get(el).attrs;
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        if (!(attr in saved)) saved[attr] = el.getAttribute(attr);
        const arabic = I18N.ar[key];
        el.setAttribute(attr, lang === "ar" && arabic != null ? arabic : saved[attr]);
      });
    });

    $$("[data-lang-label]").forEach((el) => {
      el.textContent = t("lang.button");
      el.lang = lang === "ar" ? "en" : "ar";
    });
    $$("[data-lang-toggle]").forEach((el) => el.setAttribute("aria-label", t("lang.label")));

    refreshStates();
    root.classList.remove("i18n-pending");
    document.dispatchEvent(new Event("langchange"));
  }

  function setLang(next) {
    const run = () => {
      lang = next;
      root.lang = next;
      root.dir = next === "ar" ? "rtl" : "ltr";
      store.set("lang", next);
      translatePage();
      measure();
    };
    if (motion && document.startViewTransition) {
      root.classList.add("lang-switching");
      const transition = document.startViewTransition(run);
      transition.ready.catch(() => {});
      transition.finished.finally(() => root.classList.remove("lang-switching"));
    } else {
      run();
    }
  }

  $$("[data-lang-toggle]").forEach((button) => {
    button.addEventListener("click", () => setLang(lang === "ar" ? "en" : "ar"));
  });

  /* ---------- Lights (theme) ---------- */
  let theme = root.dataset.theme === "light" ? "light" : "dark";
  const themeColor = $('meta[name="theme-color"]');

  function setTheme(next, origin) {
    const run = () => {
      theme = next;
      root.dataset.theme = next;
      store.set("theme", next);
      themeColor?.setAttribute("content", next === "light" ? "#f1f1f3" : "#0c0c0d");
      refreshStates();
    };

    if (origin && motion && document.startViewTransition) {
      // Light spreads out from the switch that was used
      const box = origin.getBoundingClientRect();
      root.style.setProperty("--tx", `${box.left + box.width / 2}px`);
      root.style.setProperty("--ty", `${box.top + box.height / 2}px`);
      root.classList.add("theme-switching");
      const transition = document.startViewTransition(run);
      transition.ready.catch(() => {});
      transition.finished.finally(() => root.classList.remove("theme-switching"));
    } else {
      run();
    }
  }

  $$("[data-cord]").forEach((cord) => {
    cord.addEventListener("click", () => {
      cord.classList.remove("is-pulled");
      void cord.offsetWidth;
      cord.classList.add("is-pulled");
      switchClick();
      const next = theme === "light" ? "dark" : "light";
      setTimeout(() => setTheme(next, $(".cord-knob", cord)), motion ? 240 : 0);
    });
  });

  $$("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      switchClick();
      setTheme(theme === "light" ? "dark" : "light", button);
    });
  });

  /* ---------- Sounds (on until the visitor turns them off) ----------
     Synthesised, so there are no audio files: switches make a bright snap with a
     low thump, and every other click a soft tick. */
  let sound = store.get("sound") !== "off";
  let audio = null;

  function switchClick() {
    if (!sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const now = audio.currentTime;

      const length = Math.floor(audio.sampleRate * 0.035);
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      const snap = audio.createBufferSource();
      snap.buffer = buffer;
      const band = audio.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2600;
      band.Q.value = 0.9;
      const snapGain = audio.createGain();
      snapGain.gain.value = 0.4;
      snap.connect(band).connect(snapGain).connect(audio.destination);
      snap.start(now);

      const thump = audio.createOscillator();
      thump.frequency.setValueAtTime(150, now);
      thump.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      const thumpGain = audio.createGain();
      thumpGain.gain.setValueAtTime(0.22, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      thump.connect(thumpGain).connect(audio.destination);
      thump.start(now);
      thump.stop(now + 0.12);
    } catch {}
  }

  function uiClick() {
    if (!sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const now = audio.currentTime;
      const tick = audio.createOscillator();
      tick.type = "triangle";
      tick.frequency.setValueAtTime(1900, now);
      tick.frequency.exponentialRampToValueAtTime(650, now + 0.045);
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      tick.connect(gain).connect(audio.destination);
      tick.start(now);
      tick.stop(now + 0.07);
    } catch {}
  }

  // Clicks tick on press, so the sound starts before a link opens the next page.
  // Switches already make their own snap.
  const CLICKABLE = "a, button, [role='button'], [role='tab'], [role='option'], label, summary, .palette-item";
  const SWITCHES = "[data-theme-toggle], [data-cord], [data-sound-toggle]";
  document.addEventListener("pointerdown", (event) => {
    const el = event.target.closest(CLICKABLE);
    if (el && event.button === 0 && !el.closest(SWITCHES)) uiClick();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const el = event.target.closest?.(CLICKABLE);
    if (el && !el.closest(SWITCHES)) uiClick();
  });

  function setSound(on) {
    sound = on;
    store.set("sound", on ? "on" : "off");
    refreshStates();
    switchClick();
  }

  $$("[data-sound-toggle]").forEach((button) => button.addEventListener("click", () => setSound(!sound)));

  /* ---------- Animations on/off ----------
     Follows the device's reduce-motion setting until the visitor picks. */
  let motion = root.dataset.motion === "on";
  let lenis = null;

  function startSmoothScroll() {
    if (lenis || typeof window.Lenis !== "function") return;
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    if (root.classList.contains("loading") || root.classList.contains("menu-open")) lenis.stop();
  }

  function stopSmoothScroll() {
    if (!lenis) return;
    lenis.destroy();
    lenis = null;
  }

  function setMotion(on, remember) {
    motion = on;
    root.dataset.motion = on ? "on" : "off";
    if (remember) store.set("motion", on ? "on" : "off");

    if (on) {
      startSmoothScroll();
    } else {
      stopSmoothScroll();
      $$("[data-hero], [data-portrait], [data-rise], [data-card], [data-timeline]").forEach((el) =>
        el.style.removeProperty("--p")
      );
      $$(".card-shot").forEach((shot) => {
        shot.style.removeProperty("--rx");
        shot.style.removeProperty("--ry");
      });
    }
    refreshStates();
    document.dispatchEvent(new Event("motionchange"));
  }

  function refreshStates() {
    $$("[data-motion-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(motion)));
    $$("[data-motion-state]").forEach((s) => (s.textContent = t(motion ? "state.on" : "state.off")));
    $$("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(theme === "light")));
    $$("[data-theme-state]").forEach((s) => (s.textContent = t(theme === "light" ? "lights.on" : "lights.off")));
    $$("[data-cord]").forEach((c) => c.setAttribute("aria-label", t(theme === "light" ? "cord.on" : "cord.off")));
    $$("[data-sound-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(sound)));
    $$("[data-sound-state]").forEach((s) => (s.textContent = t(sound ? "state.on" : "state.off")));
    burger?.setAttribute("aria-label", t(menu?.classList.contains("is-open") ? "menu.close" : "menu.open"));
  }

  $$("[data-motion-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      setMotion(!motion, true);
      note.hidden = true;
    });
  });

  if (!store.get("motion") && reduceMotion.matches && !store.get("motion-note-dismissed")) {
    note.hidden = false;
  }

  $("[data-motion-enable]")?.addEventListener("click", () => {
    setMotion(true, true);
    note.hidden = true;
  });

  $("[data-motion-dismiss]")?.addEventListener("click", () => {
    note.hidden = true;
    store.set("motion-note-dismissed", "1");
  });

  reduceMotion.addEventListener("change", (event) => {
    if (!store.get("motion")) setMotion(!event.matches, false);
  });

  // Page-to-page transitions only run with animations on
  window.addEventListener("pageswap", (event) => {
    const transition = event.viewTransition;
    if (!transition) return;
    // A transition the browser aborts (e.g. on resize) is harmless; don't report it as an error
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    if (!motion) transition.skipTransition();
  });

  /* ---------- Menu ---------- */
  const outside = [$("main"), $(".site-footer")];

  function openMenu() {
    const box = burger.getBoundingClientRect();
    menu.style.setProperty("--ox", `${box.left + box.width / 2}px`);
    menu.style.setProperty("--oy", `${box.top + box.height / 2}px`);
    menu.classList.add("is-open");
    root.classList.add("menu-open");
    header.classList.remove("is-hidden");
    burger.setAttribute("aria-expanded", "true");
    outside.forEach((el) => el && (el.inert = true));
    lenis?.stop();
    refreshStates();
    setTimeout(() => $(".menu-links a").focus({ preventScroll: true }), motion ? 350 : 0);
  }

  function closeMenu() {
    if (!menu.classList.contains("is-open")) return;
    menu.classList.remove("is-open");
    root.classList.remove("menu-open");
    burger.setAttribute("aria-expanded", "false");
    outside.forEach((el) => el && (el.inert = false));
    lenis?.start();
    refreshStates();
  }

  burger.addEventListener("click", () => {
    if (menu.classList.contains("is-open")) closeMenu();
    else openMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      closeMenu();
      burger.focus();
    }
  });

  /* ---------- Links ---------- */
  function scrollToTarget(target) {
    if (lenis) lenis.scrollTo(target ?? 0, { duration: 1.6 });
    else if (target) target.scrollIntoView({ behavior: motion ? "smooth" : "auto" });
    else window.scrollTo({ top: 0, behavior: motion ? "smooth" : "auto" });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.classList.contains("skip-link")) return;

    const href = link.getAttribute("href");

    // The menu's link to the page you're already on just closes the menu
    if (link.getAttribute("aria-current") === "page") {
      event.preventDefault();
      closeMenu();
      scrollToTarget(null);
      return;
    }

    if (!href.startsWith("#")) return;
    const target = href === "#top" ? null : $(href);
    if (href !== "#top" && !target) return;

    event.preventDefault();
    closeMenu();
    scrollToTarget(target);
  });

  /* ---------- Entrances ---------- */
  function startReveals() {
    const revealer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    $$("[data-reveal]").forEach((el) => revealer.observe(el));
  }

  /* ---------- Loading screen (first page of a visit) ----------
     The name is drawn as fonts and images really load; at 100% the cord is
     pulled, the bulb flickers on and the page fades in. */
  function runLoader() {
    const loader = $("[data-loader]");
    const count = $("[data-loader-count]", loader);
    const started = performance.now();
    const minTime = motion ? 1500 : 0;
    const maxTime = 7000;
    let settled = 0;
    let shown = 0;
    let finished = false;

    const loaded = (img) =>
      new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    const tasks = [
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((resolve) =>
        document.readyState === "complete" ? resolve() : window.addEventListener("load", resolve, { once: true })
      ),
      ...$$("img")
        .filter((img) => img.loading !== "lazy" && !img.complete)
        .map(loaded),
    ];
    tasks.forEach((task) => task.then(() => settled++));

    document.fonts?.load('700 300px "Aref Ruqaa"', "رامز").then(() => loader.classList.add("loader-font"));

    const reveal = (fade) => {
      loader.classList.add("is-out");
      setTimeout(() => {
        root.classList.remove("loading");
        loader.classList.remove("is-lit", "is-out");
        lenis?.start();
        startReveals();
      }, fade);
    };

    const lightsOn = () => {
      finished = true;
      loader.style.setProperty("--progress", "1");
      count.textContent = "100";
      if (!motion) return reveal(0);
      loader.classList.add("is-lit");
      setTimeout(() => reveal(900), 1250);
    };

    const tick = (now) => {
      if (finished) return;
      const elapsed = now - started;
      const ready = (settled === tasks.length && elapsed >= minTime) || elapsed >= maxTime;
      const timeShare = minTime ? Math.min(elapsed / minTime, 1) : 1;
      // Never claim more than is really loaded until everything is in
      const target = ready ? 1 : Math.min(0.95, 0.55 * (settled / tasks.length) + 0.4 * timeShare);
      shown = Math.max(shown, lerp(shown, target, ready ? 0.14 : 0.06));
      if (ready && shown > 0.995) shown = 1;

      loader.style.setProperty("--progress", shown.toFixed(4));
      count.textContent = Math.round(shown * 100);

      if (shown === 1) lightsOn();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    $("[data-loader-skip]", loader).addEventListener("click", () => {
      if (finished) return;
      finished = true;
      reveal(motion ? 600 : 0);
    });
  }

  /* ---------- Lamp light ----------
     Follows the cursor. On touch screens it drifts slowly over the portrait. */
  const portrait = $("[data-portrait]");
  const lit = $$("[data-light]");
  const pointer = { x: 0, y: 0, moved: false };
  const light = { x: 0, y: 0, ready: false };

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = true;
    },
    { passive: true }
  );

  function updateLight(seconds) {
    if (!pointer.moved || !finePointer.matches) {
      if (portrait) {
        const box = portrait.getBoundingClientRect();
        const drift = motion && !finePointer.matches;
        pointer.x = box.left + box.width * (drift ? 0.5 + 0.32 * Math.sin(seconds * 0.55) : 0.3);
        pointer.y = box.top + box.height * (drift ? 0.3 + 0.12 * Math.sin(seconds * 0.9) : 0.22);
      } else {
        pointer.x = window.innerWidth * 0.7;
        pointer.y = window.innerHeight * 0.3;
      }
    }

    if (!light.ready) {
      light.x = pointer.x;
      light.y = pointer.y;
      light.ready = true;
    }

    const ease = motion ? 0.12 : 1;
    light.x = lerp(light.x, pointer.x, ease);
    light.y = lerp(light.y, pointer.y, ease);

    root.style.setProperty("--cx", `${light.x.toFixed(1)}px`);
    root.style.setProperty("--cy", `${light.y.toFixed(1)}px`);

    const vh = window.innerHeight;
    lit.forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.bottom < -200 || box.top > vh + 200) return;
      el.style.setProperty("--lx", `${(light.x - box.left).toFixed(1)}px`);
      el.style.setProperty("--ly", `${(light.y - box.top).toFixed(1)}px`);
    });

    if (portrait) {
      // The shadow falls on the wall on the far side from the lamp
      const box = portrait.getBoundingClientRect();
      const dx = clamp((box.left + box.width / 2 - light.x) / box.width, -1.2, 1.2);
      const dy = clamp((box.top + box.height * 0.3 - light.y) / box.height, -1, 1);
      portrait.style.setProperty("--sx", `${(dx * 34).toFixed(1)}px`);
      portrait.style.setProperty("--sy", `${(dy * 18).toFixed(1)}px`);
    }
  }

  /* ---------- Scroll: header, 3D hero, stacking cards, timeline, rising panel ---------- */
  const hero = $("[data-hero]");
  const stage = $(".stage");
  const cards = $$("[data-card]");
  const rise = $("[data-rise]");
  const timeline = $("[data-timeline]");
  const timelineItems = timeline ? $$("li", timeline) : [];
  let lastY = window.scrollY;
  let velocity = 0;
  let stickyTops = [];

  function updateScroll() {
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    velocity = lerp(velocity, dy, 0.25);

    header.classList.toggle("is-solid", y > 40);
    if (!root.classList.contains("menu-open")) {
      if (dy > 3 && y > 200) header.classList.add("is-hidden");
      else if (dy < -3 || y < 200) header.classList.remove("is-hidden");
    }

    const vh = window.innerHeight;

    if (timeline) {
      const box = timeline.getBoundingClientRect();
      const mark = vh * 0.6;
      timeline.style.setProperty("--tp", clamp((mark - box.top) / box.height).toFixed(4));
      timelineItems.forEach((item) => item.classList.toggle("is-lit", item.getBoundingClientRect().top < mark));
    }

    if (!motion) return;

    if (hero) hero.style.setProperty("--p", clamp(y / (stage.offsetHeight * 0.85)).toFixed(4));

    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const covered = 1 - (next.getBoundingClientRect().top - stickyTops[i]) / card.offsetHeight;
      card.style.setProperty("--p", clamp(covered).toFixed(4));
    });

    if (rise) {
      const box = rise.getBoundingClientRect();
      rise.style.setProperty("--p", clamp((vh - box.top) / (vh * 0.45)).toFixed(4));
    }
  }

  /* ---------- Lamp glow inside panels and rows ---------- */
  $$(".card, .archive a, .next-page").forEach((el) => {
    el.addEventListener("pointermove", (event) => {
      const box = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${event.clientX - box.left}px`);
      el.style.setProperty("--my", `${event.clientY - box.top}px`);
    });
  });

  /* ---------- Project screenshots ---------- */
  cards.forEach((card) => {
    const shot = $(".card-shot", card);
    if (!shot) return;

    card.addEventListener("pointermove", (event) => {
      if (!motion || !finePointer.matches) return;
      const s = shot.getBoundingClientRect();
      shot.style.setProperty("--rx", `${(((event.clientY - s.top) / s.height - 0.5) * -7).toFixed(2)}deg`);
      shot.style.setProperty("--ry", `${(((event.clientX - s.left) / s.width - 0.5) * 9).toFixed(2)}deg`);
    });

    card.addEventListener("pointerleave", () => {
      shot.style.setProperty("--rx", "0deg");
      shot.style.setProperty("--ry", "0deg");
    });
  });

  // Without a cursor, long screenshots scroll by themselves while in view
  const previewWatcher = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-playing", entry.isIntersecting && !finePointer.matches);
      });
    },
    { threshold: 0.6 }
  );
  $$(".card-shot.is-long").forEach((shot) => previewWatcher.observe(shot));

  /* ---------- Tools slider ----------
     Always drifting; scrolling speeds it up and steers its direction. */
  const marquee = $("[data-marquee]");
  const track = marquee ? $(".marquee-track", marquee) : null;
  let marqueeX = 0;
  let marqueeHalf = 0;
  let marqueeDir = -1;
  let marqueeSpeed = 0;
  let marqueeHeld = false;

  if (track) {
    $$("li", track).forEach((item) => {
      const copy = item.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      track.append(copy);
    });
    marquee.addEventListener("pointerenter", () => (marqueeHeld = true));
    marquee.addEventListener("pointerleave", () => (marqueeHeld = false));
  }

  function updateMarquee(dt) {
    if (!track) return;
    if (!motion) {
      if (marqueeX !== 0) {
        marqueeX = 0;
        track.style.transform = "";
      }
      return;
    }

    if (Math.abs(velocity) > 0.6) marqueeDir = velocity > 0 ? -1 : 1;
    const target = marqueeHeld ? 0 : 55 + Math.min(Math.abs(velocity) * 45, 1100);
    marqueeSpeed = lerp(marqueeSpeed, target, 0.08);
    marqueeX += marqueeDir * marqueeSpeed * dt;

    if (marqueeHalf > 0) {
      if (marqueeX <= -marqueeHalf) marqueeX += marqueeHalf;
      else if (marqueeX > 0) marqueeX -= marqueeHalf;
    }
    track.style.transform = `translate3d(${marqueeX.toFixed(2)}px, 0, 0)`;
  }

  /* ---------- Message builder (contact) ---------- */
  const composer = $("[data-composer]");
  if (composer) {
    const error = $("[data-composer-error]", composer);
    const labelFor = (value) => $(`input[value="${value}"] + span`, composer)?.textContent.trim() ?? "";

    composer.message.addEventListener("input", () => (error.hidden = true));

    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(composer);
      const message = String(data.get("message") || "").trim();
      if (!message) {
        error.hidden = false;
        composer.message.focus();
        return;
      }

      const need = data.get("need");
      const when = data.get("when");
      const name = String(data.get("name") || "").trim();

      const lines = [t("mail.hi"), "", message, ""];
      if (need) lines.push(`${t("mail.need")}: ${labelFor(need)}`);
      if (when) lines.push(`${t("mail.when")}: ${labelFor(when)}`);
      if (name) lines.push("", name);

      const subject = [need ? labelFor(need) : t("mail.subject"), name].filter(Boolean).join(" — ");
      window.location.href = `mailto:ramgamel06@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        lines.join("\n")
      )}`;
    });
  }

  /* ---------- Cairo clock (contact page and menu preview) ---------- */
  const clock = $("[data-clock-text]");
  const previewTime = $("[data-preview-time]");
  const tickClock = () => {
    const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Africa/Cairo",
    }).format(new Date());
    if (clock) clock.textContent = t("clock", { time });
    if (previewTime) previewTime.textContent = time;
    updateOverlap();
  };

  /* ---------- Working-hours overlap (contact) ----------
     Assumed hours: change these if they move. */
  const CAIRO_HOURS = [10, 19];
  const VISITOR_HOURS = [9, 18];
  const overlapLine = $("[data-overlap]");

  // Minutes ahead of UTC for a time zone at a given moment
  function zoneOffset(timeZone, moment) {
    // Work on the whole minute, since the formatted parts below have no seconds
    const date = new Date(Math.floor(moment.getTime() / 60000) * 60000);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value])
    );
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function updateOverlap() {
    if (!overlapLine) return;
    const now = new Date();
    const cairo = zoneOffset("Africa/Cairo", now);
    const mine = -now.getTimezoneOffset();
    overlapLine.hidden = false;

    if (cairo === mine) {
      overlapLine.textContent = t("tz.same");
      return;
    }

    const hour = 3600000;
    const dayStart = (offset) => {
      const local = new Date(now.getTime() + offset * 60000);
      return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset * 60000;
    };
    const mineStart = dayStart(mine) + VISITOR_HOURS[0] * hour;
    const mineEnd = dayStart(mine) + VISITOR_HOURS[1] * hour;

    // Cairo's working day may sit on the visitor's previous or next date
    let best = null;
    for (const shift of [-1, 0, 1]) {
      const from = Math.max(dayStart(cairo) + (shift * 24 + CAIRO_HOURS[0]) * hour, mineStart);
      const to = Math.min(dayStart(cairo) + (shift * 24 + CAIRO_HOURS[1]) * hour, mineEnd);
      if (to > from && (!best || to - from > best[1] - best[0])) best = [from, to];
    }

    const format = (ms) =>
      new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { hour: "numeric", minute: "2-digit" }).format(
        new Date(ms)
      );
    const time = format(now.getTime());
    overlapLine.textContent = best
      ? t("tz.overlap", { time, start: format(best[0]), end: format(best[1]) })
      : t("tz.none", { time });
  }

  tickClock();
  setInterval(tickClock, 15000);
  document.addEventListener("langchange", tickClock);

  /* ---------- Case study contents: mark the section being read ---------- */
  const tocLinks = $$(".case-toc a");
  if (tocLinks.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          tocLinks.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === `#${entry.target.id}`));
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    tocLinks.forEach((a) => {
      const section = $(a.getAttribute("href"));
      if (section) spy.observe(section);
    });
  }

  /* ---------- 404: pull the cord to light the room ---------- */
  const lost = $("[data-lost]");
  if (lost) {
    const lostCord = $("[data-lost-cord]", lost);
    lostCord.addEventListener("click", () => {
      lostCord.classList.remove("is-pulled");
      void lostCord.offsetWidth;
      lostCord.classList.add("is-pulled");
      switchClick();
      setTimeout(() => lost.classList.add("is-lit"), motion ? 220 : 0);
    });
  }

  /* ---------- Command menu (Ctrl+K) ---------- */
  const CV = { en: "assets/cv/Ramez-Gamel-CV-EN.pdf", ar: "assets/cv/Ramez-Gamel-CV-AR.pdf" };
  const EMAIL = "ramgamel06@gmail.com";
  const goTo = (href) => () => (window.location.href = href);
  const download = (href) => () => {
    const a = document.createElement("a");
    a.href = href;
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  };

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  document.body.append(toast);
  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2400);
  }

  const commands = () => [
    { group: "palette.pages", label: t("cmd.home"), keys: "home start", run: goTo("./") },
    { group: "palette.pages", label: t("cmd.work"), keys: "work projects portfolio", run: goTo("work.html") },
    { group: "palette.pages", label: t("cmd.case.wl"), keys: "workledger case study invoices time tracking", run: goTo("case-workledger.html") },
    { group: "palette.pages", label: t("cmd.case.cs"), keys: "cinescope case study films movies colors 3d", run: goTo("case-cinescope.html") },
    { group: "palette.pages", label: t("cmd.case.tf"), keys: "taskflow case study tasks todo", run: goTo("case-taskflow.html") },
    { group: "palette.pages", label: t("cmd.case.rh"), keys: "rihla case study travel bus booking egypt", run: goTo("case-rihla.html") },
    { group: "palette.pages", label: t("cmd.about"), keys: "about bio story", run: goTo("about.html") },
    { group: "palette.pages", label: t("cmd.contact"), keys: "contact hire email message", run: goTo("contact.html") },
    { group: "palette.actions", label: t(theme === "light" ? "cord.on" : "cord.off"), keys: "lights theme dark light mode", run: () => setTheme(theme === "light" ? "dark" : "light") },
    { group: "palette.actions", label: t("lang.label"), keys: "language arabic english عربي", run: () => setLang(lang === "ar" ? "en" : "ar") },
    { group: "palette.actions", label: t(motion ? "cmd.motion.off" : "cmd.motion.on"), keys: "animations motion", run: () => setMotion(!motion, true) },
    { group: "palette.actions", label: t(sound ? "cmd.sound.off" : "cmd.sound.on"), keys: "sound audio click", run: () => setSound(!sound) },
    {
      group: "palette.actions",
      label: t("cmd.copy"),
      keys: "email copy mail address",
      run: () => navigator.clipboard?.writeText(EMAIL).then(() => showToast(t("cmd.copied")), () => {}),
    },
    { group: "palette.actions", label: t("cmd.cv.en"), keys: "cv resume download pdf english", run: download(CV.en) },
    { group: "palette.actions", label: t("cmd.cv.ar"), keys: "cv resume download pdf arabic", run: download(CV.ar) },
    { group: "palette.actions", label: t("cmd.github"), keys: "github code repositories", run: goTo("https://github.com/ramezGamel01") },
    { group: "palette.actions", label: t("cmd.linkedin"), keys: "linkedin profile cv", run: goTo("https://www.linkedin.com/in/ramez-gamel-002755238") },
  ];

  const palette = document.createElement("div");
  palette.className = "palette";
  palette.hidden = true;
  palette.innerHTML = `
    <div class="palette-box" role="dialog" aria-modal="true" aria-labelledby="palette-title">
      <h2 class="sr-only" id="palette-title"></h2>
      <input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list"
        aria-autocomplete="list" autocomplete="off" spellcheck="false">
      <div class="palette-list" id="palette-list" role="listbox"></div>
      <p class="palette-foot"></p>
    </div>`;
  document.body.append(palette);

  const paletteInput = $(".palette-input", palette);
  const paletteList = $(".palette-list", palette);
  let paletteItems = [];
  let paletteActive = 0;
  let paletteReturn = null;

  function markActive(index) {
    paletteActive = index;
    $$(".palette-item", paletteList).forEach((item) =>
      item.setAttribute("aria-selected", String(Number(item.dataset.index) === index))
    );
    paletteInput.setAttribute("aria-activedescendant", `palette-${index}`);
    $(`#palette-${index}`, paletteList)?.scrollIntoView({ block: "nearest" });
  }

  function renderPalette() {
    const query = paletteInput.value.trim().toLowerCase();
    paletteItems = commands().filter((c) => !query || `${c.label} ${c.keys}`.toLowerCase().includes(query));
    if (!paletteItems.length) {
      paletteList.innerHTML = `<p class="palette-empty">${escapeHTML(t("palette.empty"))}</p>`;
      paletteInput.removeAttribute("aria-activedescendant");
      return;
    }
    let group = "";
    paletteList.innerHTML = paletteItems
      .map((c, i) => {
        const heading = c.group !== group ? `<div class="palette-group" role="presentation">${escapeHTML(t(c.group))}</div>` : "";
        group = c.group;
        return `${heading}<div class="palette-item" role="option" id="palette-${i}" data-index="${i}"><span>${escapeHTML(c.label)}</span></div>`;
      })
      .join("");
    markActive(Math.min(paletteActive, paletteItems.length - 1));
  }

  function openPalette() {
    if (!palette.hidden) return;
    paletteReturn = document.activeElement;
    closeMenu();
    $("#palette-title", palette).textContent = t("palette.title");
    paletteInput.placeholder = t("palette.placeholder");
    paletteInput.setAttribute("aria-label", t("palette.title"));
    $(".palette-foot", palette).textContent = t("palette.hint");
    paletteInput.value = "";
    paletteActive = 0;
    palette.hidden = false;
    root.classList.add("palette-open");
    lenis?.stop();
    renderPalette();
    paletteInput.focus();
  }

  function closePalette() {
    if (palette.hidden) return;
    palette.hidden = true;
    root.classList.remove("palette-open");
    lenis?.start();
    paletteReturn?.focus?.({ preventScroll: true });
  }

  function runCommand(index) {
    const command = paletteItems[index];
    if (!command) return;
    closePalette();
    command.run();
  }

  paletteInput.addEventListener("input", () => {
    paletteActive = 0;
    renderPalette();
  });

  paletteInput.addEventListener("keydown", (event) => {
    const count = paletteItems.length;
    if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      markActive((paletteActive + 1) % count);
    } else if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      markActive((paletteActive - 1 + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(paletteActive);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    } else if (event.key === "Tab") {
      event.preventDefault(); // the input is the only stop inside the dialog
    }
  });

  paletteList.addEventListener("click", (event) => {
    const item = event.target.closest(".palette-item");
    if (item) runCommand(Number(item.dataset.index));
  });

  paletteList.addEventListener("pointermove", (event) => {
    const item = event.target.closest(".palette-item");
    if (item && Number(item.dataset.index) !== paletteActive) markActive(Number(item.dataset.index));
  });

  palette.addEventListener("click", (event) => {
    if (event.target === palette) closePalette();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (palette.hidden) openPalette();
      else closePalette();
    }
  });

  $$("[data-palette-open]").forEach((button) => button.addEventListener("click", openPalette));

  /* ---------- Menu previews ---------- */
  const preview = $("[data-menu-preview]");
  if (preview) {
    const panes = $$("[data-preview-pane]", preview);
    const here = $(".menu-links a[aria-current='page']")?.dataset.preview ?? root.dataset.section ?? "home";
    const show = (key) => panes.forEach((pane) => pane.classList.toggle("is-active", pane.dataset.previewPane === key));

    show(here);
    $$(".menu-links a").forEach((link) => {
      link.addEventListener("pointerenter", () => show(link.dataset.preview));
      link.addEventListener("focus", () => show(link.dataset.preview));
    });
    $(".menu-links").addEventListener("pointerleave", () => show(here));
  }

  /* ---------- Copy email ---------- */
  $$("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = t("copied");
      } catch {
        button.textContent = t("copy.fail");
        window.getSelection().selectAllChildren(button.previousElementSibling);
      }
      setTimeout(() => (button.textContent = t("copy")), 2000);
    });
  });

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Project deck (Work page) ----------
     The projects sit fanned out like a hand of cards. Pointing at one, or tabbing
     into it, lifts it out of the deck and opens its details; the others slide aside. */
  const deck = $("[data-deck]");
  if (deck) {
    const deckCards = $$(".deck-card", deck);
    const fanQuery = matchMedia("(min-width: 1024px) and (hover: hover)");
    let active = -1;

    function layoutDeck() {
      const fanned = fanQuery.matches;
      deck.classList.toggle("is-fanned", fanned);
      deck.classList.toggle("has-active", fanned && active >= 0);
      const n = deckCards.length;
      const rtl = root.dir === "rtl" ? -1 : 1;
      deckCards.forEach((card, i) => {
        const slot = i - (n - 1) / 2;
        card.classList.toggle("is-active", fanned && i === active);
        if (!fanned) {
          ["--x", "--y", "--r", "--s", "--z"].forEach((v) => card.style.removeProperty(v));
          return;
        }
        let x = slot * 220;
        let y = slot * slot * 12;
        let r = slot * 6;
        let s = 1;
        let z = i + 1;
        if (active >= 0) {
          const d = i - active;
          if (d === 0) {
            // The lifted card moves toward the middle so its full width fits
            x = slot * 140;
            y = -26;
            r = 0;
            z = 20;
          } else {
            x += Math.sign(d) * 160;
            y += 26;
            r += Math.sign(d) * 5;
            s = 0.9;
            z = 10 - Math.abs(d);
          }
        }
        card.style.setProperty("--x", `${(x * rtl).toFixed(1)}px`);
        card.style.setProperty("--y", `${y.toFixed(1)}px`);
        card.style.setProperty("--r", `${(r * rtl).toFixed(2)}deg`);
        card.style.setProperty("--s", s);
        card.style.setProperty("--z", z);
      });
    }

    function setActive(i) {
      if (active === i) return;
      active = i;
      layoutDeck();
    }

    deckCards.forEach((card, i) => {
      card.addEventListener("pointerenter", (event) => {
        if (fanQuery.matches && event.pointerType !== "touch") setActive(i);
      });
      card.addEventListener("focusin", () => setActive(i));
    });
    deck.addEventListener("pointerleave", () => fanQuery.matches && setActive(-1));
    deck.addEventListener("focusout", (event) => {
      if (!deck.contains(event.relatedTarget)) setActive(-1);
    });
    deck.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setActive(-1);
        document.activeElement?.blur();
      }
    });
    fanQuery.addEventListener("change", layoutDeck);
    document.addEventListener("langchange", layoutDeck);
    layoutDeck();
  }

  /* ---------- Scroll rail ----------
     A slim lamp-lit scrollbar with a mark for each section. It shows where you
     are while you scroll, and you can drag it or click anywhere along it. */
  const rail = (() => {
    if (!finePointer.matches) return null;
    const el = document.createElement("div");
    el.className = "rail";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="rail-track"></div><div class="rail-thumb"><span class="rail-label"></span></div>';
    document.body.append(el);
    root.classList.add("has-rail");
    return {
      el,
      track: $(".rail-track", el),
      thumb: $(".rail-thumb", el),
      label: $(".rail-label", el),
      marks: [],
      activeUntil: 0,
      dragging: null,
      lastY: -1,
      lastText: "",
    };
  })();

  // Every visible page and section heading becomes a mark on the rail
  function railHeadings() {
    return $$("main h1, main h2").filter((heading) => heading.offsetParent !== null);
  }

  function railText(heading) {
    const line = $(".line", heading) || heading;
    const text = line.textContent.replace(/\s+/g, " ").trim();
    return text.length > 30 ? `${text.slice(0, 29)}…` : text;
  }

  function measureRail() {
    if (!rail) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    rail.el.hidden = max < 40;
    rail.marks.forEach((m) => m.tick.remove());
    rail.marks = railHeadings().map((heading) => {
      const top = heading.getBoundingClientRect().top + window.scrollY;
      const tick = document.createElement("span");
      tick.className = "rail-tick";
      tick.style.setProperty("--at", `${(clamp(top / Math.max(max, 1)) * 100).toFixed(2)}%`);
      rail.track.append(tick);
      return { heading, top, tick };
    });
    rail.lastY = -1;
  }

  function scrollToRatio(ratio, smooth) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = clamp(ratio) * max;
    if (lenis) lenis.scrollTo(y, smooth ? { duration: 1.1 } : { immediate: true });
    else window.scrollTo({ top: y, behavior: smooth && motion ? "smooth" : "auto" });
  }

  function updateRail(now) {
    if (!rail || rail.el.hidden) return;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const doc = document.documentElement.scrollHeight;
    const max = Math.max(doc - vh, 1);
    if (y !== rail.lastY) {
      if (rail.lastY !== -1) rail.activeUntil = now + 1100;
      rail.lastY = y;
      const height = rail.el.clientHeight;
      const thumb = Math.max(44, height * (vh / doc));
      rail.thumb.style.setProperty("--h", `${thumb.toFixed(1)}px`);
      rail.thumb.style.setProperty("--y", `${((height - thumb) * clamp(y / max)).toFixed(1)}px`);

      let current = rail.marks[0];
      rail.marks.forEach((m) => {
        const passed = m.top <= y + vh * 0.4;
        m.tick.classList.toggle("is-passed", passed);
        if (passed) current = m;
      });
      const text = `${current ? escapeHTML(railText(current.heading)) : ""}<b>${Math.round(clamp(y / max) * 100)}%</b>`;
      if (text !== rail.lastText) {
        rail.label.innerHTML = text;
        rail.lastText = text;
      }
    }
    rail.el.classList.toggle("is-active", Boolean(rail.dragging) || now < rail.activeUntil);
  }

  if (rail) {
    rail.el.addEventListener("pointerdown", (event) => {
      const box = rail.el.getBoundingClientRect();
      const thumb = rail.thumb.getBoundingClientRect();
      event.preventDefault();
      rail.el.setPointerCapture(event.pointerId);
      rail.el.classList.add("is-dragging");
      if (event.clientY >= thumb.top && event.clientY <= thumb.bottom) {
        // Grab the thumb where it was clicked
        rail.dragging = { offset: event.clientY - thumb.top, thumb: thumb.height, box };
      } else {
        // Jump to the clicked spot, then keep following the pointer
        rail.dragging = { offset: thumb.height / 2, thumb: thumb.height, box };
        scrollToRatio((event.clientY - box.top - thumb.height / 2) / (box.height - thumb.height), true);
      }
    });
    rail.el.addEventListener("pointermove", (event) => {
      if (!rail.dragging) return;
      const { offset, thumb, box } = rail.dragging;
      scrollToRatio((event.clientY - box.top - offset) / (box.height - thumb), false);
    });
    const endDrag = () => {
      rail.dragging = null;
      rail.el.classList.remove("is-dragging");
    };
    rail.el.addEventListener("pointerup", endDrag);
    rail.el.addEventListener("pointercancel", endDrag);
    document.addEventListener("langchange", () => {
      rail.lastText = "";
      rail.lastY = -1;
    });
  }

  /* ---------- Cursor ----------
     A small dot and a soft ring that trails it. Over links and buttons the ring
     opens into a disc that inverts what's beneath it; over project screenshots a
     "View" tag appears. Clicks send out a ripple. Text fields keep the system cursor. */
  const cursor = (() => {
    if (!finePointer.matches || matchMedia("(forced-colors: active)").matches) return null;
    const el = document.createElement("div");
    el.className = "cursor";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="cursor-ring"></span><span class="cursor-dot"></span>';
    // The tag sits outside the blended layer so it always reads clearly
    const tag = document.createElement("span");
    tag.className = "cursor-tag";
    tag.setAttribute("aria-hidden", "true");
    document.body.append(el, tag);
    root.classList.add("has-cursor");
    return { el, tag, ring: $(".cursor-ring", el), dot: $(".cursor-dot", el), x: -100, y: -100 };
  })();

  const HOVER = "a, button, [role='button'], [role='tab'], [role='option'], label, summary, select, .palette-item, .rail";
  const TEXT = "input:not([type='radio'], [type='checkbox'], [type='button'], [type='submit']), textarea, [contenteditable='true']";

  function setCursorState(target) {
    const text = target.closest(TEXT);
    const hover = text ? null : target.closest(HOVER);
    const view = hover?.matches(".card-shot, .deck-media");
    cursor.el.classList.toggle("is-text", Boolean(text));
    cursor.el.classList.toggle("is-hover", Boolean(hover) && !view);
    cursor.el.classList.toggle("is-view", Boolean(view));
    cursor.tag.classList.toggle("is-on", Boolean(view));
    if (view) cursor.tag.textContent = t("cursor.view");
  }

  if (cursor) {
    document.addEventListener("pointerover", (event) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") setCursorState(event.target);
    });
    document.addEventListener("pointerdown", (event) => {
      cursor.el.classList.add("is-pressed");
      if (!motion) return;
      const ripple = document.createElement("span");
      ripple.className = "cursor-ripple";
      ripple.style.setProperty("--x", `${event.clientX}px`);
      ripple.style.setProperty("--y", `${event.clientY}px`);
      ripple.addEventListener("animationend", () => ripple.remove());
      cursor.el.append(ripple);
    });
    document.addEventListener("pointerup", () => cursor.el.classList.remove("is-pressed"));
    root.addEventListener("pointerleave", () => {
      cursor.el.classList.remove("is-visible");
      cursor.tag.classList.remove("is-on");
    });
    root.addEventListener("pointerenter", () => cursor.el.classList.add("is-visible"));
  }

  function updateCursor(dt) {
    if (!cursor || !pointer.moved || !finePointer.matches) return;
    cursor.el.classList.add("is-visible");
    const k = motion ? 1 - Math.pow(0.00002, dt) : 1;
    cursor.x = lerp(cursor.x, pointer.x, k);
    cursor.y = lerp(cursor.y, pointer.y, k);
    cursor.dot.style.setProperty("--x", `${pointer.x}px`);
    cursor.dot.style.setProperty("--y", `${pointer.y}px`);
    cursor.ring.style.setProperty("--x", `${cursor.x.toFixed(1)}px`);
    cursor.ring.style.setProperty("--y", `${cursor.y.toFixed(1)}px`);
    cursor.tag.style.setProperty("--x", `${cursor.x.toFixed(1)}px`);
    cursor.tag.style.setProperty("--y", `${cursor.y.toFixed(1)}px`);
  }

  /* ---------- Magnetic buttons ----------
     Buttons lean a few pixels toward the cursor while it's over them. */
  if (finePointer.matches) {
    $$(".btn, .lang-btn, .burger, .copy-btn").forEach((button) => {
      button.addEventListener("pointermove", (event) => {
        if (!motion) return;
        const box = button.getBoundingClientRect();
        const dx = (event.clientX - (box.left + box.width / 2)) / box.width;
        const dy = (event.clientY - (box.top + box.height / 2)) / box.height;
        button.style.setProperty("--mx-pull", `${(dx * 10).toFixed(1)}px`);
        button.style.setProperty("--my-pull", `${(dy * 8).toFixed(1)}px`);
        button.classList.add("is-pulled");
      });
      button.addEventListener("pointerleave", () => {
        button.style.removeProperty("--mx-pull");
        button.style.removeProperty("--my-pull");
        button.classList.remove("is-pulled");
      });
    });
  }

  /* ---------- Start ---------- */
  function measure() {
    stickyTops = cards.map((card) => parseFloat(getComputedStyle(card).top) || 0);
    measureRail();
    if (track) marqueeHalf = track.scrollWidth / 2;
  }

  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    lenis?.raf(now);
    updateScroll();
    updateLight(now / 1000);
    updateMarquee(dt);
    updateRail(now);
    updateCursor(dt);

    requestAnimationFrame(frame);
  }

  translatePage();
  themeColor?.setAttribute("content", theme === "light" ? "#f1f1f3" : "#0c0c0d");
  setMotion(motion, false);

  if (root.classList.contains("loading")) runLoader();
  else startReveals();

  measure();
  window.addEventListener("resize", measure);
  document.fonts?.ready.then(measure);
  requestAnimationFrame(frame);
})();
