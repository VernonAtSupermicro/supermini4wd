/** Mini 4WD car entities: player + skilled AI. */
(function (Game) {
  "use strict";

  const { samplePath, pathNormal, pathAngle } = Game;

  const COLORS = [
    { body: "#6d7580", trim: "#c5ccd4", cab: "#1a2430", accent: "#b22234" },
    { body: "#3d5c48", trim: "#a8c4b0", cab: "#142018", accent: "#f0e6c8" },
    { body: "#3a4f66", trim: "#9bb0c4", cab: "#121820", accent: "#d4a017" },
  ];

  const LANE_SPACING = 42;
  /** AI 專用車道偏離（比起步間距更開，避免兩台電腦重疊） */
  const AI_LANE_BIAS = { 1: -62, 2: 62 };
  /** 速度恢復為原本（無額外倍率） */
  const SPEED_SCALE = 1;

  function createCars() {
    return [0, 1, 2].map((i) => {
      const lane = i === 0 ? -LANE_SPACING : AI_LANE_BIAS[i];
      return {
        id: i,
        isPlayer: i === 0,
        color: COLORS[i],
        x: 0,
        y: 0,
        angle: 0,
        meters: 2 + i * 1.2,
        lateral: lane,
        speed: 0,
        accel: i === 0 ? 0 : 145 + i * 18,
        boostTimer: 0,
        shieldActive: false,
        shieldTimer: 0,
        finished: false,
        flying: false,
        flyTimer: 0,
        vx: 0,
        vy: 0,
        crashed: false,
        aiLaneBias: AI_LANE_BIAS[i] || 0,
        aiTargetLateral: lane,
        aiBoostCooldown: 2 + i * 3.5,
      };
    });
  }

  function resetCarsOnTrack(cars, track) {
    for (const car of cars) {
      car.meters = 2 + car.id * 1.2;
      car.lateral = car.isPlayer ? -LANE_SPACING : car.aiLaneBias;
      car.speed = 0;
      car.boostTimer = 0;
      car.flying = false;
      car.flyTimer = 0;
      car.finished = false;
      car.crashed = false;
      car.shieldActive = false;
      car.shieldTimer = 0;
      if (!car.isPlayer) car.accel = 145 + car.id * 18;
      syncCarToTrack(car, track);
    }
  }

  function syncCarToTrack(car, track) {
    const p = samplePath(track.points, track.dists, car.meters);
    const n = pathNormal(track.points, track.dists, car.meters);
    car.x = p.x + n.x * car.lateral;
    car.y = p.y + n.y * car.lateral;
    car.angle = p.angle + (car.speed < -0.5 ? Math.PI : 0);
  }

  function updatePlayer(car, input, dt, track) {
    if (car.crashed) return;
    if (car.flying) {
      updateFlying(car, dt, track);
      if (!car.flying && car.isPlayer) car.crashed = true;
      return;
    }
    if (car.finished) return;

    let steer = 0;
    if (input.left) steer -= 1;
    if (input.right) steer += 1;

    car.accel = Math.max(0, Math.min(200, input.accel));

    // Left/right shift lane while holding ▲ to accelerate forward
    car.lateral += steer * 95 * dt;

    const half = track.halfWidth - 22;
    let maxSpd = (8 + (car.accel / 200) * 30) * SPEED_SCALE;
    if (car.boostTimer > 0) {
      maxSpd *= 1.9;
      car.boostTimer -= dt;
    }

    // ▲ / W charges accel and drives forward; no reverse
    let forwardWant = 0;
    if (car.accel > 0) {
      forwardWant = maxSpd * (car.accel / 200);
    } else if (input.up) {
      forwardWant = maxSpd * 0.35;
    }

    car.speed += (forwardWant - car.speed) * Math.min(1, 3.4 * dt);
    car.meters += car.speed * dt;
    if (car.meters < 0) {
      car.meters = 0;
      car.speed = 0;
    }

    if (car.meters >= track.totalMeters) {
      car.meters = track.totalMeters;
      car.finished = true;
      car.speed = 0;
    }

    syncCarToTrack(car, track);

    const over = Math.abs(car.lateral) - half;
    const dangerous = car.boostTimer > 0 || car.speed > 24 * SPEED_SCALE;

    // Boost + no turn on curve/edge → fly out
    if (car.boostTimer > 0 && sharpCurve(track, car.meters) && !input.left && !input.right) {
      if (Math.abs(car.lateral) > half * 0.4) {
        if (consumeShield(car)) {
          car.lateral = Math.sign(car.lateral || 1) * half * 0.3;
        } else {
          beginFlyOut(car);
          return;
        }
      }
    }

    if (over > 6) {
      if (consumeShield(car)) {
        car.lateral = Math.sign(car.lateral) * half;
        car.speed *= 0.6;
      } else if (dangerous) {
        beginFlyOut(car);
        return;
      } else {
        car.lateral = Math.sign(car.lateral) * half;
        car.speed *= 0.45;
      }
    }

    if (car.shieldTimer > 0) car.shieldTimer -= dt;
  }

  function updateAI(car, dt, track, rivals) {
    if (car.flying) {
      updateFlying(car, dt, track);
      return;
    }
    if (car.finished || car.crashed) return;

    car.aiBoostCooldown -= dt;
    const curve = curvature(track, car.meters);
    // 各自守左／右車道，彎道只微調，不要都擠同一條線
    car.aiTargetLateral = car.aiLaneBias - curve * 18;

    for (const r of rivals) {
      if (r === car || r.flying) continue;
      const dm = Math.abs(r.meters - car.meters);
      const dLat = car.lateral - r.lateral;
      // 前後接近時用力左右拉開，避免重疊
      if (dm < 20 && Math.abs(dLat) < 70) {
        const side =
          Math.sign(dLat) ||
          Math.sign(car.aiLaneBias - (r.aiLaneBias || 0)) ||
          (car.id < r.id ? -1 : 1);
        const sep = (1 - dm / 20) * 55;
        car.aiTargetLateral += side * sep;
      }
      // 正後方時略偏外側超車，不要貼著對方
      const ahead = r.meters - car.meters;
      if (ahead > 0 && ahead < 14) {
        const passSide =
          Math.sign(car.aiLaneBias) || (car.id < r.id ? -1 : 1);
        car.aiTargetLateral += passSide * 22;
      }
    }

    const limit = track.halfWidth - 32;
    car.aiTargetLateral = Math.max(-limit, Math.min(limit, car.aiTargetLateral));
    car.lateral += (car.aiTargetLateral - car.lateral) * Math.min(1, 4.2 * dt);

    // 速度略有差異，噴射節奏錯開，減少並排重疊
    let maxSpd = (26.5 + car.id * 2.4) * SPEED_SCALE;
    if (Math.abs(curve) > 0.15) maxSpd *= 0.88;
    if (car.boostTimer > 0) {
      maxSpd *= 1.65;
      car.boostTimer -= dt;
    }

    if (car.aiBoostCooldown <= 0 && Math.abs(curve) < 0.01 && car.meters > 25) {
      car.boostTimer = 1.35;
      car.aiBoostCooldown = 7 + car.id * 4;
    }

    car.speed += (maxSpd - car.speed) * Math.min(1, 3 * dt);
    car.meters += car.speed * dt;

    if (car.meters >= track.totalMeters) {
      car.meters = track.totalMeters;
      car.finished = true;
      car.speed = 0;
    }

    syncCarToTrack(car, track);

    if (Math.abs(car.lateral) > track.halfWidth + 8) {
      beginFlyOut(car);
    }
  }

  function consumeShield(car) {
    if (car.shieldActive || car.shieldTimer > 0) {
      car.shieldActive = false;
      car.shieldTimer = 0;
      return true;
    }
    return false;
  }

  function beginFlyOut(car) {
    car.flying = true;
    car.flyTimer = 1.35;
    const thrust = Math.max(12, Math.abs(car.speed)) * 16;
    car.vx = Math.cos(car.angle) * thrust + (Math.random() - 0.5) * 50;
    car.vy = Math.sin(car.angle) * thrust + (Math.random() - 0.5) * 50;
    car.speed = 0;
    car.boostTimer = 0;
  }

  function updateFlying(car, dt, track) {
    car.flyTimer -= dt;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.angle += 7 * dt;
    car.vx *= 0.985;
    car.vy *= 0.985;
    if (car.flyTimer <= 0) {
      car.flying = false;
      if (!car.isPlayer) {
        car.lateral = 0;
        car.meters = Math.max(0, car.meters - 6);
        syncCarToTrack(car, track);
      }
    }
  }

  function curvature(track, meters) {
    const a0 = pathAngle(track.points, track.dists, meters);
    const a1 = pathAngle(track.points, track.dists, meters + 3);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function sharpCurve(track, meters) {
    return Math.abs(curvature(track, meters)) > 0.16;
  }

  /** Draw an F-22 Raptor–style fighter (nose points +X). */
  function drawCar(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.scale(1.55, 1.55);

    if (car.shieldTimer > 0 || car.shieldActive) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 28, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120, 210, 255, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(120, 210, 255, 0.12)";
      ctx.fill();
    }

    // Afterburner when boosting
    if (car.boostTimer > 0) {
      const flicker = 8 + Math.random() * 10;
      ctx.fillStyle = "rgba(255, 180, 60, 0.75)";
      ctx.beginPath();
      ctx.moveTo(-30, -5);
      ctx.lineTo(-30 - flicker, -1.5);
      ctx.lineTo(-30 - flicker * 0.7, 0);
      ctx.lineTo(-30 - flicker, 1.5);
      ctx.lineTo(-30, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(120, 200, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(-30, -3);
      ctx.lineTo(-30 - flicker * 0.55, 0);
      ctx.lineTo(-30, 3);
      ctx.closePath();
      ctx.fill();
    }

    const body = car.color.body;
    const trim = car.color.trim;
    const cab = car.color.cab;
    const accent = car.color.accent;

    // Main wings (diamond / trapezoid)
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-6, -26);
    ctx.lineTo(-22, -24);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-22, 24);
    ctx.lineTo(-6, 26);
    ctx.closePath();
    ctx.fill();

    // Fuselage
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(18, -4.5);
    ctx.lineTo(-28, -5.5);
    ctx.lineTo(-32, -3);
    ctx.lineTo(-32, 3);
    ctx.lineTo(-28, 5.5);
    ctx.lineTo(18, 4.5);
    ctx.closePath();
    ctx.fill();

    // Darker belly stripe
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(10, -2.2);
    ctx.lineTo(-26, -2.8);
    ctx.lineTo(-26, 2.8);
    ctx.lineTo(10, 2.2);
    ctx.closePath();
    ctx.fill();

    // Twin vertical stabilizers
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-30, -16);
    ctx.lineTo(-26, -6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.lineTo(-30, 16);
    ctx.lineTo(-26, 6);
    ctx.closePath();
    ctx.fill();

    // Horizontal tails
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-20, -5);
    ctx.lineTo(-32, -12);
    ctx.lineTo(-28, -5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-20, 5);
    ctx.lineTo(-32, 12);
    ctx.lineTo(-28, 5);
    ctx.closePath();
    ctx.fill();

    // Canopy
    ctx.fillStyle = cab;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(4, -3.2);
    ctx.lineTo(-6, -2.8);
    ctx.lineTo(-6, 2.8);
    ctx.lineTo(4, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 220, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Engine intakes hint
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-24, -4.2, 6, 2.4);
    ctx.fillRect(-24, 1.8, 6, 2.4);

    // Nose tip
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(28, -2);
    ctx.lineTo(28, 2);
    ctx.closePath();
    ctx.fill();

    // USAF-style wing marking (player) / accent stripe (AI)
    if (car.isPlayer) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-4, -14, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b22234";
      ctx.beginPath();
      ctx.arc(-4, -14, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c3b6e";
      ctx.fillRect(-7.2, -15.2, 2.2, 2.4);
    } else {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, -12);
      ctx.lineTo(-14, -12);
      ctx.stroke();
    }

    ctx.restore();
  }

  Game.createCars = createCars;
  Game.resetCarsOnTrack = resetCarsOnTrack;
  Game.syncCarToTrack = syncCarToTrack;
  Game.updatePlayer = updatePlayer;
  Game.updateAI = updateAI;
  Game.drawCar = drawCar;
})(window.Game = window.Game || {});
