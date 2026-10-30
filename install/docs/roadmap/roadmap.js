(function () {
  "use strict";

  // --- Tuning -------------------------------------------------------------------

  // Thumb-wheel distance (pixels of wheel delta) for one track change.
  var TRACK_STEP = 240;
  // Mouse-drag distance (pixels, up or down) for one track change.
  var DRAG_TRACK_STEP = 70;
  // Main-wheel distance for one milestone column along the time axis.
  var TIME_STEP = 250;
  // The focus window: within NEAR columns of the focus a point is drawn at full
  // size with its full label; labels fade out over FADE columns; BAND is the
  // shaded window's width in pixels.
  var NEAR = 0.75;
  var FADE = 4.2;
  var BAND = 210;
  // How often an open page re-reads roadmap-data.js (milliseconds).
  var REFRESH_MS = 60000;
  var LANG_KEY = "live-roadmap-lang";
  var THEME_KEY = "live-roadmap-theme";
  var THEME_COLORS = { light: "#fafafa", dark: "#121513" };

  // --- Interface texts (add a language by adding a block; missing texts fall
  // back to English) ---------------------------------------------------------------

  var UI = {
    en: {
      skip: "Skip to the timeline", navLabel: "Sections", navTimeline: "Timeline", navNow: "Current", navScope: "Full scope",
      langLabel: "Language", themeLabel: "Dark mode",
      timeline: "Timeline", legendLabel: "Legend", now: "Now",
      hint: "Mouse wheel or drag sideways: along time · thumb wheel, Shift + wheel or drag up / down: between tracks · arrow keys · click a track or a point",
      status: { done: "Done", active: "In progress", next: "Up next", later: "Later" },
      activeTitle: "In progress", nextTitle: "Up next", waitingTitle: "Waiting on a decision",
      scopeTitle: "Full scope up to the release", recentTitle: "Recently finished",
      footer: "Generated from the roadmap plan and the git history. The future deliberately has no dates, only an order.",
      stand: "As of", branch: "branch", finished: "finished", nothing: "Nothing right now.",
      statusLabel: { ok: "Up to date", stale: "Check plan", none: "No history" },
      fresh: "Plan matches the git history", stale: "Plan may be out of date",
      unmapped: function (n) { return n === 1 ? "1 merge without a milestone" : n + " merges without a milestone"; },
      watchNewer: function (paths) { return paths.join(", ") + " changed after it"; },
      noEvidence: function (n) { return n === 1 ? "1 finished milestone not found in git" : n + " finished milestones not found in git"; },
      noHistory: "Built without git history",
      svgTitle: function (m, t) { return "Timeline with " + m + " milestones in " + t + " tracks"; },
      of: "of", belongsTo: "belongs to", pageTitle: "Live roadmap"
    },
    de: {
      skip: "Zur Zeitachse springen", navLabel: "Abschnitte", navTimeline: "Zeitachse", navNow: "Aktuell", navScope: "Gesamtumfang",
      langLabel: "Sprache", themeLabel: "Dunkler Modus",
      timeline: "Zeitachse", legendLabel: "Legende", now: "Jetzt",
      hint: "Mausrad oder seitlich ziehen: entlang der Zeit · Daumenrad, Umschalt + Mausrad oder hoch/runter ziehen: zwischen den Spuren · Pfeiltasten · Klick auf eine Spur oder einen Punkt",
      status: { done: "Erledigt", active: "In Arbeit", next: "Als Nächstes", later: "Später" },
      activeTitle: "In Arbeit", nextTitle: "Als Nächstes", waitingTitle: "Wartet auf eine Entscheidung",
      scopeTitle: "Gesamtumfang bis zur Version", recentTitle: "Zuletzt fertig",
      footer: "Erzeugt aus dem Roadmap-Plan und der Git-Historie. Für die Zukunft gibt es bewusst keine Termine, nur die Reihenfolge.",
      stand: "Stand", branch: "Zweig", finished: "fertig am", nothing: "Gerade nichts.",
      statusLabel: { ok: "Auf Stand", stale: "Plan prüfen", none: "Ohne Historie" },
      fresh: "Plan passt zur Git-Historie", stale: "Plan vielleicht nicht aktuell",
      unmapped: function (n) { return n === 1 ? "1 Merge ohne Meilenstein" : n + " Merges ohne Meilenstein"; },
      watchNewer: function (paths) { return paths.join(", ") + " wurde danach geändert"; },
      noEvidence: function (n) { return n === 1 ? "1 erledigter Meilenstein nicht in Git gefunden" : n + " erledigte Meilensteine nicht in Git gefunden"; },
      noHistory: "Ohne Git-Historie erzeugt",
      svgTitle: function (m, t) { return "Zeitachse mit " + m + " Meilensteinen in " + t + " Spuren"; },
      of: "von", belongsTo: "gehört zu", pageTitle: "Live-Roadmap"
    }
  };

  // --- Theme (light by default; the choice is remembered) -----------------------

  var root = document.documentElement;
  var themeButton = document.getElementById("lrTheme");
  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeButton.setAttribute("aria-pressed", String(theme === "dark"));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  }
  setTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
  var themeChanged = null;
  themeButton.addEventListener("click", function () {
    var theme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(theme);
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (error) { /* Storage is optional. */ }
    if (themeChanged) themeChanged();
  });

  // --- Live data -----------------------------------------------------------------

  // An open page re-reads roadmap-data.js every REFRESH_MS, and when its tab
  // comes back into view, and hands it on only when it changed. A script tag
  // rather than fetch, so it also works when the page is opened from disk.
  function watchData(onChange) {
    var known = JSON.stringify(window.LIVE_ROADMAP || null);
    function poll() {
      if (document.hidden) return;
      var script = document.createElement("script");
      script.src = "roadmap-data.js?" + Date.now();
      script.onload = script.onerror = function () {
        script.remove();
        var text = JSON.stringify(window.LIVE_ROADMAP || null);
        if (window.LIVE_ROADMAP && text !== known) {
          known = text;
          onChange(window.LIVE_ROADMAP);
        }
      };
      document.head.appendChild(script);
    }
    window.setInterval(poll, REFRESH_MS);
    document.addEventListener("visibilitychange", poll);
  }

  // Data comes from roadmap-data.js, written by the live-roadmap builder.
  var data = window.LIVE_ROADMAP;
  var stage = document.getElementById("lrStage");
  var svg = document.getElementById("lrSvg");
  var layer = document.getElementById("lrDraw");
  if (!data) {
    document.getElementById("lrMissing").hidden = false;
    svg.style.display = "none";
    // The first build since the page was opened: start properly.
    watchData(function () { window.location.reload(); });
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var languages = ["en"];
  var current = null;
  var texts = null;
  // The remembered language if the plan has it, else the plan's first.
  function pickLanguage() {
    if (languages.indexOf(current) >= 0) return;
    current = languages[0];
    try {
      var stored = window.localStorage.getItem(LANG_KEY);
      if (languages.indexOf(stored) >= 0) current = stored;
    } catch (error) { /* Storage is optional. */ }
    texts = null;
  }

  function L() {
    if (!texts) {
      var own = UI[current] || {};
      texts = {};
      Object.keys(UI.en).forEach(function (key) {
        texts[key] = typeof UI.en[key] === "object" ? Object.assign({}, UI.en[key], own[key])
          : own[key] !== undefined ? own[key] : UI.en[key];
      });
    }
    return texts;
  }
  // A plan text is a plain string (one language) or keyed by language.
  function tr(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[current] || value[languages[0]] || "";
  }
  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; });
  }
  function formatDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    try {
      return new Intl.DateTimeFormat(current, { dateStyle: "medium" }).format(new Date(+p[0], p[1] - 1, +p[2]));
    } catch (error) {
      return iso;
    }
  }

  // --- Model (built again whenever new data arrives) -----------------------------

  var tracks, milestones, trackIndex, byId, trunk, finalMilestone, maxRank, lists, edges, nowRank, home;

  function ranksOf(status) {
    return milestones.filter(function (m) { return m.status === status; }).map(function (m) { return m.rank; });
  }

  function load(next) {
    data = next;
    languages = data.languages && data.languages.length ? data.languages : ["en"];
    pickLanguage();
    tracks = data.tracks;
    milestones = data.milestones;
    trackIndex = {};
    tracks.forEach(function (track, i) { trackIndex[track.id] = i; });
    byId = {};
    milestones.forEach(function (m) { byId[m.id] = m; });
    trunk = trackIndex[data.trunk];
    finalMilestone = milestones.filter(function (m) { return m.final; })[0];
    maxRank = finalMilestone.rank;

    // Each track's milestones in order; the final one closes its own track.
    lists = tracks.map(function (track) {
      return milestones.filter(function (m) { return m.track === track.id && !m.final; });
    });
    lists[trackIndex[finalMilestone.track]].push(finalMilestone);

    edges = [];
    lists.forEach(function (list, i) {
      list.forEach(function (m, k) { if (k) edges.push({ from: list[k - 1], to: m, track: i }); });
      if (i === trackIndex[finalMilestone.track] || !list.length) return;
      var first = list[0];
      var source = first.after && first.after.length ? byId[first.after[0]] : null;
      if (!source) {
        source = lists[trunk].filter(function (m) { return m.rank < first.rank; }).pop() || lists[trunk][0];
      }
      if (source && source !== first) edges.push({ from: source, to: first, track: i });
      edges.push({ from: list[list.length - 1], to: finalMilestone, track: i });
    });

    // "Now" sits between the latest finished work and the earliest open work, and
    // never past work in progress (a track can finish something in the same
    // column as another track's active milestone).
    var doneMax = Math.max.apply(null, [0].concat(ranksOf("done")));
    var activeRanks = ranksOf("active");
    var openMin = Math.min.apply(null, [maxRank].concat(activeRanks.length ? activeRanks : ranksOf("next")));
    nowRank = openMin > doneMax ? (doneMax + openMin) / 2 : openMin;
    var firstActive = milestones.filter(function (m) { return m.status === "active"; })
      .sort(function (a, b) { return a.rank - b.rank; })[0];
    home = firstActive
      ? { f: firstActive.rank, l: trackIndex[firstActive.track] }
      : { f: nowRank, l: trunk };
  }
  load(data);

  // --- View state -------------------------------------------------------------

  var f = home.f, l = home.l, tf = home.f, tl = home.l;
  var W = 0, H = 0, narrow = false, labelW = 0, x0 = 0, x1 = 0, cx = 0, aL = 0, aR = 0, k = 3, cy = 0, aV = 0;
  var raf = 0;
  var focusedId = null;

  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    narrow = W < 700;
    labelW = narrow ? 0 : Math.min(220, W * 0.18);
    x0 = labelW + (narrow ? 20 : 30);
    x1 = W - (narrow ? 24 : 48);
    cx = x0 + (x1 - x0) * 0.42;
    aL = cx - x0;
    aR = x1 - cx;
    k = narrow ? 2.2 : 3.2;
    cy = H / 2;
    aV = H / 2 - (narrow ? 46 : 52);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  }

  // Focus + context: full spacing near the focus, squeezed further out.
  function X(rank) {
    var d = rank - f;
    return d < 0 ? cx - aL * (1 - Math.exp(d / k)) : cx + aR * (1 - Math.exp(-d / k));
  }
  function Y(index) {
    var d = index - l;
    return cy + (d < 0 ? -1 : 1) * aV * (1 - Math.exp(-Math.abs(d) / 2.2));
  }
  // How much tracks away from the focus fade comes from roadmap.css, per theme.
  var fadeMin = 0.18, fadeStep = 0.38;
  function readFade() {
    var style = window.getComputedStyle(root);
    fadeMin = parseFloat(style.getPropertyValue("--track-fade-min")) || fadeMin;
    fadeStep = parseFloat(style.getPropertyValue("--track-fade-step")) || fadeStep;
  }
  function trackOpacity(index) {
    return Math.max(fadeMin, 1 - Math.abs(index - l) * fadeStep);
  }
  function n1(v) { return Math.round(v * 10) / 10; }

  function curve(xa, ya, xb, yb) {
    var xm = n1((xa + xb) / 2);
    return "M" + n1(xa) + " " + n1(ya) + " C" + xm + " " + n1(ya) + " " + xm + " " + n1(yb) + " " + n1(xb) + " " + n1(yb);
  }

  function draw() {
    var s = [];
    s.push('<rect class="lr-band-h" x="0" y="' + n1(cy - 26) + '" width="' + W + '" height="52"/>');
    s.push('<rect class="lr-band-v" x="' + n1(cx - BAND / 2) + '" y="0" width="' + BAND + '" height="' + H + '"/>');

    var nx = n1(X(nowRank));
    s.push('<line class="lr-nowline" x1="' + nx + '" y1="30" x2="' + nx + '" y2="' + (H - 10) + '"/>');
    s.push('<text class="lr-nowlabel" x="' + nx + '" y="20" text-anchor="middle">' + esc(L().now) + "</text>");

    edges.forEach(function (e) {
      var done = e.from.status === "done" && (e.to.status === "done" || e.to.status === "active");
      var focus = Math.abs(e.track - l) < 0.5;
      s.push('<path class="lr-edge' + (done ? " is-done" : "") + (focus ? " is-focus" : "") + '" opacity="' + trackOpacity(e.track).toFixed(2) + '" d="'
        + curve(X(e.from.rank), Y(trackIndex[e.from.track]), X(e.to.rank), Y(trackIndex[e.to.track])) + '"/>');
    });

    // Track names nearest the focus first; a name that would touch one already
    // placed is left out (the squeezed tracks far from the focus).
    var placed = [];
    var byDistance = tracks.map(function (track, i) { return i; })
      .sort(function (a, b) { return Math.abs(a - l) - Math.abs(b - l); });
    byDistance.forEach(function (i) {
      var dl = Math.abs(i - l);
      var y = Y(i);
      if (placed.some(function (p) { return Math.abs(p - y) < 17; })) return;
      placed.push(y);
      var focus = dl < 0.5;
      var op = trackOpacity(i).toFixed(2);
      var name = esc(tr(tracks[i].title));
      if (narrow) {
        s.push('<text class="lr-track' + (focus ? " is-focus" : "") + '" data-track="' + i + '" x="20" y="' + n1(y - 16) + '" opacity="' + op + '">' + name + "</text>");
      } else {
        var doneCount = lists[i].filter(function (m) { return m.status === "done"; }).length;
        s.push('<text class="lr-track' + (focus ? " is-focus" : "") + '" data-track="' + i + '" x="30" y="' + n1(y) + '" dominant-baseline="central" opacity="' + op + '">' + name + "</text>");
        if (focus) s.push('<text class="lr-track-count" x="30" y="' + n1(y + 20) + '" dominant-baseline="central">' + doneCount + " / " + lists[i].length + "</text>");
      }
    });

    lists.forEach(function (list, i) {
      var dl = Math.abs(i - l);
      var y = Y(i);
      var op = trackOpacity(i).toFixed(2);
      list.forEach(function (m, idx) {
        var dt = Math.abs(m.rank - f);
        var x = X(m.rank);
        var r = (3 + 4.5 * Math.max(0, 1 - Math.max(0, dt - NEAR) / FADE)) * (dl < 0.5 ? 1 : 0.65) + (m.final ? 3 : 0);
        if (m.status === "active") s.push('<circle class="lr-ring" cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(r + 6) + '" opacity="' + op + '"/>');
        s.push('<circle class="lr-node is-' + m.status + (m.final ? " is-final" : "") + '" cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(r) + '" opacity="' + op + '"/>');
        s.push('<circle class="lr-hit" data-id="' + esc(m.id) + '" cx="' + n1(x) + '" cy="' + n1(y) + '" r="14"><title>' + esc(tr(m.title)) + "</title></circle>");
        var lo = Math.max(0, 1 - dl * 2) * Math.max(0, 1 - Math.max(0, dt - NEAR) / FADE);
        if (m.final) lo = Math.max(lo, 0.85);
        if (lo > 0.04) {
          var above = m.final || idx % 2 === 1;
          // The release sits at the right edge: its label runs leftwards.
          s.push('<text class="lr-label' + (dt < NEAR ? " is-near" : "") + (m.final ? " is-final" : "") + '" x="' + n1(m.final ? x + r : x) + '" y="' + n1(above ? y - r - 10 : y + r + 19)
            + '" text-anchor="' + (m.final ? "end" : "middle") + '" opacity="' + Math.min(1, lo).toFixed(2) + '">' + esc(tr(m.title)) + "</text>");
        }
      });
    });

    layer.innerHTML = s.join("");
    updateFocusCard();
  }

  // --- Focus card under the timeline ------------------------------------------

  function focusedMilestone() {
    var list = lists[tl];
    var best = list[0];
    list.forEach(function (m) { if (Math.abs(m.rank - tf) < Math.abs(best.rank - tf)) best = m; });
    return best;
  }

  function tasksHtml(m) {
    if (!m.tasks || !m.tasks.length) return "";
    return '<ul class="lr-tasks">' + m.tasks.map(function (task) {
      return '<li class="' + (task.done ? "is-done" : "") + '"><i aria-hidden="true">' + (task.done ? "✓" : "○") + "</i><span>" + esc(tr(task.text)) + "</span></li>";
    }).join("") + "</ul>";
  }

  function chip(status) {
    return '<span class="lr-chip is-' + status + '">' + esc(L().status[status]) + "</span>";
  }

  function updateFocusCard(force) {
    var m = focusedMilestone();
    if (!m || (!force && m.id === focusedId)) return;
    focusedId = m.id;
    var meta = [chip(m.status)];
    if (m.ref) meta.push('<span class="lr-ref">' + esc(m.ref) + "</span>");
    if (m.date) meta.push('<span class="lr-ref">' + esc(L().finished) + " " + esc(formatDate(m.date)) + "</span>");
    document.getElementById("lrFocus").innerHTML =
      '<div class="lr-focus-track"><small>' + esc(tr(tracks[tl].title)) + "</small><b>" + esc(tr(m.title)) + "</b></div>"
      + '<div class="lr-focus-body"><p class="lr-focus-meta">' + meta.join("") + "</p>"
      + (m.summary ? "<p>" + esc(tr(m.summary)) + "</p>" : "") + tasksHtml(m) + "</div>";
  }

  // --- Motion -----------------------------------------------------------------

  function tick() {
    if (reduceMotion) { f = tf; l = tl; } else { f += (tf - f) * 0.2; l += (tl - l) * 0.2; }
    var settled = Math.abs(tf - f) < 0.002 && Math.abs(tl - l) < 0.002;
    if (settled) { f = tf; l = tl; }
    draw();
    raf = settled ? 0 : window.requestAnimationFrame(tick);
  }
  function kick() { if (!raf) raf = window.requestAnimationFrame(tick); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setTime(v) { tf = clamp(v, 0, maxRank); kick(); }
  function setTrack(v) { tl = clamp(Math.round(v), 0, tracks.length - 1); kick(); }
  function focusOn(m) { tf = m.rank; tl = trackIndex[m.track]; kick(); }
  function stepMilestone(dir) {
    var ranks = lists[tl].map(function (m) { return m.rank; });
    var target = dir > 0
      ? ranks.filter(function (r) { return r > tf + 0.01; })[0]
      : ranks.filter(function (r) { return r < tf - 0.01; }).pop();
    setTime(target === undefined ? tf + dir : target);
  }

  // Main wheel moves along time. The thumb wheel (a sideways wheel to the
  // browser) and Shift + wheel move one whole track per TRACK_STEP of travel;
  // the thumb wheel runs reversed, so rolling it forward goes up.
  var trackTravel = 0;
  var travelTimer = 0;
  svg.addEventListener("wheel", function (event) {
    event.preventDefault();
    var scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
    var dx = event.deltaX * scale;
    var dy = event.deltaY * scale;
    var travel = 0;
    if (event.shiftKey) { travel = dx || dy; dy = 0; } else if (dx) { travel = -dx; }
    if (dy) setTime(tf + dy / TIME_STEP);
    if (!travel) return;
    trackTravel += travel;
    window.clearTimeout(travelTimer);
    travelTimer = window.setTimeout(function () { trackTravel = 0; }, 400);
    while (Math.abs(trackTravel) >= TRACK_STEP) {
      var n = trackTravel > 0 ? 1 : -1;
      trackTravel -= n * TRACK_STEP;
      setTrack(tl + n);
    }
  }, { passive: false });

  svg.addEventListener("keydown", function (event) {
    var handled = true;
    if (event.key === "ArrowLeft") stepMilestone(-1);
    else if (event.key === "ArrowRight") stepMilestone(1);
    else if (event.key === "ArrowUp") setTrack(tl - 1);
    else if (event.key === "ArrowDown") setTrack(tl + 1);
    else if (event.key === "Home") setTime(0);
    else if (event.key === "End") setTime(maxRank);
    else handled = false;
    if (handled) event.preventDefault();
  });

  // Drag like grabbing a sheet: sideways moves along time, up and down switches
  // tracks (mouse and pen; on touch, up and down scrolls the page). A press
  // without movement is a click.
  var drag = null;
  svg.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, f: tf, l: tl, moved: false, id: event.pointerId, mouse: event.pointerType !== "touch" };
  });
  svg.addEventListener("pointermove", function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    var dx = event.clientX - drag.x;
    var dy = drag.mouse ? event.clientY - drag.y : 0;
    if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    if (!drag.moved) { drag.moved = true; svg.setPointerCapture(event.pointerId); svg.classList.add("is-dragging"); }
    setTime(drag.f - dx / (aR / k));
    if (drag.mouse) setTrack(drag.l - Math.round(dy / DRAG_TRACK_STEP));
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    var wasDrag = drag.moved;
    drag = null;
    svg.classList.remove("is-dragging");
    if (wasDrag) return;
    var target = event.target;
    if (target.getAttribute("data-id")) focusOn(byId[target.getAttribute("data-id")]);
    else if (target.getAttribute("data-track") !== null) setTrack(Number(target.getAttribute("data-track")));
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", function () { drag = null; svg.classList.remove("is-dragging"); });

  document.getElementById("lrNowBtn").addEventListener("click", function () {
    tf = home.f; tl = home.l; kick();
  });

  function showOnTimeline(m) {
    focusOn(m);
    document.getElementById("timeline").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  // --- Static texts, header and sections ---------------------------------------

  function renderStatic() {
    var text = L();
    document.documentElement.lang = current;
    document.title = data.project.name + " - " + text.pageTitle;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ui]"), function (el) {
      var value = el.getAttribute("data-ui").split(".").reduce(function (o, key) { return o && o[key]; }, text);
      if (typeof value === "string") el.textContent = value;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ui-aria]"), function (el) {
      el.setAttribute("aria-label", text[el.getAttribute("data-ui-aria")]);
    });
    document.getElementById("lrProject").textContent = data.project.name;
    var brand = document.getElementById("lrBrand");
    if (data.project.homeUrl) brand.setAttribute("href", data.project.homeUrl); else brand.removeAttribute("href");
    document.getElementById("lrHeading").textContent = data.project.name + " - " + text.pageTitle;

    var switcher = document.getElementById("lrLang");
    switcher.hidden = languages.length < 2;
    switcher.innerHTML = languages.map(function (code) {
      return '<button type="button" lang="' + esc(code) + '" data-lang="' + esc(code) + '" aria-pressed="' + (code === current) + '"'
        + (code === current ? ' class="is-active"' : "") + ">" + esc(code.toUpperCase()) + "</button>";
    }).join("");
  }

  function gotoButton(m, label) {
    return '<button type="button" class="lr-goto" data-goto="' + esc(m.id) + '">' + label + "</button>";
  }

  function card(m, withTasks) {
    return '<article class="lr-card">'
      + "<small>" + esc(tr(tracks[trackIndex[m.track]].title)) + (m.ref ? " · " + esc(m.ref) : "") + "</small>"
      + "<h3>" + gotoButton(m, esc(tr(m.title))) + "</h3>"
      + (m.summary ? "<p>" + esc(tr(m.summary)) + "</p>" : "")
      + (withTasks ? tasksHtml(m) : "") + "</article>";
  }

  function byRank(a, b) { return a.rank - b.rank; }

  function renderSections() {
    var text = L();
    var empty = '<p class="lr-empty">' + esc(text.nothing) + "</p>";
    var active = milestones.filter(function (m) { return m.status === "active"; }).sort(byRank);
    var next = milestones.filter(function (m) { return m.status === "next"; }).sort(byRank);
    document.getElementById("lrActive").innerHTML = active.length ? active.map(function (m) { return card(m, true); }).join("") : empty;
    document.getElementById("lrNext").innerHTML = next.length ? next.map(function (m) { return card(m, false); }).join("") : empty;
    document.getElementById("lrWaiting").innerHTML = data.waiting.length ? data.waiting.map(function (w) {
      var m = w.milestone ? byId[w.milestone] : null;
      var head = [w.ref ? esc(w.ref) : "", m ? gotoButton(m, esc(text.belongsTo) + " " + esc(tr(m.title))) : ""].filter(Boolean).join("<br>");
      return '<article class="lr-card lr-wait">'
        + (head ? "<small>" + head + "</small>" : "") + "<p>" + esc(tr(w.text)) + "</p></article>";
    }).join("") : empty;

    document.getElementById("lrScope").innerHTML = tracks.map(function (track, i) {
      var list = lists[i];
      var done = list.filter(function (m) { return m.status === "done"; }).length;
      return '<button type="button" class="lr-scope-row" data-scope="' + i + '">'
        + '<span class="lr-scope-name">' + esc(tr(track.title)) + "</span>"
        + '<span class="lr-scope-bar">' + list.map(function (m) {
          return '<i class="is-' + m.status + (m.final ? " is-final" : "") + '" title="' + esc(tr(m.title)) + " · " + esc(text.status[m.status]) + '"></i>';
        }).join("") + "</span>"
        + '<span class="lr-scope-count">' + done + " " + esc(text.of) + " " + list.length + "</span></button>";
    }).join("");

    document.getElementById("lrRecent").innerHTML = data.recent.map(function (r) {
      var titles = r.milestones.map(function (id) { return esc(tr(byId[id].title)); }).join(" · ");
      return '<li><time datetime="' + esc(r.date) + '">' + esc(formatDate(r.date)) + "</time><div>"
        + (titles ? "<b>" + titles + "</b>" : "") + "<span>" + esc(r.text) + "</span>"
        + "<small>" + esc(r.key || r.hash) + "</small></div></li>";
    }).join("") || "<li>" + empty + "</li>";

    var from = data.generatedFrom;
    var issues = [];
    if (data.freshness.unmapped.length) issues.push(text.unmapped(data.freshness.unmapped.length) + " (" + data.freshness.unmapped.map(function (x) { return x.key; }).join(", ") + ")");
    if (data.freshness.watchNewer.length) issues.push(text.watchNewer(data.freshness.watchNewer));
    var noEvidence = data.freshness.noEvidence || [];
    if (noEvidence.length) issues.push(text.noEvidence(noEvidence.length) + " (" + noEvidence.map(function (id) { return tr(byId[id].title); }).join(", ") + ")");
    // Status pill in the header: green when the plan matches git, orange when
    // not; the details show on hover or focus.
    var state = !from ? "none" : issues.length ? "stale" : "ok";
    var status = document.getElementById("lrStatus");
    status.hidden = false;
    status.className = "lr-status is-" + state;
    document.getElementById("lrStatusLabel").textContent = text.statusLabel[state];
    document.getElementById("lrStatusTip").innerHTML =
      "<b>" + esc(state === "none" ? text.noHistory : state === "stale" ? text.stale : text.fresh) + "</b>"
      + (issues.length ? "<ul>" + issues.map(function (issue) { return "<li>" + esc(issue) + "</li>"; }).join("") + "</ul>" : "")
      + (from ? "<small>" + esc(text.stand + " " + from.hash + " · " + formatDate(from.date)
        + (from.branch && from.branch !== data.mainBranch ? " · " + text.branch + " " + from.branch : "")) + "</small>" : "");

    document.getElementById("lrSvgTitle").textContent = text.svgTitle(milestones.length, tracks.length);
  }

  function renderAll() {
    renderStatic();
    renderSections();
    draw();
    updateFocusCard(true);
  }

  document.addEventListener("click", function (event) {
    var lang = event.target.closest && event.target.closest("[data-lang]");
    if (lang) {
      current = lang.getAttribute("data-lang");
      texts = null;
      try { window.localStorage.setItem(LANG_KEY, current); } catch (error) { /* Storage is optional. */ }
      renderAll();
      return;
    }
    var goto = event.target.closest && event.target.closest("[data-goto]");
    if (goto) { showOnTimeline(byId[goto.getAttribute("data-goto")]); return; }
    var scope = event.target.closest && event.target.closest("[data-scope]");
    if (scope) {
      var i = Number(scope.getAttribute("data-scope"));
      var open = lists[i].filter(function (m) { return m.status !== "done"; })[0] || lists[i][lists[i].length - 1];
      showOnTimeline(open);
    }
  });

  if ("ResizeObserver" in window) {
    new window.ResizeObserver(function () { measure(); draw(); }).observe(stage);
  } else {
    window.addEventListener("resize", function () { measure(); draw(); });
  }

  // New data redraws in place. A view resting on "now" moves with it; any other
  // view stays on the milestone in focus (or the same track).
  function update(next) {
    var atHome = tf === home.f && tl === home.l;
    var anchor = byId[focusedId];
    var offset = anchor ? tf - anchor.rank : 0;
    var trackId = tracks[tl] && tracks[tl].id;
    load(next);
    var same = anchor && byId[anchor.id];
    if (atHome) { tf = home.f; tl = home.l; }
    else if (same) { tf = clamp(same.rank + offset, 0, maxRank); tl = trackIndex[same.track]; }
    else { tf = clamp(tf, 0, maxRank); tl = trackId in trackIndex ? trackIndex[trackId] : clamp(tl, 0, tracks.length - 1); }
    renderAll();
    kick();
  }

  themeChanged = function () { readFade(); draw(); };
  readFade();
  measure();
  renderAll();
  watchData(update);
})();
