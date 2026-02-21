// ==UserScript==
// @name         MTG Standard Year Annotator
// @namespace    https://example.invalid/
// @version      0.3.0
// @description  Shows when Magic cards fall out of rotation on the https://mtgdecks.net/Standard/ deck overview.
// @match        https://mtgdecks.net/Standard/*
// @run-at       document-idle
//
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
//
// @connect      raw.githubusercontent.com
// @connect      githubusercontent.com
// ==/UserScript==

(() => {
  "use strict";

  const HAS_GM = typeof GM !== "undefined";

  const CARD_TO_YEAR_CSV_URL = "https://raw.githubusercontent.com/Drox346/MTG-Card-Age/refs/heads/main/data/card_data.csv";
  const DEBUG = true;

  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_BUSTER = "";

  const ROW_SELECTOR = "tr.cardItem";
  const PROCESSED_ATTR = "data-mtg-year-added";
  const YEAR_CELL_ATTR = "data-mtg-year-cell";
  const STYLE_TAG_ID = "mtg-year-annotator-style";

  function debugLog(...args) {
    if (!DEBUG) return;
    console.debug("[MTG Year Annotator]", ...args);
  }

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
        color: #6b7c94;
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
          debugLog("CSV loaded from cache", { cacheKey, url });
          return { text, fromCache: true };
        }
      }
    }

    const text = await fetchText(withCacheBuster(url));
    await setCachedValue(cacheKey, { fetchedAt: now, text });
    debugLog("CSV fetched from network", { cacheKey, url });
    return { text, fromCache: false };
  }

  let cardToYear = null; // Map<string, string>

  async function initData() {
    const data = await loadOrFetchCsv("mtg_csv_card_to_year", CARD_TO_YEAR_CSV_URL);
    debugLog("initData start", { fromCache: data.fromCache });

    const m1 = new Map();
    for (const [card, yearRaw] of parseCsvTwoColumns(data.text)) {
      const yearInt = Number.parseInt((yearRaw || "").trim(), 10);
      if (!Number.isFinite(yearInt)) continue;
      const year = String(yearInt);
      const keys = getCardLookupKeys(card);
      for (const key of keys) {
        const existing = Number.parseInt(m1.get(key) || "", 10);
        if (!Number.isFinite(existing) || yearInt > existing) {
          m1.set(key, year);
        }
      }
    }

    cardToYear = m1;
    debugLog("initData complete", { cardToYearSize: cardToYear.size });
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

    const year = cardToYear.get(cardName);
    if (!year) {
      debugLog("no year found", { cardName });
      tr.setAttribute(PROCESSED_ATTR, "1");
      return;
    }

    debugLog("annotated", { cardName, year });
    tr.appendChild(createYearCell(year));

    tr.setAttribute(PROCESSED_ATTR, "1");
  }

  function annotateAll() {
    const rows = document.querySelectorAll(ROW_SELECTOR);
    debugLog("annotateAll", { rowCount: rows.length });
    for (const tr of rows) annotateRow(tr);
  }

  (async () => {
    try {
      debugLog("script start");
      await initData();
      injectStyles();
      annotateAll();
      debugLog("script done");
    } catch (e) {
      console.error("[MTG Year Annotator] init failed:", e);
    }
  })();
})();
