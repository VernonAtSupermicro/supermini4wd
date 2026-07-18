/** Mini 4WD car entities: player + skilled AI. */

import {
  samplePath,
  pathNormal,
  pathAngle,
} from "./track.js";

const COLORS = [
  { body: "#c0392b", trim: "#f5d76e", cab: "#2c3e50" },
  { body: "#1e8449", trim: "#f7f1e3", cab: "#1a252f" },
  { body: "#2471a3", trim: "#f4d03f", cab: "#1a252f" },
];

export function createCars() {
  return [0, 1, 2].map((i) => {
    const lane = (i - 1) * 28;
    return {
      id: i,
      isPlayer: i === 0,
      color: COLORS[i],
      x: 0,
      y: 0,
      angle: 0,
      meters: 2 + i * 0.5,
      lateral: lane,
      speed: 0,
      accel: i === 0 ? 0 : 150 + i * 12,
      boostTimer: 0,
      shieldActive: false,
      shieldTimer: 0,
      finished: false,
      flying: false,
      flyTimer: 0,
      vx: 0,
      vy: 0,
      crashed: false,
      aiTargetLateral: lane,
      aiBoostCooldown: 2.5 + i,
    };
  });
}

export function resetCarsOnTrack(cars, track) {
  for (const car of cars) {
    car.meters = 2 + car.id * 0.5;
    car.lateral = (car.id - 1) * 28;
    car.speed = 0;
    car.boostTimer = 0;
    car.flying = false;
    car.flyTimer = 0;
    car.finished = false;
    car.crashed = false;
    car.shieldActive = false;
    car.shieldTimer = 0;
    if (!car.isPlayer) car.accel = 150 + car.id * 12;
    syncCarToTrack(car, track);
  }
}

export function syncCarToTrack(car, track) {
  const p = samplePath(track.points, track.dists, car.meters);
  const n = pathNormal(track.points, track.dists, car.meters);
  car.x = p.x + n.x * car.lateral;
  car.y = p.y + n.y * car.lateral;
  car.angle = p.angle + (car.speed < -0.5 ? Math.PI : 0);
}

export function updatePlayer(car, input, dt, track) {
  if (car.crashed) return;
  if (car.flying) {
    updateFlying(car, dt, track);
    if (!car.flying && car.isPlayer) car.crashed = true;
    return;
  }
  if (car.finished) return;

  let steer = 0;
  let drive = 0;
  if (input.left) steer -= 1;
  if (input.right) steer += 1;
  if (input.up) drive += 1;
  if (input.down) drive -= 1;

  car.accel = Math.max(0, Math.min(200, input.accel));

  // Left/right shift lane; combine with reverse for "right and back"
  const steerSpeed = drive < 0 ? 70 : 95;
  car.lateral += steer * steerSpeed * dt;

  const half = track.halfWidth - 12;
  let maxSpd = 8 + (car.accel / 200) * 30;
  if (car.boostTimer > 0) {
    maxSpd *= 1.9;
    car.boostTimer -= dt;
  }

  let forwardWant = 0;
  if (car.accel > 0) {
    forwardWant = drive < 0 ? -maxSpd * 0.4 : maxSpd * (car.accel / 200);
  } else if (drive > 0) {
    forwardWant = maxSpd * 0.35;
  } else if (drive < 0) {
    forwardWant = -maxSpd * 0.3;
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
  const dangerous = car.boostTimer > 0 || car.speed > 24;

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

export function updateAI(car, dt, track, rivals) {
  if (car.flying) {
    updateFlying(car, dt, track);
    return;
  }
  if (car.finished || car.crashed) return;

  car.aiBoostCooldown -= dt;
  const curve = curvature(track, car.meters);
  car.aiTargetLateral = -curve * 40;

  for (const r of rivals) {
    if (r === car || r.flying) continue;
    const dm = r.meters - car.meters;
    if (dm > 0 && dm < 10) {
      car.aiTargetLateral += Math.sign((car.lateral - r.lateral) || 1) * 16;
    }
  }

  const limit = track.halfWidth - 20;
  car.aiTargetLateral = Math.max(-limit, Math.min(limit, car.aiTargetLateral));
  car.lateral += (car.aiTargetLateral - car.lateral) * Math.min(1, 5 * dt);

  // Very good, fast drivers
  let maxSpd = 28 + car.id * 1.8;
  if (Math.abs(curve) > 0.15) maxSpd *= 0.88;
  if (car.boostTimer > 0) {
    maxSpd *= 1.65;
    car.boostTimer -= dt;
  }

  if (car.aiBoostCooldown <= 0 && Math.abs(curve) < 0.01 && car.meters > 25) {
    car.boostTimer = 1.35;
    car.aiBoostCooldown = 8 + car.id * 2.5;
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

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  if (car.shieldTimer > 0 || car.shieldActive) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 18, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 210, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(120, 210, 255, 0.12)";
    ctx.fill();
  }

  if (car.boostTimer > 0) {
    ctx.fillStyle = "rgba(255, 140, 40, 0.6)";
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.lineTo(-40 - Math.random() * 8, 0);
    ctx.lineTo(-22, 6);
    ctx.fill();
  }

  ctx.fillStyle = "#151515";
  for (const [wx, wy] of [
    [-14, -12],
    [12, -12],
    [-14, 12],
    [12, 12],
  ]) {
    roundRect(ctx, wx - 6, wy - 4, 12, 8, 2);
    ctx.fill();
    ctx.fillStyle = "#666";
    ctx.fillRect(wx - 3, wy - 2, 6, 4);
    ctx.fillStyle = "#151515";
  }

  ctx.fillStyle = car.color.body;
  roundRect(ctx, -16, -9, 32, 18, 4);
  ctx.fill();

  ctx.fillStyle = car.color.trim;
  ctx.fillRect(6, -7, 10, 14);

  ctx.fillStyle = car.color.cab;
  roundRect(ctx, -8, -6, 12, 12, 2);
  ctx.fill();

  ctx.strokeStyle = car.color.trim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -7);
  ctx.lineTo(-6, 7);
  ctx.stroke();

  if (car.isPlayer) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(2, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
