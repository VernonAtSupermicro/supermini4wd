# Castle Mini 4WD

Online web racing game with three four-wheel-drive mini cars on a castle-and-knights course.

## Play

Double-click `index.html` to open it in Chrome (or any browser). No local server needed.

Optional local server:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Input | Action |
| --- | --- |
| ▲ / W (hold) | Accelerate + forward (0–200) |
| ◀ / A | Left |
| ▶ / D | Right |
| **1** | Start race |
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

- Start with **250★**; finish rewards start at **+100★** and **double each level** (200, 400, …)
- Level start kit also doubles each level (engines / restarts)
- Title screen and result screen both have a **Shop** button (also **Q**)
- Click an item to buy it; **that item’s price doubles** after every purchase
- All shop weapons/items can be bought with **no hold limit**
- Level 2+ and Level 3+ unlock extra shop packs (armor, nitro, command kit)

## Cars

- **Red** — you
- **Green & blue** — skilled computer drivers (fast racing line + boosts)
