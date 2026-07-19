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
| **1** | Start race |
| **3** (hold) | Acceleration (0–200) |
| **5** | Super jet engine boost (2 per level) |
| **8** | Protector / shield (max 2 held) |
| **7** | Restart (once per level) |
| **Q** | Open / close shop (purchase) |

## Course

- Distance markers (triangles) every **5 meters**
- Question-mark crates every **15 meters** (sometimes two appear)
- `?` can grant a protector, restart, or accelerator/engine
- Castles and knights decorate the circuit

## Stars & shop

- Start with **250★**; **+100★** for finishing a level
- Title screen and result screen both have a **Shop** button (also **Q**)
- Click an item to buy it; **that item’s price doubles** after every purchase
- Level 2+ and Level 3+ unlock extra shop packs (armor, nitro, command kit)
- Each new level also grants **+2 engines** and **+1 restart** on top of what you already own

## Cars

- **Red** — you
- **Green & blue** — skilled computer drivers (fast racing line + boosts)
