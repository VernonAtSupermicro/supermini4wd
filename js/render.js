/** Canvas rendering for castle track, markers, and HUD world props. */
(function (Game) {
  "use strict";

  const { samplePath, pathNormal, drawCar } = Game;

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(160, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  function drawScene(ctx, state) {
    const { track, cars, cam, w, h, time } = state;
    ctx.clearRect(0, 0, w, h);

    // Sky / grounds atmosphere
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#3a4a55");
    sky.addColorStop(0.45, "#2a353c");
    sky.addColorStop(1, "#1a2228");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Soft vignette hills
    ctx.fillStyle = "rgba(25, 40, 32, 0.55)";
    ctx.beginPath();
    ctx.ellipse(w * 0.2, h * 1.05, w * 0.55, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.85, h * 1.1, w * 0.5, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(w / 2 - cam.x, h / 2 - cam.y);

    drawProps(ctx, track.props, time);
    drawTrack(ctx, track);
    drawTriangles(ctx, track.triangles, time);
    drawQuestionMarks(ctx, track.questionMarks, time);

    // Draw AI then player on top
    const ordered = [...cars].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of ordered) drawCar(ctx, car);

    ctx.restore();

    drawMinimap(ctx, track, cars, w, h);
  }

  function drawTrack(ctx, track) {
    const pts = track.points;
    if (pts.length < 2) return;

    // Outer grass shoulder
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#3d5c45";
    ctx.lineWidth = track.halfWidth * 2 + 52;
    strokePath(ctx, pts);

    // Runway shoulder
    ctx.strokeStyle = "#4a4e52";
    ctx.lineWidth = track.halfWidth * 2 + 16;
    strokePath(ctx, pts);

    // Asphalt runway surface
    ctx.strokeStyle = "#5a6068";
    ctx.lineWidth = track.halfWidth * 2;
    strokePath(ctx, pts);

    // Edge lines
    ctx.strokeStyle = "rgba(240, 240, 245, 0.7)";
    ctx.lineWidth = 5;
    strokeOffset(ctx, track, track.halfWidth - 4);
    strokeOffset(ctx, track, -(track.halfWidth - 4));

    // Center dashed line
    ctx.setLineDash([28, 22]);
    ctx.strokeStyle = "rgba(245, 220, 80, 0.55)";
    ctx.lineWidth = 3;
    strokePath(ctx, pts);
    ctx.setLineDash([]);
  }

  function strokePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function strokeOffset(ctx, track, offset) {
    ctx.beginPath();
    for (let i = 0; i < track.points.length; i++) {
      const m = track.dists[i];
      const p = samplePath(track.points, track.dists, m);
      const n = pathNormal(track.points, track.dists, m);
      const x = p.x + n.x * offset;
      const y = p.y + n.y * offset;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawTriangles(ctx, triangles, time) {
    for (const t of triangles) {
      const pulse = 0.85 + 0.15 * Math.sin(time * 3 + t.meters);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle + Math.PI / 2);
      ctx.fillStyle = `rgba(212, 160, 23, ${0.55 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 6);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawQuestionMarks(ctx, marks, time) {
    for (const q of marks) {
      if (q.taken) continue;
      const bob = Math.sin(time * 4 + q.meters) * 3;
      ctx.save();
      ctx.translate(q.x, q.y + bob);
      ctx.fillStyle = "#f0e6c8";
      ctx.strokeStyle = "#9b2c2c";
      ctx.lineWidth = 3;
      roundBox(ctx, -12, -12, 24, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9b2c2c";
      ctx.font = "bold 18px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 1);
      ctx.restore();
    }
  }

  function drawProps(ctx, props, time) {
    for (const p of props) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1.45, 1.45);
      if (p.type === "castle") drawCastle(ctx);
      else drawKnight(ctx, time);
      ctx.restore();
    }
  }

  function drawCastle(ctx) {
    ctx.fillStyle = "#5a6270";
    ctx.fillRect(-28, -20, 56, 40);
    ctx.fillStyle = "#454c58";
    for (let i = -28; i < 28; i += 14) {
      ctx.fillRect(i, -32, 10, 14);
    }
    ctx.fillStyle = "#9b2c2c";
    ctx.fillRect(-6, -44, 12, 14);
    ctx.beginPath();
    ctx.moveTo(-8, -44);
    ctx.lineTo(6, -54);
    ctx.lineTo(20, -44);
    ctx.fill();
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(-8, 0, 10, 18);
    ctx.fillRect(8, -8, 8, 8);
  }

  function drawKnight(ctx, time) {
    const sway = Math.sin(time * 2) * 2;
    ctx.translate(sway, 0);
    ctx.fillStyle = "#7a8088";
    ctx.fillRect(-6, -18, 12, 20);
    ctx.beginPath();
    ctx.arc(0, -24, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4a017";
    ctx.fillRect(-10, -12, 4, 16);
    ctx.strokeStyle = "#c0c6ce";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, -10);
    ctx.lineTo(16, -22);
    ctx.stroke();
  }

  function drawMinimap(ctx, track, cars, w, h) {
    const mw = 120;
    const mh = 80;
    const x0 = w - mw - 12;
    const y0 = 12;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.strokeStyle = "rgba(212,160,23,0.4)";
    ctx.lineWidth = 2;
    roundBox(ctx, x0, y0, mw, mh, 8);
    ctx.fill();
    ctx.stroke();

    // Fit track
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of track.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 10;
    const sx = (mw - pad * 2) / (maxX - minX || 1);
    const sy = (mh - pad * 2) / (maxY - minY || 1);
    const s = Math.min(sx, sy);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, mw, mh);
    ctx.clip();
    ctx.strokeStyle = "rgba(232,217,192,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < track.points.length; i++) {
      const px = x0 + pad + (track.points[i].x - minX) * s;
      const py = y0 + pad + (track.points[i].y - minY) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (const car of cars) {
      const px = x0 + pad + (car.x - minX) * s;
      const py = y0 + pad + (car.y - minY) * s;
      ctx.fillStyle = car.isPlayer ? "#ff6b5a" : car.color.body;
      ctx.beginPath();
      ctx.arc(px, py, car.isPlayer ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundBox(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  Game.resizeCanvas = resizeCanvas;
  Game.drawScene = drawScene;
})(window.Game = window.Game || {});
