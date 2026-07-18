import { buildTrack } from "./track.js";
import {
  createCars,
  resetCarsOnTrack,
  updatePlayer,
  updateAI,
  syncCarToTrack,
} from "./cars.js";
import { resizeCanvas, drawScene } from "./render.js";

const PRICES = { protector: 100, engine: 300, restart: 200 };
const LEVEL_STARS = 100;
const MAX_PROTECTORS = 2;

const el = {
  canvas: document.getElementById("race-canvas"),
  stars: document.getElementById("star-count"),
  level: document.getElementById("level-num"),
  dist: document.getElementById("dist-num"),
  speed: document.getElementById("speed-num"),
  protectors: document.getElementById("protector-count"),
  engines: document.getElementById("engine-count"),
  restarts: document.getElementById("restart-count"),
  accelValue: document.getElementById("accel-value"),
  accelBtn: document.getElementById("btn-accel"),
  accelSlider: document.getElementById("accel-slider"),
  toast: document.getElementById("toast"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayShop: document.getElementById("overlay-shop"),
  overlayResult: document.getElementById("overlay-result"),
  resultTitle: document.getElementById("result-title"),
  resultBody: document.getElementById("result-body"),
};

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  accel: 0,
  accelHold: false,
};

const state = {
  running: false,
  level: 1,
  stars: 0,
  protectors: 2,
  engines: 2,
  restarts: 1,
  restartUsedThisLevel: false,
  track: null,
  cars: createCars(),
  cam: { x: 0, y: 0 },
  time: 0,
  w: 960,
  h: 540,
  resultShown: false,
};

function toast(msg) {
  el.toast.hidden = false;
  el.toast.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.toast.hidden = true;
  }, 1800);
}

function syncHud() {
  el.stars.textContent = String(state.stars);
  el.level.textContent = String(state.level);
  const player = state.cars[0];
  el.dist.textContent = String(Math.floor(player?.meters || 0));
  el.speed.textContent = String(Math.max(0, Math.round(player?.speed || 0)));
  el.protectors.textContent = String(state.protectors);
  el.engines.textContent = String(state.engines);
  el.restarts.textContent = String(state.restarts);
  el.accelValue.textContent = String(Math.round(input.accel));
  el.accelSlider.value = String(Math.round(input.accel));

  document.getElementById("btn-protector").disabled = state.protectors <= 0 || !state.running;
  document.getElementById("btn-engine").disabled = state.engines <= 0 || !state.running;
  document.getElementById("btn-restart").disabled =
    state.restarts <= 0 || state.restartUsedThisLevel || !state.running;
}

function startLevel(level = state.level) {
  state.level = level;
  state.track = buildTrack(level);
  // Each level grants two engines and one restart charge
  state.engines = 2;
  state.restarts = 1;
  state.restartUsedThisLevel = false;
  resetCarsOnTrack(state.cars, state.track);
  state.cam.x = state.cars[0].x;
  state.cam.y = state.cars[0].y;
  input.accel = 0;
  state.resultShown = false;
  state.running = true;
  el.overlayTitle.hidden = true;
  el.overlayResult.hidden = true;
  el.overlayShop.hidden = true;
  syncHud();
  toast(`Level ${level} — two engines ready`);
}

function useProtector() {
  if (!state.running || state.protectors <= 0) return;
  const player = state.cars[0];
  if (player.shieldTimer > 0 || player.shieldActive) {
    toast("Shield already active");
    return;
  }
  state.protectors -= 1;
  player.shieldActive = true;
  player.shieldTimer = 6;
  syncHud();
  toast("Protector armed");
}

function useEngine() {
  if (!state.running || state.engines <= 0) return;
  const player = state.cars[0];
  if (player.flying || player.crashed) return;
  state.engines -= 1;
  player.boostTimer = 1.8;
  // Quick charge: snap accel up
  input.accel = Math.min(200, Math.max(input.accel, 180));
  syncHud();
  toast("Engine boost! Turn in time!");
}

function useRestart() {
  if (!state.running || state.restarts <= 0 || state.restartUsedThisLevel) return;
  state.restarts -= 1;
  state.restartUsedThisLevel = true;
  const player = state.cars[0];
  const keepMeters = Math.max(0, player.meters - 8);
  player.crashed = false;
  player.flying = false;
  player.flyTimer = 0;
  player.speed = 0;
  player.boostTimer = 0;
  player.lateral = 0;
  player.meters = keepMeters;
  player.finished = false;
  syncCarToTrack(player, state.track);
  syncHud();
  toast("Restart used (once per level)");
}

