/** Track geometry: castle circuit with meter-based markers. */
(function (Game) {
  "use strict";

  const METERS_PER_PX = 0.05; // 20 px = 1 meter
  const PX_PER_METER = 1 / METERS_PER_PX;

  /** 只拉長賽道長度，不改變跑道寬度（再加倍 → 共 4 倍） */
  const LENGTH_SCALE = 4;

  /**
   * Build a winding closed-ish race path through castle grounds.
   * Path is a sequence of waypoints in world pixels; cars race along it.
   */
  function buildTrack(level = 1) {
    if (level === 1) return finalizeTrack(buildLevel1Path(), level);

    const lengthMeters = (180 + level * 40) * LENGTH_SCALE;
    const segments = Math.max(24, Math.floor(lengthMeters / 8));
    const points = [];
    const centerX = 0;
    const centerY = 0;
    const baseRadius = (900 + level * 40) * LENGTH_SCALE;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      // Wobbly oval so AI and player must steer
      const wobble = 1 + 0.18 * Math.sin(angle * 3 + level) + 0.08 * Math.cos(angle * 5);
      const rx = baseRadius * (1.15 + 0.05 * (level % 3));
      const ry = baseRadius * (0.72 + 0.04 * ((level + 1) % 3));
      const x = centerX + Math.cos(angle) * rx * wobble;
      const y = centerY + Math.sin(angle) * ry * wobble * 0.95;
      points.push({ x, y });
    }

    return finalizeTrack({ points, castleSpots: [] }, level);
  }

  /**
   * Level 1 scripted course:
   * straight → castle → turn around → straight → castle →
   * 360° → 360°×5 → straight → castle → 180°.
   */
  function buildLevel1Path() {
    const points = [];
    const castleSpots = [];
    let x = 0;
    let y = 0;
    let heading = 0; // radians, 0 = +X

    function pushPt(px, py) {
      const last = points[points.length - 1];
      if (last && Math.hypot(px - last.x, py - last.y) < 0.5) return;
      points.push({ x: px, y: py });
    }

    pushPt(x, y);

    function straight(meters) {
      const dist = meters * PX_PER_METER;
      const steps = Math.max(2, Math.ceil(meters / 2));
      const x0 = x;
      const y0 = y;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pushPt(x0 + Math.cos(heading) * dist * t, y0 + Math.sin(heading) * dist * t);
      }
      x = points[points.length - 1].x;
      y = points[points.length - 1].y;
    }

    /** Arc turn. side +1 = left (CCW), -1 = right (CW). */
    function turn(degrees, radiusPx, side = 1) {
      const rad = (Math.abs(degrees) * Math.PI) / 180;
      const steps = Math.max(12, Math.floor(Math.abs(degrees) / 8));
      const leftN = { x: -Math.sin(heading), y: Math.cos(heading) };
      const centerX = x + leftN.x * radiusPx * side;
      const centerY = y + leftN.y * radiusPx * side;
      const ang0 = Math.atan2(y - centerY, x - centerX);

      for (let i = 1; i <= steps; i++) {
        const a = ang0 + side * ((rad * i) / steps);
        pushPt(centerX + Math.cos(a) * radiusPx, centerY + Math.sin(a) * radiusPx);
      }
      x = points[points.length - 1].x;
      y = points[points.length - 1].y;
      heading += side * rad;
    }

    function markCastle() {
      const n = { x: -Math.sin(heading), y: Math.cos(heading) };
      castleSpots.push({
        x: x + n.x * 220,
        y: y + n.y * 220,
      });
    }

    // Straight line to the next castle
    straight(70 * LENGTH_SCALE);
    markCastle();

    // Turn around
    turn(180, 180 * LENGTH_SCALE, 1);

    // Straight line to the next castle
    straight(70 * LENGTH_SCALE);
    markCastle();

    // One 360°, then five more in a row
    turn(360, 220 * LENGTH_SCALE, 1);
    for (let i = 0; i < 5; i++) turn(360, 220 * LENGTH_SCALE, 1);

    // Straight line to the next castle
    straight(70 * LENGTH_SCALE);
    markCastle();

    // 180° rotation
    turn(180, 180 * LENGTH_SCALE, 1);

    return { points, castleSpots };
  }

  function finalizeTrack({ points, castleSpots }, level) {
    const dists = [0];
    let totalPx = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      totalPx += Math.hypot(dx, dy);
      dists.push(totalPx * METERS_PER_PX);
    }
    const totalMeters = dists[dists.length - 1];

    const triangles = [];
    for (let m = 5; m < totalMeters; m += 5) {
      const p = samplePath(points, dists, m);
      triangles.push({ ...p, meters: m });
    }

    // Question marks every 15 m. Sometimes two appear when crossing two intervals.
    const questionMarks = [];
    for (let m = 15; m < totalMeters - 5; m += 15) {
      const count = Math.random() < 0.35 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const offset = k === 0 ? 0 : 3.5;
        const side = k === 0 ? -1 : 1;
        const p = samplePath(points, dists, Math.min(m + offset, totalMeters - 1));
        const n = pathNormal(points, dists, m + offset);
        questionMarks.push({
          x: p.x + n.x * side * 38,
          y: p.y + n.y * side * 38,
          meters: m + offset,
          taken: false,
          id: `${m}-${k}`,
        });
      }
    }

    const props = [];
    if (castleSpots.length) {
      for (const spot of castleSpots) {
        props.push({ type: "castle", x: spot.x, y: spot.y });
      }
      // A few knights along the course for atmosphere
      for (let i = 0; i < 4; i++) {
        const m = ((i + 0.5) / 4) * totalMeters;
        const p = samplePath(points, dists, m);
        const n = pathNormal(points, dists, m);
        const side = i % 2 === 0 ? -1 : 1;
        props.push({
          type: "knight",
          x: p.x + n.x * side * 200,
          y: p.y + n.y * side * 200,
        });
      }
    } else {
      for (let i = 0; i < 8 + level; i++) {
        const m = ((i + 0.5) / (8 + level)) * totalMeters;
        const p = samplePath(points, dists, m);
        const n = pathNormal(points, dists, m);
        const side = i % 2 === 0 ? 1 : -1;
        props.push({
          type: i % 3 === 0 ? "castle" : "knight",
          x: p.x + n.x * side * (120 + (i % 4) * 20),
          y: p.y + n.y * side * (120 + (i % 4) * 20),
        });
      }
    }

    return {
      points,
      dists,
      totalMeters,
      triangles,
      questionMarks,
      props,
      halfWidth: 115,
    };
  }

  function samplePath(points, dists, meters) {
    if (meters <= 0) return { ...points[0], angle: pathAngle(points, dists, 0) };
    const last = dists[dists.length - 1];
    // Clamp at the finish so open courses don't wrap back to the start
    if (meters >= last) {
      const p = points[points.length - 1];
      const a = samplePathRaw(points, dists, Math.max(0, last - 0.5));
      const b = samplePathRaw(points, dists, Math.max(0, last - 0.01));
      return { x: p.x, y: p.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    const m = meters;
    let i = 1;
    while (i < dists.length && dists[i] < m) i++;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(points.length - 1, i);
    const span = dists[i1] - dists[i0] || 1;
    const t = (m - dists[i0]) / span;
    const x = points[i0].x + (points[i1].x - points[i0].x) * t;
    const y = points[i0].y + (points[i1].y - points[i0].y) * t;
    return { x, y, angle: pathAngle(points, dists, m) };
  }

  function pathAngle(points, dists, meters) {
    const last = dists[dists.length - 1];
    const m0 = Math.min(Math.max(0, meters), Math.max(0, last - 0.5));
    const a = samplePathRaw(points, dists, m0);
    const b = samplePathRaw(points, dists, Math.min(last, m0 + 0.5));
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function samplePathRaw(points, dists, meters) {
    const last = dists[dists.length - 1];
    if (meters <= 0) return { x: points[0].x, y: points[0].y };
    if (meters >= last) {
      const p = points[points.length - 1];
      return { x: p.x, y: p.y };
    }
    const m = meters;
    let i = 1;
    while (i < dists.length && dists[i] < m) i++;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(points.length - 1, i);
    const span = dists[i1] - dists[i0] || 1;
    const t = (m - dists[i0]) / span;
    return {
      x: points[i0].x + (points[i1].x - points[i0].x) * t,
      y: points[i0].y + (points[i1].y - points[i0].y) * t,
    };
  }

  function pathNormal(points, dists, meters) {
    const ang = pathAngle(points, dists, meters);
    return { x: -Math.sin(ang), y: Math.cos(ang) };
  }

  /** Signed lateral offset from centerline in pixels. */
  function lateralOffset(track, x, y, meters) {
    const p = samplePath(track.points, track.dists, meters);
    const n = pathNormal(track.points, track.dists, meters);
    return (x - p.x) * n.x + (y - p.y) * n.y;
  }

  /** Progress meters nearest to a world position (search around hint). */
  function nearestMeters(track, x, y, hintMeters = 0) {
    let bestM = hintMeters;
    let bestD = Infinity;
    const start = Math.max(0, hintMeters - 25);
    const end = Math.min(track.totalMeters, hintMeters + 25);
    for (let m = start; m <= end; m += 0.5) {
      const p = samplePath(track.points, track.dists, m);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestM = m;
      }
    }
    return bestM;
  }

  Game.METERS_PER_PX = METERS_PER_PX;
  Game.PX_PER_METER = PX_PER_METER;
  Game.buildTrack = buildTrack;
  Game.samplePath = samplePath;
  Game.pathAngle = pathAngle;
  Game.pathNormal = pathNormal;
  Game.lateralOffset = lateralOffset;
  Game.nearestMeters = nearestMeters;
})(window.Game = window.Game || {});
