/* Paint each saved mark by wrapped reading line rather than by text node. */
(() => {
  'use strict';

  const blocks = 'p,li,td,th,pre,blockquote,dd,dt,summary,h1,h2,h3,h4,h5,h6,div,.markdown-display-math,.katex-display';
  const clipped = /^(auto|scroll|hidden|clip|overlay)$/;
  const underlineColors = {black: '#333', red: '#c74343', blue: '#3163ae'};
  const highlightColors = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
  let unmount;

  function clipBounds(block, root, cache) {
    if (cache.has(block)) return cache.get(block);
    const bounds = {left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity};
    for (let box = block; box && box !== root; box = box.parentElement) {
      const style = getComputedStyle(box);
      if (!clipped.test(style.overflowX) && !clipped.test(style.overflowY)) continue;
      const rect = box.getBoundingClientRect();
      const left = rect.left + box.clientLeft, top = rect.top + box.clientTop;
      if (clipped.test(style.overflowX)) {
        bounds.left = Math.max(bounds.left, left);
        bounds.right = Math.min(bounds.right, left + box.clientWidth);
      }
      if (clipped.test(style.overflowY)) {
        bounds.top = Math.max(bounds.top, top);
        bounds.bottom = Math.min(bounds.bottom, top + box.clientHeight);
      }
    }
    cache.set(block, bounds);
    return bounds;
  }

  function mathBaseline(base, cache) {
    if (!cache.has(base)) {
      const strut = base.querySelector(':scope > .strut');
      const box = strut || base;
      const verticalAlign = strut ? parseFloat(getComputedStyle(strut).verticalAlign) || 0 : 0;
      cache.set(base, box.getBoundingClientRect().bottom + verticalAlign);
    }
    return cache.get(base);
  }

  function addToLine(lines, rect, baseline, tolerance, isText) {
    let row = lines.find(line => Math.abs(line.baseline - baseline) <= tolerance);
    if (!row) {
      lines.push({left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, baseline, isText});
      return;
    }
    row.left = Math.min(row.left, rect.left);
    row.right = Math.max(row.right, rect.right);
    row.top = Math.min(row.top, rect.top);
    row.bottom = Math.max(row.bottom, rect.bottom);
    if (isText && !row.isText) {
      row.baseline = baseline;
      row.isText = true;
    }
  }

  function fragments(root, nodes, marks) {
    const output = [];
    const range = document.createRange();
    const fontMetrics = document.createElement('canvas').getContext('2d');
    const baselines = new Map(), clips = new Map(), descents = new Map(), layouts = new Map();

    for (const mark of marks) {
      const groups = new Map();
      for (const item of nodes) {
        if (item.end <= mark.start || item.start >= mark.end) continue;
        const parent = item.node.parentElement;
        const formula = parent.closest('.katex');
        const base = formula && (parent.closest('.base') || formula);
        const block = (formula?.parentElement || parent).closest(blocks) || root;
        if (!layouts.has(block)) {
          const style = getComputedStyle(block);
          const size = parseFloat(style.fontSize) || 16;
          const lineHeight = parseFloat(style.lineHeight) || size * 1.2;
          layouts.set(block, {size, tolerance: Math.min(10, lineHeight * .38)});
        }
        if (!groups.has(block)) groups.set(block, []);
        const lines = groups.get(block), {tolerance} = layouts.get(block);
        range.setStart(item.node, Math.max(0, mark.start - item.start));
        range.setEnd(item.node, Math.min(item.node.length, mark.end - item.start));
        let descent = layouts.get(block).size * .2;
        if (!base) {
          const style = getComputedStyle(parent);
          const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          if (!descents.has(font)) {
            if (fontMetrics) fontMetrics.font = font;
            const measured = fontMetrics?.measureText('Ag').fontBoundingBoxDescent;
            descents.set(font, measured ?? parseFloat(style.fontSize) * .2);
          }
          descent = descents.get(font);
        }
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          const baseline = base ? mathBaseline(base, baselines) : rect.bottom - descent;
          addToLine(lines, rect, baseline, tolerance, !base);
        }
      }
      for (const [block, lines] of groups) {
        const clip = clipBounds(block, root, clips);
        const {size} = layouts.get(block);
        for (const line of lines) {
          const left = Math.max(line.left, clip.left), right = Math.min(line.right, clip.right);
          const highlight = mark.style === 'highlight';
          const top = highlight ? line.top - 1
            : mark.style === 'strike' ? line.baseline - size * .3
            : Math.max(line.baseline + 3, line.bottom + .5);
          const bottom = highlight ? line.bottom + 1 : top + 1.5;
          const clippedTop = Math.max(top, clip.top), clippedBottom = Math.min(bottom, clip.bottom);
          if (right > left && clippedBottom > clippedTop) {
            output.push({mark, left, top: clippedTop, width: right - left, height: clippedBottom - clippedTop});
          }
        }
      }
    }
    return output;
  }

  function makeLayer(className) {
    const layer = document.createElement('div');
    layer.className = 'reading-mark-layer ' + className;
    layer.setAttribute('aria-hidden', 'true');
    return layer;
  }

  function mount(root, nodes = [], marks = []) {
    unmount?.();
    unmount = null;
    if (!root || !marks.length) return;

    const controller = new AbortController();
    const {signal} = controller;
    const highlights = makeLayer('reading-mark-highlights');
    const ink = makeLayer('reading-mark-ink');
    root.classList.add('reading-mark-host');
    root.append(highlights, ink);
    let frame = 0;

    function paint() {
      frame = 0;
      if (!root.isConnected) return;
      const origin = root.getBoundingClientRect();
      const high = document.createDocumentFragment(), lines = document.createDocumentFragment();
      for (const {mark, left, top, width, height} of fragments(root, nodes, marks)) {
        const bar = document.createElement('span');
        const highlight = mark.style === 'highlight';
        bar.className = 'reading-mark-fragment';
        bar.dataset.markId = mark.id;
        bar.dataset.markStyle = mark.style;
        Object.assign(bar.style, {
          left: `${left - origin.left - root.clientLeft}px`,
          top: `${top - origin.top - root.clientTop}px`,
          width: `${width}px`, height: `${height}px`
        });
        if (highlight) {
          bar.classList.add('color-' + (highlightColors.has(mark.color) ? mark.color : 'yellow'));
          high.append(bar);
        } else {
          bar.style.backgroundColor = mark.style === 'strike' ? '#444' : underlineColors[mark.color] || underlineColors.black;
          lines.append(bar);
        }
      }
      highlights.replaceChildren(high);
      ink.replaceChildren(lines);
    }

    function schedule() {
      if (!signal.aborted && !frame) frame = requestAnimationFrame(paint);
    }

    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    window.addEventListener('resize', schedule, {signal});
    for (const event of ['scroll', 'load', 'toggle']) root.addEventListener(event, schedule, {capture: true, signal});
    document.fonts?.addEventListener('loadingdone', schedule, {signal});
    schedule();
    unmount = () => {
      controller.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);
      root.classList.remove('reading-mark-host');
      highlights.remove();
      ink.remove();
    };
  }

  window.StudyReadingMarks = {mount};
})();
