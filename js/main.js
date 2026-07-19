(function (Game) {
  "use strict";

  const {
    buildTrack,
    createCars,
    resetCarsOnTrack,
    updatePlayer,
    updateAI,
    syncCarToTrack,
    resizeCanvas,
    drawScene,
  } = Game;

const BASE_LEVEL_STARS = 100;
const BASE_LEVEL_ENGINES = 2;
const BASE_LEVEL_RESTARTS = 1;

/** 第 1 關基準獎勵，之後每一關皆為上一關的兩倍 */
function levelMultiplier(level) {
  return 2 ** Math.max(0, (level || 1) - 1);
}

function levelStarReward(level) {
  return BASE_LEVEL_STARS * levelMultiplier(level);
}

function addStock(s, key, amount) {
  s[key] += amount;
  return amount;
}

/** Shop catalog. Higher unlockLevel items appear after reaching that level. */
const SHOP_CATALOG = [
  {
    id: "protector",
    name: "防護罩",
    desc: "避免一次飛出軌道（可無限購買）",
    basePrice: 100,
    unlockLevel: 1,
    apply(s) {
      addStock(s, "protectors", 1);
      return null;
    },
  },
  {
    id: "engine",
    name: "噴射引擎",
    desc: "獲得一次超級噴射（可無限購買）",
    basePrice: 300,
    unlockLevel: 1,
    apply(s) {
      addStock(s, "engines", 1);
      return null;
    },
  },
  {
    id: "restart",
    name: "重啟",
    desc: "獲得一次重啟機會（可無限購買）",
    basePrice: 200,
    unlockLevel: 1,
    apply(s) {
      addStock(s, "restarts", 1);
      return null;
    },
  },
  {
    id: "armorPack",
    name: "裝甲包",
    desc: "防護罩 +2（可無限購買）",
    basePrice: 400,
    unlockLevel: 2,
    apply(s) {
      addStock(s, "protectors", 2);
      return null;
    },
  },
  {
    id: "nitroPack",
    name: "氮氣包",
    desc: "一次獲得 3 次噴射（可無限購買）",
    basePrice: 600,
    unlockLevel: 2,
    apply(s) {
      addStock(s, "engines", 3);
      return null;
    },
  },
  {
    id: "commandKit",
    name: "指揮套件",
    desc: "噴射 +2、重啟 +1、防護罩 +1（可無限購買）",
    basePrice: 900,
    unlockLevel: 3,
    apply(s) {
      addStock(s, "engines", 2);
      addStock(s, "restarts", 1);
      addStock(s, "protectors", 1);
      return null;
    },
  },
];

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
  shopGrid: document.getElementById("shop-grid"),
  shopStars: document.getElementById("shop-star-count"),
};

const input = {
  up: false,
  left: false,
  right: false,
  accel: 0,
  accelHold: false,
};

const state = {
  running: false,
  level: 1,
  highestLevel: 1,
  stars: 250,
  protectors: 2,
  engines: 0,
  restarts: 0,
  prices: Object.fromEntries(SHOP_CATALOG.map((item) => [item.id, item.basePrice])),
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
  if (el.shopStars) el.shopStars.textContent = String(state.stars);

  document.getElementById("btn-protector").disabled = state.protectors <= 0 || !state.running;
  document.getElementById("btn-engine").disabled = state.engines <= 0 || !state.running;
  document.getElementById("btn-restart").disabled = state.restarts <= 0 || !state.running;
}

function openShop() {
  el.overlayShop.hidden = false;
  renderShop();
  setShopStatus("點擊「購買」扣星星並獲得物品。");
}

function closeShop() {
  el.overlayShop.hidden = true;
}

function setShopStatus(msg) {
  const status = document.getElementById("shop-status");
  if (status) status.textContent = msg;
}

function renderShop() {
  if (!el.shopGrid) return;
  el.shopStars.textContent = String(state.stars);
  el.shopGrid.innerHTML = "";

  for (const item of SHOP_CATALOG) {
    const unlocked = state.highestLevel >= item.unlockLevel;
    const price = state.prices[item.id];
    const canAfford = state.stars >= price;
    const card = document.createElement("div");
    card.className = `shop-card${unlocked ? "" : " locked"}`;
    card.dataset.buy = item.id;
    card.innerHTML = `
      <span class="shop-name">${item.name}</span>
      <span class="shop-desc">${item.desc}</span>
      <span class="shop-price" data-price>${unlocked ? `★ ${price}` : `第 ${item.unlockLevel} 關解鎖`}</span>
      ${unlocked ? `<span class="shop-meta">購買後下次 ★ ${price * 2}</span>` : ""}
      <button type="button" class="shop-buy-btn" data-buy="${item.id}" ${
        !unlocked || !canAfford ? "disabled" : ""
      }>
        ${!unlocked ? "未解鎖" : !canAfford ? "星幣不足" : `購買 ★ ${price}`}
      </button>
    `;
    el.shopGrid.appendChild(card);
  }
}

function startLevel(level = state.level, { grantKit = true } = {}) {
  state.level = level;
  state.highestLevel = Math.max(state.highestLevel, level);
  state.track = buildTrack(level);
  // Entering a level (not retry) grants kit; amount doubles each level
  if (grantKit) {
    const mult = levelMultiplier(level);
    addStock(state, "engines", BASE_LEVEL_ENGINES * mult);
    addStock(state, "restarts", BASE_LEVEL_RESTARTS * mult);
  }
  resetCarsOnTrack(state.cars, state.track);
  state.cam.x = state.cars[0].x;
  state.cam.y = state.cars[0].y;
  input.accel = 0;
  state.resultShown = false;
  state.running = true;
  el.overlayTitle.hidden = true;
  el.overlayResult.hidden = true;
  closeShop();
  syncHud();
  const mult = levelMultiplier(level);
  toast(
    `第 ${level} 關 — 噴射 +${BASE_LEVEL_ENGINES * mult}、重啟 +${BASE_LEVEL_RESTARTS * mult}（通關 ★${levelStarReward(level)}）`
  );
}

function useProtector() {
  if (!state.running || state.protectors <= 0) return;
  const player = state.cars[0];
  if (player.shieldTimer > 0 || player.shieldActive) {
    toast("防護罩已啟動");
    return;
  }
  state.protectors -= 1;
  player.shieldActive = true;
  player.shieldTimer = 6;
  syncHud();
  toast("已裝備防護罩");
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
  toast("超級噴射！記得及時轉彎！");
}

function useRestart() {
  if (!state.running || state.restarts <= 0) return;
  state.restarts -= 1;
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
  toast(`已使用重啟（剩餘 ${state.restarts}）`);
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
    toast("防護罩救了你！");
    return;
  }
  // Offer restart if available
  if (state.restarts > 0) {
    useRestart();
    return;
  }
  showResult(false);
}

