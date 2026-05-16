(() => {
  const app = window.BabelApp;
  const ALG = app.config.ALG;

  /* Build char→index lookup from the alphabet array.
     Handles multi-JS-char entries (emoji) via greedy longest match. */
  const charToIndex = new Map();
  for (let i = 0; i < ALG.alphabet.length; i++) {
    charToIndex.set(ALG.alphabet[i], i);
  }

  app.utils = {
    charToIndex,

    /* Tokenize a string into an array of alphabet indices (0–255).
       Greedy longest-match handles emoji (2–4 JS chars).
       Unknown characters → 0 (space). */
    tokenizeText(text) {
      const indices = [];
      let i = 0;
      while (i < text.length) {
        let matched = false;
        for (let len = 4; len >= 1; len--) {
          if (i + len > text.length) continue;
          const substr = text.slice(i, i + len);
          const idx = charToIndex.get(substr);
          if (idx !== undefined) {
            indices.push(idx);
            i += len;
            matched = true;
            break;
          }
        }
        if (!matched) {
          indices.push(0);
          i++;
        }
      }
      return indices;
    },

    /* Convert an array of alphabet indices back to a string */
    indicesToString(indices) {
      return indices.map(i => ALG.alphabet[i]).join("");
    },

    $(selector) { return document.querySelector(selector); },
    $$(selector) { return document.querySelectorAll(selector); },
    esc(value) {
      return String(value).replace(/[&<>"']/g, (char) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]
      ));
    },
    fnv1a(input) {
      let hash = 0x811c9dc5;
      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return hash >>> 0;
    },
    mulberry32(seed) {
      let state = seed >>> 0;
      return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let word = Math.imul(state ^ (state >>> 15), 1 | state);
        word = (word + Math.imul(word ^ (word >>> 7), 61 | word)) ^ word;
        return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
      };
    },
    rngFrom(text) {
      return app.utils.mulberry32(app.utils.fnv1a(text));
    },
    normalizeText(raw) {
      let text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      text = text.toLowerCase().replace(/[ \t]+/g, " ").trim();
      // No more VISUAL_OVERLAP mapping — kept as separate alphabet entries.
      // Tokenize — unknowns become space (index 0)
      const indices = app.utils.tokenizeText(text);
      // Convert back and collapse spaces
      return app.utils.indicesToString(indices).replace(/ +/g, " ").trim();
    },
    shortNumber(value) {
      const stringValue = String(value);
      return stringValue.length <= 12 ? stringValue : `${stringValue.slice(0, 6)}…${stringValue.slice(-4)}`;
    },
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    snippetByRange(text, range, pad) {
      const extra = pad || 70;
      const start = Math.max(0, range.start - extra);
      const end = Math.min(text.length, range.start + range.length + extra);
      const raw = text.slice(start, end).replace(/\n/g, " ").trim();
      return `${start > 0 ? "… " : ""}${raw}${end < text.length ? " …" : ""}`;
    },
    highlightByRange(text, range) {
      const safeStart = app.utils.clamp(range.start, 0, text.length);
      const safeEnd = app.utils.clamp(range.start + range.length, safeStart, text.length);
      return `${app.utils.esc(text.slice(0, safeStart))}<mark>${app.utils.esc(text.slice(safeStart, safeEnd))}</mark>${app.utils.esc(text.slice(safeEnd))}`;
    },
    /* Render page content from indices array (0–4095).
       Newlines (index 1) become <br>. Highlight uses <mark>.
       Optimized: batches consecutive plain chars for speed. */
    renderPageFromIndices(indices, highlight) {
      let html = '';
      let batch = '';
      const flush = () => { if (batch) { html += app.utils.esc(batch); batch = ''; } };

      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const isMarked = highlight && i >= highlight.start && i < highlight.start + highlight.length;

        if (idx === 1) { // newline
          flush();
          html += isMarked ? '<mark class="nl-mark">↵</mark><br>' : '<br>';
        } else if (isMarked) {
          flush();
          html += `<mark>${app.utils.esc(ALG.alphabet[idx])}</mark>`;
        } else {
          batch += ALG.alphabet[idx];
        }
      }
      flush();
      return html;
    },
    copyText(value, message) {
      return navigator.clipboard.writeText(value).then(() => {
        window.alert(message);
      });
    },
    downloadText(filename, content) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    routeFor(base, params) {
      const query = params ? `?${new URLSearchParams(params).toString()}` : "";
      return `#${base}${query}`;
    },
  };
})();
