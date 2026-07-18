/** Track geometry: castle circuit with meter-based markers. */

export const METERS_PER_PX = 0.05; // 20 px = 1 meter
export const PX_PER_METER = 1 / METERS_PER_PX;

/**
 * Build a winding closed-ish race path through castle grounds.
 * Path is a sequence of waypoints in world pixels; cars race along it.
 */
export function buildTrack(level = 1) {
  const lengthMeters = 180 + level * 40;
  const segments = Math.max(24, Math.floor(lengthMeters / 8));
  const points = [];
  const centerX = 0;
  const centerY = 0;
  const baseRadius = 900 + level * 40;

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

  // Cumulative distances along path (meters)
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

  // Decorative castles / knights near track
  const props = [];
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

  return {
    points,
    dists,
    totalMeters,
    triangles,
    questionMarks,
    props,
    halfWidth: 70,
  };
}

export function samplePath(points, dists, meters) {
  if (meters <= 0) return { ...points[0], angle: pathAngle(points, dists, 0) };
  const last = dists[dists.length - 1];
  const m = ((meters % last) + last) % last;
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

export function pathAngle(points, dists, meters) {
  const a = samplePathRaw(points, dists, meters);
  const b = samplePathRaw(points, dists, meters + 0.5);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function samplePathRaw(points, dists, meters) {
  const last = dists[dists.length - 1];
  const m = ((meters % last) + last) % last;
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

export function pathNormal(points, dists, meters) {
  const ang = pathAngle(points, dists, meters);
  return { x: -Math.sin(ang), y: Math.cos(ang) };
}

/** Signed lateral offset from centerline in pixels. */
export function lateralOffset(track, x, y, meters) {
  const p = samplePath(track.points, track.dists, meters);
  const n = pathNormal(track.points, track.dists, meters);
  return (x - p.x) * n.x + (y - p.y) * n.y;
}

/** Progress meters nearest to a world position (search around hint). */
export function nearestMeters(track, x, y, hintMeters = 0) {
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
