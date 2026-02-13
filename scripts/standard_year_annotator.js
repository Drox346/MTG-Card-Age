// ==UserScript==
// @name         MTG Standard Year Annotator (CSV + Cache)
// @namespace    https://example.invalid/
// @version      0.2.0
// @description  Loads 2 CSVs (card->origin, origin->year), caches them, and appends a new trailing <td> with year on each <tr.cardItem>.
// @match        https://mtgdecks.net/Standard/*
// @run-at       document-idle
//
// Required for cross-origin fetch + storage (Violentmonkey).
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
//
// Allow fetching the CSVs (adjust domains to your real ones).
// @connect      raw.githubusercontent.com
// @connect      githubusercontent.com
// ==/UserScript==

(() => {
  "use strict";

  const HAS_GM = typeof GM !== "undefined";

  const CARD_TO_ORIGIN_CSV_URL = "https://raw.githubusercontent.com/Drox346/MTG-Card-Age/refs/heads/main/data/card_origin.csv";
  const ORIGIN_TO_YEAR_CSV_URL = "https://raw.githubusercontent.com/Drox346/MTG-Card-Age/refs/heads/main/data/origin_modern_availability.csv";

  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_BUSTER = "";

  const ROW_SELECTOR = "tr.cardItem";
  const PROCESSED_ATTR = "data-mtg-year-added";
  const YEAR_CELL_ATTR = "data-mtg-year-cell";
  const STYLE_TAG_ID = "mtg-year-annotator-style";

  function getCardNameFromRow(tr) {
    return (tr.getAttribute("data-card-id") || "").trim();
  }

  function createYearCell(year) {
    const td = document.createElement("td");
    td.setAttribute(YEAR_CELL_ATTR, "1");
    td.textContent = year;
    return td;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_TAG_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_TAG_ID;
    style.textContent = `
      ${ROW_SELECTOR} td[${YEAR_CELL_ATTR}="1"] {
        padding-left: 0.65rem;
        white-space: nowrap;
        text-align: right;
        color: #9aa4b2;
        font-weight: 600;
        opacity: 0.95;
      }
    `;
    document.head.appendChild(style);
  }

  function parseCsvTwoColumns(text) {
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));

    const pairs = [];
    for (const line of lines) {
      const cols = parseCsvLine(line);
      if (cols.length < 2) continue;
      const a = (cols[0] ?? "").trim();
      const b = (cols[1] ?? "").trim();
      if (a && b) pairs.push([a, b]);
    }
    return pairs;
  }

  function parseCsvLine(line) {
    const out = [];
    let i = 0;
    while (i < line.length) {
      while (i < line.length && line[i] === " ") i++;

      let field = "";
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          const ch = line[i];
          if (ch === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            i++;
            break;
          }
          field += ch;
          i++;
        }
        while (i < line.length && line[i] === " ") i++;
        if (i < line.length && line[i] === ",") i++;
      } else {
        while (i < line.length && line[i] !== ",") {
          field += line[i];
          i++;
        }
        if (i < line.length && line[i] === ",") i++;
        field = field.trim();
      }
      out.push(field);
      while (i < line.length && line[i] === " ") i++;
    }
    return out;
  }

  function fetchText(url) {
    if (HAS_GM && typeof GM.xmlHttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: "GET",
          url,
          headers: {
            "Cache-Control": "no-cache",
          },
          onload: (resp) => {
            if (resp.status >= 200 && resp.status < 300) resolve(resp.responseText ?? "");
            else reject(new Error(`HTTP ${resp.status} for ${url}`));
          },
          onerror: () => reject(new Error(`Network error for ${url}`)),
          ontimeout: () => reject(new Error(`Timeout for ${url}`)),
        });
      });
    }

    return fetch(url, { cache: "no-store" }).then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return resp.text();
    });
  }

  async function getCachedValue(key) {
    if (HAS_GM && typeof GM.getValue === "function") {
      return GM.getValue(key, null);
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function setCachedValue(key, value) {
    if (HAS_GM && typeof GM.setValue === "function") {
      return GM.setValue(key, value);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  }

  function withCacheBuster(url) {
    if (!CACHE_BUSTER) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${CACHE_BUSTER}`;
  }

  async function loadOrFetchCsv(cacheKey, url) {
    const now = Date.now();
    const cached = await getCachedValue(cacheKey);

    if (cached && typeof cached === "object") {
      const { fetchedAt, text } = cached;
      if (typeof fetchedAt === "number" && typeof text === "string") {
        if ((now - fetchedAt) < CACHE_TTL_MS) {
          return { text, fromCache: true };
        }
      }
    }

    const text = await fetchText(withCacheBuster(url));
    await setCachedValue(cacheKey, { fetchedAt: now, text });
    return { text, fromCache: false };
  }

  let cardToOrigins = null; // Map<string, string[]>
  let originToYear = null; // Map<string, string>

  async function initData() {
    const [a, b] = await Promise.all([
      loadOrFetchCsv("mtg_csv_card_to_origin", CARD_TO_ORIGIN_CSV_URL),
      loadOrFetchCsv("mtg_csv_origin_to_year", ORIGIN_TO_YEAR_CSV_URL),
    ]);

    const m1 = new Map();
    for (const [card, origin] of parseCsvTwoColumns(a.text)) {
      const keys = getCardLookupKeys(card);
      for (const key of keys) {
        const current = m1.get(key) || [];
        if (!current.includes(origin)) current.push(origin);
        m1.set(key, current);
      }
    }

    const m2 = new Map();
    for (const [origin, year] of parseCsvTwoColumns(b.text)) {
      m2.set(origin.trim(), year.trim());
    }

    cardToOrigins = m1;
    originToYear = m2;
  }

  function normalizeCardName(name) {
    return name.trim().replace(/\s+/g, " ");
  }

  function getCardLookupKeys(name) {
    const normalized = normalizeCardName(name);
    if (!normalized) return [];

    const parts = normalized
      .split(/\s*\/\/\s*/)
      .map(part => normalizeCardName(part))
      .filter(Boolean);

    return [...new Set([normalized, ...parts])];
  }

  function resolveYearFromOrigins(origins) {
    if (!Array.isArray(origins) || !origins.length) return null;

    let maxYear = null;
    for (const origin of origins) {
      const yearRaw = originToYear.get((origin || "").trim());
      if (!yearRaw) continue;
      const yearInt = Number.parseInt(yearRaw, 10);
      if (!Number.isFinite(yearInt)) continue;
      if (maxYear === null || yearInt > maxYear) {
        maxYear = yearInt;
      }
    }
    return maxYear === null ? null : String(maxYear);
  }

  function annotateRow(tr) {
    if (tr.getAttribute(PROCESSED_ATTR) === "1") return;
    if (tr.querySelector(`td[${YEAR_CELL_ATTR}="1"]`)) {
      tr.setAttribute(PROCESSED_ATTR, "1");
      return;
    }

    const tds = tr.querySelectorAll("td");
    if (!tds.length) return;

    const cardNameRaw = getCardNameFromRow(tr);
    const cardName = normalizeCardName(cardNameRaw);
    if (!cardName) return;

    const origins = cardToOrigins.get(cardName);
    if (!origins || !origins.length) {
      tr.setAttribute(PROCESSED_ATTR, "1");
      return;
    }

    const year = resolveYearFromOrigins(origins);
    if (!year) {
      tr.setAttribute(PROCESSED_ATTR, "1");
      return;
    }

    tr.appendChild(createYearCell(year));

    tr.setAttribute(PROCESSED_ATTR, "1");
  }

  function annotateAll() {
    const rows = document.querySelectorAll(ROW_SELECTOR);
    for (const tr of rows) annotateRow(tr);
  }

  (async () => {
    try {
      await initData();
      injectStyles();
      annotateAll();
    } catch (e) {
      console.error("[MTG Year Annotator] init failed:", e);
    }
  })();
})();