function onPlayerCrash() {
  if (state.resultShown) return;
  // Auto-consume protector if available when crash settles
  if (state.protectors > 0) {
    state.protectors -= 1;
    const player = state.cars[0];
    player.crashed = false;
    player.flying = false;
    player.lateral = 0;
    player.meters = Math.max(0, player.meters - 4);
    player.speed = 0;
    syncCarToTrack(player, state.track);
    player.shieldTimer = 2;
    syncHud();
    toast("Protector saved you!");
    return;
  }
  // Offer restart if available
  if (state.restarts > 0 && !state.restartUsedThisLevel) {
    useRestart();
    return;
  }
  showResult(false);
}

function pickupQuestion(q) {
  q.taken = true;
  const roll = Math.random();
  if (roll < 0.34) {
    if (state.protectors < MAX_PROTECTORS) {
      state.protectors += 1;
      toast("? → Protector");
    } else {
      state.stars += 25;
      toast("? → Protector full · +25 stars");
    }
  } else if (roll < 0.67) {
    if (state.restarts < 1 && !state.restartUsedThisLevel) {
      state.restarts = 1;
      toast("? → Restart button");
    } else if (state.restartUsedThisLevel) {
      state.stars += 40;
      toast("? → Restart already used · +40 stars");
    } else {
      state.stars += 40;
      toast("? → Restart already ready · +40 stars");
    }
  } else {
    state.engines += 1;
    toast("? → Accelerator / Engine");
  }
  syncHud();
}

function checkPickups() {
  const player = state.cars[0];
  for (const q of state.track.questionMarks) {
    if (q.taken) continue;
    const dx = q.x - player.x;
    const dy = q.y - player.y;
    if (dx * dx + dy * dy < 36 * 36) pickupQuestion(q);
  }
}

function showResult(won) {
  state.resultShown = true;
  state.running = false;
  el.overlayResult.hidden = false;
  if (won) {
    state.stars += LEVEL_STARS;
    el.resultTitle.textContent = "Finish!";
    const place = placement();
    el.resultBody.textContent = `You placed ${place}. +${LEVEL_STARS} stars. Total ★ ${state.stars}. Visit the shop for protectors, engines, and restart.`;
    document.getElementById("btn-next").hidden = false;
  } else {
    el.resultTitle.textContent = "Flew Out!";
    el.resultBody.textContent =
      "No protector or restart left. The game restarts this level. Earn stars to stock the armory.";
    document.getElementById("btn-next").hidden = true;
  }
  syncHud();
}

function placement() {
  const sorted = [...state.cars].sort((a, b) => b.meters - a.meters);
  const idx = sorted.findIndex((c) => c.isPlayer);
  return ["1st", "2nd", "3rd"][idx] || "—";
}

function buy(item) {
  const price = PRICES[item];
  if (state.stars < price) {
    toast("Not enough stars");
    return;
  }
  if (item === "protector") {
    if (state.protectors >= MAX_PROTECTORS) {
      toast("Max 2 protectors — use one first");
      return;
    }
    state.protectors += 1;
  } else if (item === "engine") {
    state.engines += 1;
  } else if (item === "restart") {
    if (state.restarts >= 1 && !state.restartUsedThisLevel) {
      toast("Restart already ready");
      return;
    }
    if (state.restartUsedThisLevel) {
      toast("Restart already used this level");
      return;
    }
    state.restarts = 1;
  }
  state.stars -= price;
  syncHud();
  toast(`Bought ${item}`);
}

function update(dt) {
  if (!state.running || !state.track) return;

  if (input.accelHold) {
    input.accel = Math.min(200, input.accel + 90 * dt);
  } else if (!document.activeElement || document.activeElement.id !== "accel-slider") {
    // Drift down gently so the white button must be held for top speed
    input.accel = Math.max(0, input.accel - 25 * dt);
  }

  const player = state.cars[0];
  updatePlayer(player, input, dt, state.track);
  for (let i = 1; i < state.cars.length; i++) {
    updateAI(state.cars[i], dt, state.track, state.cars);
  }

  checkPickups();

  // Camera follows player
  state.cam.x += (player.x - state.cam.x) * Math.min(1, 6 * dt);
  state.cam.y += (player.y - state.cam.y) * Math.min(1, 6 * dt);

  if (player.crashed && !state.resultShown) onPlayerCrash();
  if (player.finished && !state.resultShown) showResult(true);

  syncHud();
}

