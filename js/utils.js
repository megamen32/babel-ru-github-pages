(() => {
  const app = window.BabelApp;
  const ALG = app.config.ALG;

  app.utils = {
    $(selector) {
      return document.querySelector(selector);
    },
    $$(selector) {
      return document.querySelectorAll(selector);
    },
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
      const lower = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
      let output = "";
      for (const char of lower) {
        output += ALG.alphabet.includes(char) ? char : " ";
      }
      return output.replace(/\s+/g, " ").trim();
    },
    paragraphize(text) {
      const trimmed = String(text).replace(/\s+$/g, "");
      const rows = [];
      for (let index = 0; index < trimmed.length; index += ALG.lineWidth) {
        rows.push(trimmed.slice(index, index + ALG.lineWidth));
      }
      return rows.join("\n");
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
      const raw = text.slice(start, end).trim();
      return `${start > 0 ? "… " : ""}${raw}${end < text.length ? " …" : ""}`;
    },
    highlightByRange(text, range) {
      const safeStart = app.utils.clamp(range.start, 0, text.length);
      const safeEnd = app.utils.clamp(range.start + range.length, safeStart, text.length);
      return `${app.utils.esc(text.slice(0, safeStart))}<mark>${app.utils.esc(text.slice(safeStart, safeEnd))}</mark>${app.utils.esc(text.slice(safeEnd))}`;
    },
    renderPageSpans(text, highlight) {
      let output = "";
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index] === "\n" ? "\n" : app.utils.esc(text[index]);
        const isMarked = highlight && index >= highlight.start && index < highlight.start + highlight.length;
        output += `<span class="char ${isMarked ? "marked" : ""}" data-pos="${index}">${char}</span>`;
        if ((index + 1) % ALG.lineWidth === 0) {
          output += "\n";
        }
      }
      return output;
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