function pickupQuestion(q) {
  q.taken = true;
  const roll = Math.random();
  if (roll < 0.34) {
    addStock(state, "protectors", 1);
    toast("? → 防護罩");
  } else if (roll < 0.67) {
    addStock(state, "restarts", 1);
    toast("? → 重啟 +1");
  } else {
    addStock(state, "engines", 1);
    toast("? → 噴射引擎");
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
    const reward = levelStarReward(state.level);
    const nextReward = levelStarReward(state.level + 1);
    state.stars += reward;
    el.resultTitle.textContent = "完成！";
    const place = placement();
    el.resultBody.textContent = `名次 ${place}。本關 +${reward} 星，目前 ★ ${state.stars}。下一關通關獎勵會變成 ★${nextReward}（兩倍）。`;
    document.getElementById("btn-next").hidden = false;
  } else {
    el.resultTitle.textContent = "飛出跑道！";
    el.resultBody.textContent =
      "沒有防護罩或重啟可用。可先到商店購買，再重試本關。";
    document.getElementById("btn-next").hidden = true;
  }
  syncHud();
}

function placement() {
  const sorted = [...state.cars].sort((a, b) => b.meters - a.meters);
  const idx = sorted.findIndex((c) => c.isPlayer);
  return ["第 1 名", "第 2 名", "第 3 名"][idx] || "—";
}

function buy(itemId) {
  const item = SHOP_CATALOG.find((entry) => entry.id === itemId);
  if (!item) return;
  if (state.highestLevel < item.unlockLevel) {
    setShopStatus(`第 ${item.unlockLevel} 關後才解鎖`);
    toast(`第 ${item.unlockLevel} 關後才解鎖`);
    return;
  }
  const price = state.prices[itemId];
  if (state.stars < price) {
    setShopStatus(`星幣不足（需要 ★ ${price}，目前 ★ ${state.stars}）`);
    toast("星幣不足");
    return;
  }
  const err = item.apply(state);
  if (err) {
    setShopStatus(err);
    toast(err);
    return;
  }
  state.stars -= price;
  state.prices[itemId] = price * 2;
  syncHud();
  renderShop();
  setShopStatus(`已購買 ${item.name}，扣除 ★ ${price}，剩餘 ★ ${state.stars}`);
  toast(`已購買 ${item.name}！-★${price}`);
}