function frame(ts) {
  if (!frame.last) frame.last = ts;
  let dt = (ts - frame.last) / 1000;
  frame.last = ts;
  dt = Math.min(0.05, dt);
  state.time += dt;

  const size = resizeCanvas(el.canvas);
  state.w = size.w;
  state.h = size.h;

  update(dt);

  const ctx = el.canvas.getContext("2d");
  if (state.track) {
    drawScene(ctx, {
      track: state.track,
      cars: state.cars,
      cam: state.cam,
      w: state.w,
      h: state.h,
      time: state.time,
    });
  } else {
    ctx.fillStyle = "#1e2a30";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  requestAnimationFrame(frame);
}

function bindControls() {
  const dirMap = {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
  };

  window.addEventListener("keydown", (e) => {
    const d = dirMap[e.code];
    if (d) {
      input[d] = true;
      document.getElementById(`btn-${d}`)?.classList.add("active");
      e.preventDefault();
    }
    if (e.code === "Space") {
      input.accelHold = true;
      el.accelBtn.classList.add("active");
      e.preventDefault();
    }
    if (e.code === "KeyE") useEngine();
    if (e.code === "KeyQ") useProtector();
    if (e.code === "KeyR") useRestart();
  });

  window.addEventListener("keyup", (e) => {
    const d = dirMap[e.code];
    if (d) {
      input[d] = false;
      document.getElementById(`btn-${d}`)?.classList.remove("active");
    }
    if (e.code === "Space") {
      input.accelHold = false;
      el.accelBtn.classList.remove("active");
    }
  });

  for (const dir of ["up", "down", "left", "right"]) {
    const btn = document.getElementById(`btn-${dir}`);
    const set = (v) => {
      input[dir] = v;
      btn.classList.toggle("active", v);
    };
    btn.addEventListener("pointerdown", (e) => {
      btn.setPointerCapture(e.pointerId);
      set(true);
    });
    btn.addEventListener("pointerup", () => set(false));
    btn.addEventListener("pointercancel", () => set(false));
    btn.addEventListener("pointerleave", () => set(false));
  }

  const holdAccel = (v) => {
    input.accelHold = v;
    el.accelBtn.classList.toggle("active", v);
  };
  el.accelBtn.addEventListener("pointerdown", (e) => {
    el.accelBtn.setPointerCapture(e.pointerId);
    holdAccel(true);
  });
  el.accelBtn.addEventListener("pointerup", () => holdAccel(false));
  el.accelBtn.addEventListener("pointercancel", () => holdAccel(false));
  el.accelBtn.addEventListener("pointerleave", () => holdAccel(false));

  el.accelSlider.addEventListener("input", () => {
    input.accel = Number(el.accelSlider.value);
    el.accelValue.textContent = String(Math.round(input.accel));
  });

  document.getElementById("btn-protector").addEventListener("click", useProtector);
  document.getElementById("btn-engine").addEventListener("click", useEngine);
  document.getElementById("btn-restart").addEventListener("click", useRestart);

  document.getElementById("btn-start").addEventListener("click", () => startLevel(1));
  document.getElementById("btn-shop").addEventListener("click", () => {
    el.overlayShop.hidden = false;
  });
  document.getElementById("btn-close-shop").addEventListener("click", () => {
    el.overlayShop.hidden = true;
  });

  document.querySelectorAll(".shop-card").forEach((card) => {
    card.addEventListener("click", () => buy(card.dataset.buy));
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    startLevel(state.level + 1);
  });
  document.getElementById("btn-retry").addEventListener("click", () => {
    startLevel(state.level);
  });
}

// Preview track on title screen
state.track = buildTrack(1);
resetCarsOnTrack(state.cars, state.track);
state.cam.x = state.cars[0].x;
state.cam.y = state.cars[0].y;
state.running = false;

bindControls();
syncHud();
requestAnimationFrame(frame);
