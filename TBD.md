# TBD — deferred, ambitious changes

Parked deliberately, not forgotten. Each entry says what it would take, so the
decision to pick it up can be made on real information rather than enthusiasm.

---

## Hyperrealistic globe using external assets

**Asked for:** make the globe more visually striking and more hyperrealistic,
using an external asset if possible.

**Why it's deferred:** it is the single highest-leverage visual change available
— the globe is the hero and the whole product's first impression rests on it —
but it is not a small edit, and doing it badly is worse than the current clean
dark globe.

**What it actually involves:**

1. **Sourcing textures.** Photoreal earth needs several layers, not one image:
   a day/colour map, a night-lights map, a specular/water mask, a normal or bump
   map for terrain relief, and a separate cloud layer with its own alpha.
   NASA Visible Earth (Blue Marble Next Generation) is public domain and the
   usual source. At 8k these are megabytes each.

2. **The bundle problem, which is the real blocker.** The globe chunk is already
   ~1.79MB (506KB gzipped) before any texture work. A naive 8k texture set would
   add 10–20MB and destroy first paint. This needs, at minimum:
   - progressive loading (low-res first, high-res swapped in after interaction)
   - basis/KTX2 compressed textures rather than JPG/PNG
   - a hard decision about mobile, which should probably never load the high-res set
   Assets must be self-hosted — the deployed app has no CDN dependency by design.

3. **Rendering work beyond textures.** Hyperrealism is mostly lighting, not
   image files: a real sun direction with terminator, atmospheric scattering at
   the limb, subtle specular on oceans only, cloud layer rotating at its own rate,
   and city lights appearing on the night side. Each is a shader/material change
   with its own frame-cost.

4. **The tension to resolve first.** The arcs and status-coloured destination
   points are the product's actual information layer. A photoreal earth competes
   with them for attention — bright, busy terrain makes glowing points harder to
   read. Whoever picks this up should decide up front whether realism serves the
   data or fights it, because "more beautiful globe" and "clearer signal" are not
   automatically the same goal.

**Rough size:** a dedicated agent, most of a session, with the performance budget
re-measured afterwards. Worth doing once the data layer is settled — the globe
should be polished around final content, not before it exists.

**Untried lead, from Agent H's investigation before the work was cut:** `three-globe`
imports `three/webgpu` (~1.8MB raw) and `three/tsl` for a GPU-accelerated heatmap
path this app never uses. Aliasing those two imports to stub modules in
`app/vite.config.ts` looked like the highest-leverage single change to the 1.79MB
globe chunk. Untested.

---

## Automatic destination discovery

From `PLAN.md` Wave 2 Agent J: an entity-extraction pass over country-level travel
posts proposing genuinely new destination names, appended to the vocabulary via a
human-reviewed PR. Cut from the MVP; the curated vocabulary covers it for now.