function update(dt) {
  if (!state.running || !state.track) return;

  // ▲ / W (or accel button) charges speed; release drifts down
  if (input.accelHold || input.up) {
    input.accel = Math.min(200, input.accel + 90 * dt);
  } else if (!document.activeElement || document.activeElement.id !== "accel-slider") {
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
  // 鎖定單螢幕：禁止滾輪造成頁面捲動（商店 / 說明面板可捲動）
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.target.closest(".screen-shop, .panel, .shop-grid")) return;
      e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (
        e.target.closest(
          "input, button, .shop-buy-btn, .screen-shop, .panel, .shop-grid"
        )
      ) {
        return;
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // 手機長按控制鈕時不跳出系統選單
  document.getElementById("app").addEventListener("contextmenu", (e) => {
    if (e.target.closest("button, .dir, .accel-btn, canvas")) {
      e.preventDefault();
    }
  });

  const dirMap = {
    ArrowUp: "up",
    KeyW: "up",
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
      if (d === "up") el.accelBtn.classList.add("active");
      e.preventDefault();
    }
    if (e.repeat) return;
    // 1 = Start
    if (e.code === "Digit1" || e.code === "Numpad1") {
      if (!el.overlayTitle.hidden) {
        startLevel(1);
        e.preventDefault();
      }
    }
    // 5 = super jet engine
    if (e.code === "Digit5" || e.code === "Numpad5") {
      useEngine();
      e.preventDefault();
    }
    // 8 = protector / shield
    if (e.code === "Digit8" || e.code === "Numpad8") {
      useProtector();
      e.preventDefault();
    }
    // 7 = restart
    if (e.code === "Digit7" || e.code === "Numpad7") {
      useRestart();
      e.preventDefault();
    }
    // Q = open / close shop (purchase)
    if (e.code === "KeyQ") {
      if (el.overlayShop.hidden) openShop();
      else closeShop();
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    const d = dirMap[e.code];
    if (d) {
      input[d] = false;
      document.getElementById(`btn-${d}`)?.classList.remove("active");
      if (d === "up" && !input.accelHold) el.accelBtn.classList.remove("active");
    }
  });

  /** 多指觸控：用 pointerId 追蹤，避免一手按住加速時另一手按功能鍵會鬆開 */
  function bindHoldControl(btn, onHold) {
    const pointers = new Set();
    const sync = () => onHold(pointers.size > 0);

    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.add(e.pointerId);
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      sync();
      e.preventDefault();
    });

    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      sync();
    };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  }

  for (const dir of ["up", "left", "right"]) {
    const btn = document.getElementById(`btn-${dir}`);
    bindHoldControl(btn, (held) => {
      input[dir] = held;
      btn.classList.toggle("active", held);
      if (dir === "up") el.accelBtn.classList.toggle("active", held || input.accelHold);
    });
  }

  bindHoldControl(el.accelBtn, (held) => {
    input.accelHold = held;
    el.accelBtn.classList.toggle("active", held || input.up);
  });

  el.accelSlider.addEventListener("input", () => {
    input.accel = Number(el.accelSlider.value);
    el.accelValue.textContent = String(Math.round(input.accel));
  });

  /** 功能鍵用 pointerdown，可與按住加速同時觸發（不依賴 click） */
  function bindActionButton(id, action) {
    const btn = document.getElementById(id);
    btn.addEventListener("pointerdown", (e) => {
      if (btn.disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      action();
    });
  }

  bindActionButton("btn-protector", useProtector);
  bindActionButton("btn-engine", useEngine);
  bindActionButton("btn-restart", useRestart);

  document.getElementById("btn-start").addEventListener("click", () => startLevel(1));
  document.getElementById("btn-title-shop").addEventListener("click", openShop);
  document.getElementById("btn-result-shop").addEventListener("click", openShop);
  document.getElementById("btn-shop").addEventListener("click", openShop);
  document.getElementById("btn-close-shop").addEventListener("click", closeShop);

  el.shopGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".shop-buy-btn");
    if (!btn || btn.disabled) return;
    e.preventDefault();
    buy(btn.dataset.buy);
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    startLevel(state.level + 1, { grantKit: true });
  });
  document.getElementById("btn-retry").addEventListener("click", () => {
    startLevel(state.level, { grantKit: false });
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
})(window.Game = window.Game || {});
