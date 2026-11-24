'use strict';
/* OpusMC (bilibili build, v49058) god-view viewer.
 *
 * Boots the hosted engine unchanged on a void stage, streams a generated
 * .litematic build in as blocks, and drives an orbit camera by writing the
 * player transform each frame (the engine renders through that transform).
 *
 * This build stores blocks in palette-compressed sections, so blocks are
 * written into flat chunk arrays and handed to the engine through
 * Chunk.from / finishChunk rather than by touching chunk.blocks directly.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const BUILD_ID = params.get('build') || '';
  const EMBED = params.get('embed') === '1';
  // Build mode: start an empty superflat world for live AI construction instead
  // of requiring a .litematic. Ground is y=0 (bedrock + grass), build from y=1.
  const BUILD_MODE = params.get('mode') === 'build';
  const GROUND_Y = 0;

  const el = {
    load: document.getElementById('vm-load'),
    loadTitle: document.getElementById('vm-load-title'),
    loadSub: document.getElementById('vm-load-sub'),
    loadBar: document.getElementById('vm-load-bar'),
    tip: document.getElementById('vm-tip'),
    fail: document.getElementById('vm-fail'),
    failText: document.getElementById('vm-fail-text'),
  };

  function setProgress(pct, text) {
    if (el.loadBar) el.loadBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (text && el.loadSub) el.loadSub.textContent = text;
  }
  function fail(msg) {
    if (!el.fail) return;
    el.fail.style.display = 'flex';
    el.failText.textContent = msg;
    if (el.load) el.load.classList.add('gone');
  }
  function hideLoader() {
    if (!el.load) return;
    el.load.classList.add('gone');
    setTimeout(() => { el.load.style.display = 'none'; }, 500);
    if (el.tip) setTimeout(() => el.tip.classList.add('gone'), 4600);
  }

  /* ---- orbit camera ------------------------------------------------------ */
  const cam = { target: [0, 0, 0], yaw: Math.PI * 0.25, pitch: 0.40, dist: 120, minDist: 8, maxDist: 600 };
  let drag = null;

  function camPos() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [
      cam.target[0] + Math.sin(cam.yaw) * cp * cam.dist,
      cam.target[1] + sp * cam.dist,
      cam.target[2] + Math.cos(cam.yaw) * cp * cam.dist,
    ];
  }
  /* The view matrix is rotX(-pitch) · rotY(-yaw) · translate(-pos), so the
     forward vector is (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)). */
  function aim(p, from, at) {
    const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2];
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  function applyCamera(game) {
    const p = game.player;
    if (!p) return;
    const pos = camPos();
    p.pos[0] = pos[0]; p.pos[1] = pos[1]; p.pos[2] = pos[2];
    p.prev[0] = pos[0]; p.prev[1] = pos[1]; p.prev[2] = pos[2];
    p.vel[0] = 0; p.vel[1] = 0; p.vel[2] = 0;
    p.flying = true; p.onGround = false; p.sneaking = false; p.sprinting = false;
    p.inWater = false; p.inLava = false;
    aim(p, pos, cam.target);
  }
  function fitCamera(size, content) {
    const [sx, sy, sz] = size;
    const span = Math.max(sx, sy, sz);
    if (content && content.max[0] >= 0) {
      const cx = (content.min[0] + content.max[0]) / 2;
      const cy = (content.min[1] + content.max[1]) / 2;
      const cz = (content.min[2] + content.max[2]) / 2;
      const extent = Math.max(content.max[0] - content.min[0], content.max[1] - content.min[1], content.max[2] - content.min[2]);
      cam.target = [cx, cy, cz];
      cam.dist = Math.max(extent * 0.92, 24);
      cam.maxDist = Math.max(extent * 4, 240);
      cam.minDist = Math.max(extent * 0.05, 4);
    } else {
      cam.target = [sx / 2, sy * 0.40, sz / 2];
      cam.dist = Math.max(span * 0.9, 32);
      cam.maxDist = Math.max(span * 5, 300);
      cam.minDist = Math.max(span * 0.06, 4);
    }
    cam.yaw = Math.PI * 0.25;
    cam.pitch = 0.40;
    return span;
  }

  function bindOrbit(canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.button === 2 || drag.shift) {
        const s = cam.dist * 0.0016;
        const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
        cam.target[0] -= cy * dx * s;
        cam.target[2] += sy * dx * s;
        cam.target[1] += dy * s;
      } else {
        // drag direction: right moves the view left, down moves the camera up
        cam.yaw -= dx * 0.006;
        cam.pitch = Math.max(-0.30, Math.min(1.45, cam.pitch + dy * 0.005));
      }
    });
    const stop = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---- viewer controls ---------------------------------------------------
   * The engine is built for play: it grabs the pointer on click, opens the
   * pause menu on Escape, and lets the player fall. A showcase wants none of
   * that: the pointer is never locked (so orbit drags work), no screen ever
   * opens, and Escape toggles a frozen frame instead of a menu.
   */
  let paused = false;

  function setPaused(game, next) {
    paused = next;
    game.debugPause = next;               // main loop: render the frozen frame, skip frame()/tick()
    if (next && document.exitPointerLock) document.exitPointerLock();
    if (el.tip) {
      el.tip.textContent = next ? '已暂停 · 按 Esc 继续' : '拖动旋转 · 滚轮缩放 · 右键拖动平移';
      el.tip.classList.remove('gone');
      if (!next) setTimeout(() => el.tip.classList.add('gone'), 3600);
    }
  }

  function installViewerControls(game) {
    // Never grab the pointer: pointer lock would consume the drags the orbit
    // camera reads, which is what made rotation freeze after the first click.
    game.capturePointer = () => {};
    game.exitPointerLockCapture = () => {};
    // No screens at all: not the pause menu, the inventory, or the death screen.
    game.ui.open = () => {};
    game.ui.close = () => {};

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      setPaused(game, !paused);
    }, true);
  }

  /** Replace terrain generation with an empty flat chunk: the build floats alone. */
  function installVoidGenerator(world, withGround) {
    world.generate = function (cx, cz) {
      const ch = new Chunk(cx, cz).beginFlat();
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const col = z * 16 + x;
          ch.biome[col] = BI.PLAINS;
          this.tintFor(this.grassMap, 0.3, 0.2, ch.grass, col * 3);
          this.tintFor(this.foliageMap, 0.3, 0.2, ch.foliage, col * 3);
          if (withGround) {
            // gen1: internal y starts at 0, so the ground layer is y=0 and
            // building starts at y=1. No negative layer is addressable.
            ch.blocks[(GROUND_Y << 8) | (z << 4) | x] = BID.grass_block !== undefined ? BID.grass_block : BID.stone;
          }
        }
      }
      ch.pack();
      return ch;
    };
  }

  /**
   * Resolve a vanilla block name against this engine's registry. The hosted
   * build ships most vanilla keys, so any name it lacks falls back by family
   * (same shape, nearest material) instead of becoming a hole in the build.
   */
  const FALLBACK = {
    cave_air: 'air', void_air: 'air',
    chiseled_stone_bricks: 'stone_bricks',
    smooth_stone: 'stone',
    grass: 'short_grass', tall_grass: 'short_grass', vine: 'short_grass',
    wall_torch: 'torch', soul_wall_torch: 'soul_torch',
    oak_wall_sign: 'oak_sign', spruce_wall_sign: 'spruce_sign',
  };
  const FAMILY = [
    [/^_(.+)$/, null],
  ];
  function resolveBlock(name) {
    if (BID[name] !== undefined) return BID[name];
    const alt = FALLBACK[name];
    if (alt !== undefined && BID[alt] !== undefined) return BID[alt];
    const suffix = (re, cands) => {
      if (!re.test(name)) return undefined;
      for (const c of cands) if (BID[c] !== undefined) return BID[c];
      return undefined;
    };
    return (
      suffix(/_wall_sign$/, ['oak_sign', 'sign']) ??
      suffix(/_hanging_sign$/, ['oak_sign']) ??
      suffix(/_wall_banner$/, ['white_banner']) ??
      suffix(/_leaves$/, ['oak_leaves']) ??
      suffix(/_log$|_wood$|_stem$|_hyphae$/, ['oak_log']) ??
      suffix(/_planks$/, ['oak_planks']) ??
      suffix(/_stairs$/, ['stone_brick_stairs', 'oak_stairs']) ??
      suffix(/_slab$/, ['stone_brick_slab', 'oak_slab']) ??
      suffix(/_wall$/, ['stone_brick_wall']) ??
      suffix(/_fence_gate$|_fence$|_pane$|_bars$/, ['oak_fence', 'glass']) ??
      suffix(/_door$|_trapdoor$/, ['oak_door']) ??
      suffix(/_sapling$|_flower$|_bush$/, ['oak_sapling', 'short_grass']) ??
      suffix(/_carpet$/, ['pink_carpet', 'white_carpet']) ??
      suffix(/_terracotta$/, ['terracotta']) ??
      suffix(/_concrete$/, ['white_concrete']) ??
      suffix(/_wool$/, ['white_wool']) ??
      suffix(/_stained_glass$/, ['glass']) ??
      suffix(/_bricks$|_brick$/, ['stone_bricks']) ??
      suffix(/_ore$/, ['stone']) ??
      suffix(/_block$/, ['stone']) ??
      BID.stone
    );
  }

  /**
   * Write the RLE build into flat chunk arrays, then hand each chunk to the
   * engine (finishChunk does palette packing, lighting and dirty marking).
   */
  function placeBuild(game, payload) {
    const [sx, sy, sz] = payload.size;
    const ids = payload.keys.map(resolveBlock);
    const H = HEIGHT, MINY = MIN_Y;

    const flats = new Map();
    const flatFor = (cx, cz) => {
      const k = ckey(cx, cz);
      let c = flats.get(k);
      if (!c) {
        c = new Chunk(cx, cz).beginFlat();
        // A chunk built here is never passed through the world generator, so its
        // biome and tint arrays are unset: an unset tint multiplies every tinted
        // block (leaves, grass) by zero and renders it black. Neutral plains with
        // a white tint keeps the authored textures.
        c.biome.fill(BI.PLAINS);
        c.grass.fill(255);
        c.foliage.fill(255);
        flats.set(k, c);
      }
      return c;
    };

    const runs = payload.runs;
    let x = 0, y = 0, z = 0, placed = 0;
    for (let r = 0; r < runs.length; r += 2) {
      const id = ids[runs[r]];
      const count = runs[r + 1];
      if (id === 0) {
        for (let n = 0; n < count && y < sy; n++) {
          x++; if (x >= sx) { x = 0; z++; if (z >= sz) { z = 0; y++; } }
        }
      } else {
        for (let n = 0; n < count && y < sy; n++) {
          const wy = y + MINY;
          if (wy >= 0 && wy < H) {
            const c = flatFor(x >> 4, z >> 4);
            c.blocks[(wy << 8) | ((z & 15) << 4) | (x & 15)] = id;
            placed++;
          }
          x++; if (x >= sx) { x = 0; z++; if (z >= sz) { z = 0; y++; } }
        }
      }
      if (y >= sy) break;
    }

    const created = [];
    for (const c of flats.values()) {
      c.pack();
      c.recount();
      game.finishChunk(c, false);
      const live = game.world.getChunk(c.cx, c.cz);
      if (live) created.push(live);
    }

    // Mesh once now that every block is in place (neighbours re-mesh as they arrive).
    for (const ch of created) {
      try { game.meshChunk(ch); } catch (e) { /* a neighbour may still be missing; updateChunks retries */ }
    }
    return placed;
  }

  /* ---- boot -------------------------------------------------------------- */
  async function main() {
    let game = null;
    for (let i = 0; i < 1600; i++) {
      if (window.game && window.game.renderer && window.game.ui && window.game.world) { game = window.game; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!game) return fail('OpusMC 引擎未能启动，浏览器需要 WebGL2 支持。');

    try {
      setProgress(4, '初始化展示环境');
      if (game.ui.screen) game.ui.close();
      game.state = 'idle';
      game.mode = 'spectator';        // no collision, no interaction: a camera
      game.ui.hideHud = true;
      game.debug = false;
      game.weather = 0;
      game.rainTarget = 0;
      game.worldTime = 4200;
      game.perspective = 0;
      installViewerControls(game);
      // A showcase wants a stable, literal image: no shader pack, no dynamic
      // resolution (it softens the frame while it probes the budget).
      game.settings.shaders = 0;
      game.settings.dynRes = false;
      if (typeof DynRes !== 'undefined') { try { DynRes.reset(game); DynRes.scale = 1; } catch (e) { /* older builds */ } }
      if (typeof game.applySettings === 'function') { try { game.applySettings(); } catch (e) { /* nothing to apply */ } }
      // graphics overrides (diagnostics and taste): ?gamma= ?shaders= ?res=
      if (params.has('gamma')) { game.settings.gamma = Number(params.get('gamma')); game.renderer.gamma = game.settings.gamma; }
      if (params.has('shaders')) game.settings.shaders = Number(params.get('shaders'));
      if (params.has('res')) { const r = Number(params.get('res')); if (r > 0) { game.settings.resScale = r; game.renderer.resScale = r; game.resize(); } }

      let id = BUILD_ID;
      let payload = null;
      if (BUILD_MODE && !id) {
        // Live construction: start an empty superflat world, no .litematic needed.
        if (el.loadTitle) el.loadTitle.textContent = '实时施工（超平坦）';
        setProgress(8, '初始化虚空舞台');
      } else {
        setProgress(6, '获取建筑列表');
        if (!id) {
          const res = await fetch('api/builds');
          const data = await res.json();
          if (!data.builds || data.builds.length === 0) return fail('没有找到任何 .litematic 建筑文件。');
          id = data.builds[0].id;
        }
        if (el.loadTitle) el.loadTitle.textContent = id;
        setProgress(8, '解析蓝图');
        const bres = await fetch('api/build/' + encodeURIComponent(id));
        if (!bres.ok) return fail('读取建筑失败：HTTP ' + bres.status);
        payload = await bres.json();
      }
      const size = payload ? payload.size : [128, 128, 128];

      // Fresh void world on the first-generation height range (256, y from 0).
      // Build mode keeps a y=0 ground layer; preview mode is fully void.
      game.setupWorld(0x5a4b21, false);
      game.world.flat = true;
      game.world.gen2 = false;
      installVoidGenerator(game.world, BUILD_MODE);
      const p = new Player(game, size[0] / 2, size[1] + 40, size[2] / 2);
      p.needsGround = false;
      p.noClip = true;               // spectator camera: never collide with the build
      game.player = p;
      game.state = 'play';

      // Freeze the build: leaves with no trunk nearby would decay by random tick
      // and a showcase has to stay exactly as authored, so leaves lose their
      // random-tick slot before any tick runs.
      try {
        if (typeof game.randomTickTable === 'function' && typeof BLOCKS !== 'undefined') {
          const table = game.randomTickTable();
          for (let i = 0; i < table.length; i++) {
            const b = BLOCKS[i];
            if (b && b.key && b.key.endsWith('_leaves')) table[i] = 0;
          }
        }
      } catch (e) { /* the freeze is an optimisation of fidelity, not a requirement */ }

      // Freeze the showcase: NO mob/animal spawning. A build viewer must show
      // only the architecture — passive animals spawning from the void ground
      // or hostiles at night are distracting and were reported as a bug.
      // Override the spawners on this game instance only (other modes untouched).
      try {
        game.worldMeta = game.worldMeta || {};
        game.worldMeta.noAnimals = true;                       // chunk-load animals (game.js:610)
        game.spawnAnimals = function () {};                    // defensive: any direct call
        game.spawnMobs = function () {};                       // periodic hostile/passive (game.js:800)
        game.spawnMobsDim = function () {};                    // nether/end variant
        if (Array.isArray(game.entities)) {
          for (const e of game.entities) if (e && typeof e === 'object' && e.constructor && e.constructor.name === 'Mob') e.dead = true;
          game.entities = game.entities.filter((e) => !e.dead);
        }
      } catch (e) { /* mob suppression is best-effort; never break the viewer */ }

      fitCamera(size, payload && payload.content);
      const span = Math.max(size[0], size[1], size[2]);
      const view = params.get('view');
      if (view === 'top') { cam.pitch = Math.PI / 2 - 0.02; cam.yaw = 0; cam.dist = Math.max(span * 1.15, 32); }
      else if (view === 'side') { cam.pitch = 0.12; cam.yaw = 0; cam.dist = Math.max(span * 1.25, 32); }
      if (params.has('yaw')) cam.yaw = Number(params.get('yaw'));
      if (params.has('pitch')) cam.pitch = Number(params.get('pitch'));
      if (params.has('dist')) cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, Number(params.get('dist'))));
      if (params.has('ty')) cam.target[1] = Number(params.get('ty'));
      // a panel reload keeps the viewer's own camera: cam=yaw,pitch,dist,tx,ty,tz
      if (params.has('cam')) {
        const v = params.get('cam').split(',').map(Number);
        if (v.length === 6 && v.every((n) => isFinite(n))) {
          cam.yaw = v[0];
          cam.pitch = Math.max(-0.30, Math.min(1.45, v[1]));
          cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, v[2]));
          cam.target = [v[3], v[4], v[5]];
        }
      }

      await new Promise((r) => setTimeout(r, 120));
      applyCamera(game);

      setProgress(60, '放置方块');
      const placed = payload ? placeBuild(game, payload) : 0;

      setProgress(90, '重建网格');
      await new Promise((r) => setTimeout(r, 260));
      if (typeof game.flushMesh === 'function') game.flushMesh();

      setProgress(100, placed.toLocaleString() + ' 个方块');
      hideLoader();
      window.__viewerReady = true;
    } catch (e) {
      fail('渲染建筑失败：' + (e && e.message ? e.message : e));
    }

    const tickCam = () => {
      if (!paused && game.state === 'play' && game.player) applyCamera(game);
      requestAnimationFrame(tickCam);
    };
    requestAnimationFrame(tickCam);
    bindOrbit(document.getElementById('gl'));
  }

  window.__opusmcViewer = {
    setView(yaw, pitch, dist) {
      if (typeof yaw === 'number') cam.yaw = yaw;
      if (typeof pitch === 'number') cam.pitch = pitch;
      if (typeof dist === 'number') cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, dist));
    },
    resetView(span) {
      cam.yaw = Math.PI * 0.25;
      cam.pitch = 0.40;
      if (span) cam.dist = Math.max(span * 0.92, 24);
    },
    topView(span) {
      cam.pitch = Math.PI / 2 - 0.02;
      cam.yaw = 0;
      if (span) cam.dist = Math.max(span * 1.15, 32);
    },
    /** [yaw, pitch, dist, targetX, targetY, targetZ] — used to keep the view across reloads. */
    getCamera() {
      return [cam.yaw, cam.pitch, cam.dist, cam.target[0], cam.target[1], cam.target[2]];
    },
    setCamera(v) {
      if (!Array.isArray(v) || v.length !== 6 || v.some((n) => typeof n !== 'number' || !isFinite(n))) return;
      cam.yaw = v[0];
      cam.pitch = Math.max(-0.30, Math.min(1.45, v[1]));
      cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, v[2]));
      cam.target = [v[3], v[4], v[5]];
    },
    isPaused() { return paused; },
    /** Force the cam transform onto the player and render one frame. Useful
     *  when the host iframe is off-screen and rAF is throttled. */
    syncCamera() {
      if (game && game.state === 'play') applyCamera(game);
    },
  };

  window.addEventListener('load', () => { main(); });
})();