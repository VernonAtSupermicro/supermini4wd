# Castle Mini 4WD

Online web racing game with three four-wheel-drive mini cars on a castle-and-knights course.

## Play

Open `index.html` via a local server (ES modules require HTTP):

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Input | Action |
| --- | --- |
| ▲ / W | Forward |
| ▼ / S | Reverse |
| ◀ / A | Left |
| ▶ / D | Right |
| Directions combine | e.g. right + reverse = right and back |
| White **HOLD** / Space | Acceleration (0–200) |
| Engine / E | Boost (2 per level) — turn in time or fly out |
| Protector / Q | Arm shield (max 2 held) |
| Restart / R | Once per level |

## Course

- Distance markers (triangles) every **5 meters**
- Question-mark crates every **15 meters** (sometimes two appear)
- `?` can grant a protector, restart, or accelerator/engine
- Castles and knights decorate the circuit

## Stars & shop

- **+100 stars** for finishing a level
- Protector: **100★** (max 2; buy again after using them)
- Engine: **300★**
- Restart: **200★**

## Cars

- **Red** — you
- **Green & blue** — skilled computer drivers (fast racing line + boosts)
