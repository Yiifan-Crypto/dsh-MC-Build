__ModuleLoader__.load({
  id: 'dsh-opusmc-viewer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    const CSS = `
      .omc-root { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
      .omc-root * { box-sizing: border-box; }

      /* launcher */
      .omc-fab {
        pointer-events: auto;
        position: absolute; right: 20px; bottom: 84px;
        display: inline-flex; align-items: center; gap: 8px;
        height: 38px; padding: 0 14px 0 11px;
        border-radius: 999px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-strong, rgba(255,255,255,0.14));
        background: var(--dsw-alias-bg-elevated, rgba(24,27,36,0.92));
        color: var(--dsw-alias-text-primary, #e8ecf4);
        font: 500 12.5px/1 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
        box-shadow: 0 6px 24px rgba(0,0,0,0.32);
        backdrop-filter: blur(10px);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
      }
      .omc-fab:hover { transform: translateY(-1px); border-color: var(--dsw-alias-accent, #7aa2ff); box-shadow: 0 10px 28px rgba(0,0,0,0.42); }
      .omc-fab svg { width: 16px; height: 16px; flex: none; }

      /* panel */
      .omc-scrim {
        pointer-events: auto; position: absolute; inset: 0;
        background: rgba(6,8,13,0.66); backdrop-filter: blur(3px);
        animation: omc-fade .18s ease;
      }
      @keyframes omc-fade { from { opacity: 0; } to { opacity: 1; } }

      .omc-panel {
        pointer-events: auto;
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        z-index: 62;
        width: min(1480px, calc(100vw - 48px));
        height: min(94vh, 1000px);
        display: flex; flex-direction: column;
        border-radius: 14px; overflow: hidden;
        border: 1px solid var(--dsw-alias-border-strong, rgba(255,255,255,0.12));
        background: var(--dsw-alias-bg-surface, #12151c);
        box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
        animation: omc-rise .2s cubic-bezier(.2,.8,.3,1);
      }
      @keyframes omc-rise { from { opacity: 0; transform: translate(-50%, -47%) scale(.985); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

      .omc-head {
        display: flex; align-items: center; gap: 10px;
        height: 50px; padding: 0 12px 0 16px; flex: none;
        border-bottom: 1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,0.07));
        background: var(--dsw-alias-bg-elevated, rgba(22,25,33,0.98));
        z-index: 63;
      }
      .omc-dot { width: 7px; height: 7px; border-radius: 50%; background: #7aa2ff; box-shadow: 0 0 10px #7aa2ff99; flex: none; }
      .omc-title {
        font: 600 13px/1.2 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
        color: var(--dsw-alias-text-primary, #e8ecf4); letter-spacing: .01em; white-space: nowrap;
      }
      .omc-sub { font: 400 11.5px/1.2 "Microsoft YaHei", sans-serif; color: var(--dsw-alias-text-secondary, #8d97ab); }

      .omc-spacer { flex: 1 1 auto; }

      .omc-group { display: flex; align-items: center; gap: 6px; }

      .omc-select {
        appearance: none; height: 30px; padding: 0 26px 0 10px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,0.1));
        background: var(--dsw-alias-bg-surface, #171a22);
        color: var(--dsw-alias-text-primary, #e8ecf4);
        font: 500 12px/1 "Microsoft YaHei", sans-serif;
        background-image: linear-gradient(45deg, transparent 50%, #8d97ab 50%), linear-gradient(135deg, #8d97ab 50%, transparent 50%);
        background-position: right 12px center, right 8px center;
        background-size: 4px 4px, 4px 4px; background-repeat: no-repeat;
      }
      .omc-select:hover { border-color: var(--dsw-alias-accent, #7aa2ff); }

      .omc-search {
        height: 30px; width: 120px; padding: 0 8px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,0.1));
        background: var(--dsw-alias-bg-surface, #171a22);
        color: var(--dsw-alias-text-primary, #e8ecf4);
        font: 500 12px/1 "Microsoft YaHei", sans-serif;
      }
      .omc-search:focus { outline: none; border-color: var(--dsw-alias-accent, #7aa2ff); width: 150px; }
      .omc-search::placeholder { color: var(--dsw-alias-text-secondary, #8d97ab); }

      .omc-btn {
        height: 30px; padding: 0 11px; border-radius: 8px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
        border: 1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,0.1));
        background: transparent; color: var(--dsw-alias-text-secondary, #a8b2c6);
        font: 500 12px/1 "Microsoft YaHei", sans-serif;
        transition: color .14s ease, border-color .14s ease, background .14s ease;
        white-space: nowrap;
      }
      .omc-btn:hover { color: var(--dsw-alias-text-primary, #e8ecf4); border-color: var(--dsw-alias-border-strong, rgba(255,255,255,0.2)); background: rgba(255,255,255,0.04); }
      .omc-btn[data-on="1"] { color: #cfe0ff; border-color: #7aa2ff66; background: #7aa2ff1f; }
      .omc-btn svg { width: 13px; height: 13px; }

      .omc-iconbtn {
        width: 30px; height: 30px; border-radius: 8px; cursor: pointer; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid transparent; background: transparent; color: var(--dsw-alias-text-secondary, #a8b2c6);
        transition: background .14s ease, color .14s ease;
      }
      .omc-iconbtn:hover { background: rgba(255,255,255,0.07); color: var(--dsw-alias-text-primary, #e8ecf4); }
      .omc-iconbtn svg { width: 15px; height: 15px; }

      .omc-body { position: relative; flex: 1 1 auto; background: #0b0d12; min-height: 0; }
      .omc-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }

      .omc-hint {
        position: absolute; left: 14px; bottom: 12px; z-index: 2;
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px; border-radius: 999px;
        background: rgba(10,13,20,0.62); border: 1px solid rgba(255,255,255,0.08);
        color: #9fb0c9; font: 400 11.5px/1 "Microsoft YaHei", sans-serif;
        backdrop-filter: blur(6px); pointer-events: none;
      }
      .omc-hint b { color: #cfdcf2; font-weight: 600; }
      .omc-hint kbd {
        font: 600 10.5px/1 monospace; padding: 2px 5px; border-radius: 4px;
        background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.09); color: #cfdcf2;
      }

      .omc-toast {
        position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 3;
        padding: 7px 14px; border-radius: 999px;
        background: rgba(10,13,20,0.72); border: 1px solid rgba(122,162,255,0.35);
        color: #cfe0ff; font: 500 12px/1 "Microsoft YaHei", sans-serif;
        backdrop-filter: blur(6px); pointer-events: none;
      }

      .omc-note {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        color: #8d97ab; font: 400 13px/1.5 "Microsoft YaHei", sans-serif; text-align: center;
      }
    `;

    /** Inline SVG icons (kept tiny and stroke-only so they inherit currentColor). */
    const Icon = {
      cube: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M12 2.6 21 7.3v9.4L12 21.4 3 16.7V7.3z' }),
        h('path', { d: 'M3 7.3 12 12l9-4.7M12 12v9.4' })),
      close: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
        h('path', { d: 'M6 6l12 12M18 6L6 18' })),
      expand: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5' })),
      reset: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1' }), h('path', { d: 'M3 4v5h5' })),
      top: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }), h('path', { d: 'M4 12h16M12 4v16' })),
      refresh: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1' }), h('path', { d: 'M21 4v5h-5' })),
      side: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }), h('path', { d: 'M4 15h16' })),
    };

    function ViewButton({ active, onClick, icon, label }) {
      return h('button', {
        type: 'button', className: 'omc-btn', 'data-on': active ? '1' : '0',
        onClick, title: label,
      }, icon(), h('span', null, label));
    }

    function Viewer() {
      const [open, setOpen] = useState(false);
      const [builds, setBuilds] = useState([]);
      const [buildId, setBuildId] = useState('');
      const [query, setQuery] = useState('');
      const [mode, setMode] = useState('persp');
      const [frameKey, setFrameKey] = useState(0);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const frameRef = useRef(null);
      const pendingCam = useRef(null);
      const stampOf = useRef({});
      const base = useMemo(() => '/opusmc/', []);

      const listBuilds = useCallback(async () => {
        const r = await fetch(base + 'api/builds', { cache: 'no-store' });
        const data = await r.json();
        return Array.isArray(data.builds) ? data.builds : [];
      }, [base]);

      // Only scan/refresh while the panel is open — no background work.
      useEffect(() => {
        if (!open) return;
        let live = true;
        const load = async () => {
          try {
            const list = await listBuilds();
            if (!live) return;
            setBuilds(list);
            for (const b of list) stampOf.current[b.id] = b.mtimeMs;
            if (!list.length) setError('没有找到 .litematic 建筑文件');
            else {
              setError('');
              setBuildId((cur) => (cur && list.some((b) => b.id === cur) ? cur : list[0].id));
            }
          } catch (e) { if (live) setError('无法读取建筑列表：' + e.message); }
        };
        load();
        const timer = setInterval(load, 2500);
        return () => { live = false; clearInterval(timer); };
      }, [open, listBuilds]);

      // A rebuilt .litematic reloads in place (same camera); new ones join the dropdown.
      useEffect(() => {
        if (!open) return;
        let live = true;
        const tick = async () => {
          if (!live) return;
          try {
            const list = await listBuilds();
            if (!live) return;
            let changed = false;
            for (const b of list) {
              if (stampOf.current[b.id] !== b.mtimeMs) {
                if (stampOf.current[b.id] !== undefined) changed = true;
                stampOf.current[b.id] = b.mtimeMs;
              }
            }
            const ids = list.map((b) => b.id).join('|'), known = builds.map((b) => b.id).join('|');
            if (ids !== known) {
              setBuilds(list);
              setError(list.length ? '' : '没有找到 .litematic 建筑文件');
              if (!list.some((b) => b.id === buildId) && list.length) setBuildId(list[0].id);
            }
            if (changed && list.some((b) => b.id === buildId)) {
              const win = frameRef.current && frameRef.current.contentWindow;
              if (win && win.__opusmcViewer && win.__opusmcViewer.getCamera) {
                try { pendingCam.current = win.__opusmcViewer.getCamera(); } catch (e) { pendingCam.current = null; }
              }
              setFrameKey((k) => k + 1);
              setNotice('建筑已更新，已重新显示');
              setTimeout(() => live && setNotice(''), 2600);
            }
          } catch (e) { /* transient */ }
        };
        const timer = setInterval(tick, 2500);
        return () => { live = false; clearInterval(timer); };
      }, [open, buildId, builds, listBuilds]);

      useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open]);

      const src = useMemo(() => {
        const q = new URLSearchParams({ embed: '1', _v: String(frameKey) });
        if (buildId) q.set('build', buildId);
        const c = pendingCam.current;
        if (c) q.set('cam', c.map((n) => Math.round(n * 100) / 100).join(','));
        pendingCam.current = null;
        return base + 'viewer.html?' + q.toString();
      }, [base, buildId, frameKey]);

      const callViewer = useCallback((fn, ...args) => {
        const win = frameRef.current && frameRef.current.contentWindow;
        if (!win || !win.__opusmcViewer) return false;
        win.__opusmcViewer[fn](...args);
        return true;
      }, []);

      const applyMode = useCallback((next) => {
        setMode(next);
        const span = 100;
        if (next === 'top') callViewer('topView', span);
        else if (next === 'side') callViewer('setView', 0, 0.12, span * 1.25);
        else callViewer('resetView', span);
      }, [callViewer]);

      // 蓝图下拉：按生成时间倒序（最新在最上面），并按今天/昨天/最近7天/更早分组；
// 带搜索框按名称过滤——建筑一多，靠时间倒序 + 分组 + 搜索才找得回旧的。
      const buildOptions = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        const list = q ? builds.filter((b) => String(b.id).toLowerCase().includes(q)) : builds;
        if (!list.length) {
          return [h('option', { key: '__none', value: '', disabled: true },
            q ? '没有匹配的蓝图' : '暂无蓝图')];
        }
        const now = Date.now();
        const day = 86400000;
        const fmt = (ms) => {
          if (!ms) return '未知时间';
          const diff = now - ms;
          if (diff < 60000) return '刚刚';
          if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
          if (diff < day) return Math.floor(diff / 3600000) + ' 小时前';
          const d = new Date(ms);
          const p = (n) => String(n).padStart(2, '0');
          return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        };
        const kb = (b) => (b.bytes ? Math.max(1, Math.round(b.bytes / 1024)) + ' KB' : '');
        // 旁注里带来的信息：方块量 + 体量档位（没有旁注就退回文件大小）
        const meta = (b) => {
          const parts = [];
          if (typeof b.blocks === 'number' && b.blocks > 0) {
            parts.push((b.blocks >= 10000 ? (b.blocks / 1000).toFixed(1) + 'k' : String(b.blocks)) + ' 块');
          }
          if (b.tierLabel) parts.push(b.tierLabel);
          if (!parts.length) { const k = kb(b); if (k) parts.push(k); }
          return parts.length ? ' · ' + parts.join(' · ') : '';
        };
        const groups = [
          { label: '今天', test: (ms) => now - ms < day },
          { label: '昨天', test: (ms) => now - ms >= day && now - ms < 2 * day },
          { label: '最近 7 天', test: (ms) => now - ms >= 2 * day && now - ms < 7 * day },
          { label: '更早', test: (ms) => now - ms >= 7 * day },
        ];
        const used = new Set();
        const out = [];
        for (const g of groups) {
          const items = list.filter((b) => !used.has(b.id) && g.test(b.mtimeMs || 0));
          if (!items.length) continue;
          out.push(h('optgroup', { key: g.label, label: g.label },
            items.map((b) => {
              used.add(b.id);
              return h('option', { key: b.id, value: b.id },
                b.id + ' · ' + fmt(b.mtimeMs || 0) + meta(b));
            })));
        }
        const rest = list.filter((b) => !used.has(b.id));
        if (rest.length) {
          out.push(h('optgroup', { key: 'unknown', label: '未标注时间' },
            rest.map((b) => h('option', { key: b.id, value: b.id }, b.id))));
        }
        return out;
      }, [builds, query]);

      if (!open) {
        return h('div', { className: 'omc-root' },
          h('button', { type: 'button', className: 'omc-fab', onClick: () => setOpen(true), title: '查看导出的建筑' },
            Icon.cube(), h('span', null, '建筑上帝视角')));
      }

      return h('div', { className: 'omc-root' },
        h('div', { className: 'omc-scrim', onClick: () => setOpen(false) }),
        h('section', { className: 'omc-panel', role: 'dialog', 'aria-label': '建筑上帝视角' },
          h('header', { className: 'omc-head' },
            h('span', { className: 'omc-dot' }),
            h('span', { className: 'omc-title' }, '建筑上帝视角'),
            h('span', { className: 'omc-sub' }, 'OpusMC · 蓝图预览'),
            h('span', { className: 'omc-spacer' }),
            builds.length > 0 && h('input', {
              className: 'omc-search',
              value: query,
              placeholder: '搜索建筑…',
              onChange: (e) => setQuery(e.target.value),
              title: '按名称过滤。列表按生成时间倒序，最新在最上面；也可用分组快速回溯旧的',
            }),
            builds.length > 0 && h('select', {
              className: 'omc-select', value: buildId,
              onChange: (e) => { setBuildId(e.target.value); setFrameKey((k) => k + 1); },
              title: '选择建筑（按生成时间倒序）',
            }, buildOptions),
            h('div', { className: 'omc-group' },
              h(ViewButton, { active: mode === 'persp', onClick: () => applyMode('persp'), icon: Icon.reset, label: '透视' }),
              h(ViewButton, { active: mode === 'top', onClick: () => applyMode('top'), icon: Icon.top, label: '俯视' }),
              h(ViewButton, { active: mode === 'side', onClick: () => applyMode('side'), icon: Icon.side, label: '正视' })),
            h('span', { className: 'omc-spacer' }),
            h('button', { type: 'button', className: 'omc-iconbtn', onClick: () => setFrameKey((k) => k + 1), title: '重新载入' }, Icon.refresh()),
            h('button', { type: 'button', className: 'omc-iconbtn', onClick: () => setOpen(false), title: '关闭' }, Icon.close())),
          h('div', { className: 'omc-body' },
            error ? h('div', { className: 'omc-note' }, error)
              : h('iframe', { key: frameKey + ':' + buildId, ref: frameRef, className: 'omc-frame', src, title: 'OpusMC 建筑预览', allow: 'fullscreen' }),
            notice ? h('div', { className: 'omc-toast' }, notice) : null,
            !error && h('div', { className: 'omc-hint' },
              h('b', null, '拖动'), '旋转', h('span', null, '·'), h('b', null, '滚轮'), '缩放',
              h('span', null, '·'), h('b', null, '右键拖动'), '平移', h('span', null, '·'), h('kbd', null, 'Esc'), '关闭'))));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-opusmc-viewer', '');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => { if (style.parentNode) style.parentNode.removeChild(style); };
        }, 'opusmc-viewer: styles');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'opusmc-viewer',
          order: 20,
        }, Viewer));
      },
    };
  },
});