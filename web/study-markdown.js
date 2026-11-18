/* One reading renderer for course explanations, notes and Markdown previews. */
(() => {
  'use strict';

  const escape = text => String(text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const imageType = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i;
  const attachmentType = /\.(?:pdf|png|jpe?g|gif|webp|avif|bmp|svg|mp3|m4a|wav|ogg|mp4|webm|txt)$/i;
  const languages = {asm: 'nasm', shell: 'bash', sh: 'bash', py: 'python', js: 'javascript', ts: 'typescript'};

  function mathToken(raw, text, display) {
    return {type: display ? 'studyDisplayMath' : 'studyMath', raw, text, display};
  }

  function renderMath(token) {
    return `<span class="${token.display ? 'markdown-display-math' : 'markdown-inline-math'}">${escape(token.text)}</span>`;
  }

  const formatting = {extensions: [
    {
      name: 'studyDisplayMath',
      level: 'block',
      start: source => source.search(/(?:^|\n) {0,3}(?:\$\$|\\\[)/),
      tokenizer(source) {
        const match = /^ {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(source);
        if (match) return mathToken(match[0], (match[1] ?? match[2]).trim(), true);
      },
      renderer: renderMath
    },
    {
      name: 'studyMath',
      level: 'inline',
      start: source => source.search(/\$|\\\(/),
      tokenizer(source) {
        const match = /^(?:\$\$((?:\\.|[^$\n])+?)\$\$|\$(?![\s$])((?:\\.|[^$\n])+?)(?<!\s)\$(?![\d$])|\\\(([^\n]+?)\\\))/.exec(source);
        if (match) {
          const token = mathToken(match[0], match[1] ?? match[2] ?? match[3], match[1] !== undefined);
          return {...token, type: 'studyMath'};
        }
      },
      renderer: renderMath
    },
    {
      name: 'studyWikiLink',
      level: 'inline',
      start: source => source.search(/!?\[\[/),
      tokenizer(source) {
        const match = /^(!?)\[\[([^\]\n]+?)\]\]/.exec(source);
        if (match) return {type: 'studyWikiLink', raw: match[0], embed: !!match[1], text: match[2]};
      },
      renderer(token) {
        const [reference, alias] = token.text.split('|', 2).map(part => part.trim());
        const [path, heading] = reference.split('#', 2);
        const label = alias || heading || path.split('/').at(-1);
        if (token.embed && imageType.test(path)) {
          const dimensions = /^([1-9]\d{0,3})(?:x([1-9]\d{0,3}))?$/i.exec(alias || '');
          return `<img class="markdown-wiki-image" alt="${escape(path.split('/').at(-1))}" title="${escape(path)}"${dimensions ? ` width="${dimensions[1]}"` : ''}${dimensions?.[2] ? ` height="${dimensions[2]}"` : ''}>`;
        }
        return `<a class="markdown-wiki-link" title="${escape(reference)}">${escape(label || reference)}</a>`;
      }
    },
    {
      name: 'studyHighlight',
      level: 'inline',
      start: source => source.indexOf('=='),
      tokenizer(source) {
        const match = /^==(?=\S)((?:\\.|[^=\n])+?)(?<=\S)==/.exec(source);
        if (match) return {type: 'studyHighlight', raw: match[0], tokens: this.lexer.inlineTokens(match[1])};
      },
      renderer(token) {return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;}
    },
    {
      name: 'studyComment',
      level: 'inline',
      start: source => source.indexOf('%%'),
      tokenizer(source) {
        const match = /^%%[\s\S]*?%%/.exec(source);
        if (match) return {type: 'studyComment', raw: match[0]};
      },
      renderer() {return '';}
    }
  ], renderer: {
    html(token) {
      const marker = /^<!-- block:([\w-]+) -->\s*$/.exec(token.text);
      return marker ? `<div class="markdown-section-marker">${marker[1]}</div>` : false;
    },
    checkbox({checked}) {
      return `<span class="markdown-task-box" role="img" aria-label="${checked ? '已完成' : '未完成'}">${checked ? '☑' : '☐'}</span> `;
    },
    blockquote(token) {
      const match = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/.exec(token.text);
      if (!match) return false;
      const kind = match[1].toLowerCase();
      const nested = markdownParser();
      const title = nested.parseInline(match[3] || kind[0].toUpperCase() + kind.slice(1));
      const body = nested.parse(token.text.slice(match[0].length));
      const attrs = `class="markdown-callout markdown-callout-${kind}"`;
      return match[2]
        ? `<details ${attrs}${match[2] === '+' ? ' open' : ''}><summary>${title}</summary><div>${body}</div></details>`
        : `<aside ${attrs}><div class="markdown-callout-title">${title}</div><div>${body}</div></aside>`;
    }
  }};

  function markdownParser() {
    const parser = new marked.Marked({gfm: true, breaks: false});
    parser.use(formatting);
    if (typeof window.markedFootnote === 'function') {
      parser.use(window.markedFootnote({description: '脚注', backRefLabel: '返回脚注引用 {0}'}));
    }
    return parser;
  }

  let nextRender = 0;
  function render(text, {documentPath = '', sections = false} = {}) {
    const fragment = DOMPurify.sanitize(markdownParser().parse(String(text ?? '')), {
      USE_PROFILES: {html: true}, RETURN_DOM_FRAGMENT: true, ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'],
      FORBID_ATTR: ['style', 'srcset']
    });
    for (const placeholder of fragment.querySelectorAll('.markdown-inline-math,.markdown-display-math')) {
      const text = placeholder.textContent;
      try {
        placeholder.innerHTML = katex.renderToString(text, {
          displayMode: placeholder.classList.contains('markdown-display-math'),
          throwOnError: false, trust: false, strict: 'ignore'
        });
      } catch {placeholder.textContent = text;}
    }
    for (const code of fragment.querySelectorAll('pre > code')) {
      const name = [...code.classList].find(value => value.startsWith('language-'))?.slice(9).toLowerCase();
      const grammar = window.Prism?.languages[languages[name] || name];
      if (name && grammar) code.innerHTML = Prism.highlight(code.textContent, grammar, languages[name] || name);
    }
    const idPrefix = 'study-md-' + (++nextRender) + '-';
    const targets = new Map();
    fragment.querySelectorAll('[id],h1,h2,h3,h4,h5,h6').forEach(element => {
      const id = element.id || element.textContent.trim().replace(/\s+/g, '-');
      targets.set(id.toLowerCase(), idPrefix + id);
      element.id = idPrefix + id;
    });
    fragment.querySelectorAll('[aria-describedby]').forEach(element => {
      const ids = element.getAttribute('aria-describedby').split(/\s+/);
      element.setAttribute('aria-describedby', ids.map(id => targets.get(id.toLowerCase()) || id).join(' '));
    });
    fragment.querySelectorAll('img,a').forEach(node => resolveLink(node, documentPath, targets));
    if (!sections) fragment.querySelectorAll('.markdown-section-marker').forEach(marker => marker.remove());
    fragment.querySelectorAll('table').forEach(table => {
      const scroll = document.createElement('div');
      scroll.className = 'markdown-table-scroll';
      table.replaceWith(scroll);
      scroll.append(table);
    });
    const container = document.createElement('div');
    container.append(fragment);
    return container.innerHTML;
  }

  function decode(value) {
    try {return decodeURIComponent(value);} catch {return value;}
  }

  function resolveLink(node, documentPath, targets) {
    const image = node.tagName === 'IMG';
    const attr = image ? 'src' : 'href';
    const wiki = node.classList.contains(image ? 'markdown-wiki-image' : 'markdown-wiki-link');
    const reference = wiki ? node.title : node.getAttribute(attr);
    if (!reference) return;
    const [file, anchor] = reference.split(/#(.*)/s, 2);
    if (!file && anchor && !image) {
      const target = targets.get(decode(anchor).toLowerCase()) || targets.get(decode(anchor).replace(/\s+/g, '-').toLowerCase());
      if (target) node.setAttribute('href', '#' + encodeURIComponent(target));
      return;
    }
    if (!/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(file)) {
      const params = new URLSearchParams({ref: wiki ? file : decode(file), document: documentPath});
      if (wiki) params.set('wiki', '1');
      if (image) params.set('image', '1');
      if (!image && (/\.md$/i.test(file) || wiki && !attachmentType.test(file))) {
        node.classList.add('markdown-note-link');
      }
      node.setAttribute(attr, '/api/markdown-file?' + params + (anchor && !image ? '#' + anchor : ''));
    }
    if (wiki) node.removeAttribute('title');
    if (image) {
      if (/^(?:https?:)?\/\//i.test(reference)) {
        const link = document.createElement('a');
        link.href = reference;
        link.textContent = node.alt || '打开外链图片';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        node.replaceWith(link);
        return;
      }
      node.loading = 'lazy';
    }
    else if (!node.getAttribute('href')?.startsWith('#')) {
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    }
  }

  let mermaidPromise, diagramId=0, diagrams = Promise.resolve();
  function mermaid() {
    if (!mermaidPromise) mermaidPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/mermaid-runtime.js';
      script.onload = () => {
        const engine = window.mermaid;
        if (!engine) return reject(new Error('Mermaid unavailable'));
        engine.initialize({startOnLoad: false, securityLevel: 'strict', htmlLabels: false, maxTextSize: 16000});
        resolve(engine);
      };
      script.onerror = reject;
      document.head.append(script);
    });
    return mermaidPromise;
  }

  function mount(container) {
    for (const code of container.querySelectorAll('pre > code.language-mermaid')) {
      const block = code.parentElement;
      if (block.classList.contains('markdown-diagram-source')) continue;
      block.classList.add('markdown-diagram-source');
      const source = code.textContent;
      diagrams = diagrams.then(async () => {
        if (!block.isConnected) return;
        try {
          const engine = await mermaid();
          const {svg} = await engine.render('study-diagram-' + (++diagramId), source);
          if (!block.isConnected) return;
          // An SVG image is inert and keeps diagram text out of reading annotations.
          const image = new Image();
          image.className = 'markdown-diagram';
          image.alt = 'Mermaid 图';
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
          block.before(image);
          block.hidden = true;
        } catch {
          block.classList.add('markdown-diagram-fallback');
        }
      });
    }
  }

  window.StudyMarkdown = {render, mount};
})();
