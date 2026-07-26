/* 데이터 계층 — 모든 localStorage 접근은 이 파일을 통해서만 한다 */
(function () {
  'use strict';

  var PKEY = 'rp.v1.participants';
  var HKEY = 'rp.v1.history';
  var SKEY = 'rp.v1.settings';

  var MAX_PARTICIPANTS = 200;
  var MAX_HISTORY = 50;
  var MAX_NAME = 30;
  var MAX_WEIGHT = 10;
  var SEED_NAMES = ['장미', '튤립', '백합', '해바라기'];

  /* localStorage 사용 가능 여부를 한 번만 검사하고, 불가하면 메모리로 폴백 */
  var storageOk = (function () {
    try {
      var t = 'rp.v1.__test';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  })();

  var mem = {};

  function read(key) {
    if (!storageOk) return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, val) {
    mem[key] = val;
    if (!storageOk) return;
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      storageOk = false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanName(s) {
    return String(s == null ? '' : s).trim().slice(0, MAX_NAME);
  }

  function clampWeight(w) {
    w = Math.round(Number(w));
    if (!isFinite(w)) w = 1;
    return Math.min(MAX_WEIGHT, Math.max(1, w));
  }

  /* ---------------- 참가자 ---------------- */

  function sanitizeParticipants(raw) {
    var out = [];
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length && out.length < MAX_PARTICIPANTS; i++) {
          var it = arr[i];
          if (!it || typeof it !== 'object') continue;
          var name = cleanName(it.name);
          if (!name) continue;
          out.push({
            id: typeof it.id === 'string' && it.id ? it.id : uid(),
            name: name,
            weight: clampWeight(it.weight)
          });
        }
      }
    } catch (e) {
      out = [];
    }
    return out;
  }

  function loadParticipants() {
    var raw = read(PKEY);
    if (raw == null) {
      var seeded = SEED_NAMES.map(function (n) {
        return { id: uid(), name: n, weight: 1 };
      });
      write(PKEY, JSON.stringify(seeded));
      return seeded;
    }
    return sanitizeParticipants(raw);
  }

  var participants = loadParticipants();
  var subs = [];
  var historySubs = [];

  function emit(list) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i]();
      } catch (e) { /* 구독자 오류가 전체를 막지 않게 */ }
    }
  }

  function saveParticipants() {
    write(PKEY, JSON.stringify(participants));
    emit(subs);
  }

  /* ---------------- 기록 ---------------- */

  function loadHistory() {
    var raw = read(HKEY);
    if (raw == null) return [];
    var out = [];
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length && out.length < MAX_HISTORY; i++) {
          var it = arr[i];
          if (!it || typeof it !== 'object') continue;
          if (typeof it.text !== 'string' || !it.text) continue;
          out.push({
            id: typeof it.id === 'string' && it.id ? it.id : uid(),
            tool: it.tool === 'roulette' || it.tool === 'ladder' || it.tool === 'lots' ? it.tool : 'roulette',
            ts: isFinite(Number(it.ts)) ? Number(it.ts) : Date.now(),
            text: String(it.text).slice(0, 200)
          });
        }
      }
    } catch (e) {
      out = [];
    }
    return out;
  }

  var history = loadHistory();

  function saveHistory() {
    write(HKEY, JSON.stringify(history));
    emit(historySubs);
  }

  /* ---------------- 설정 ---------------- */

  var DEFAULT_SETTINGS = {
    ladder: { winners: 1, labels: null },
    lots: { winners: 1 }
  };

  function loadSettings() {
    var out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      var obj = JSON.parse(read(SKEY));
      if (obj && typeof obj === 'object') {
        if (obj.ladder && typeof obj.ladder === 'object') {
          var lw = Math.round(Number(obj.ladder.winners));
          if (isFinite(lw) && lw >= 1) out.ladder.winners = lw;
          if (Array.isArray(obj.ladder.labels)) {
            out.ladder.labels = obj.ladder.labels
              .map(function (s) { return cleanName(s); })
              .filter(function (s) { return s; });
            if (!out.ladder.labels.length) out.ladder.labels = null;
          }
        }
        if (obj.lots && typeof obj.lots === 'object') {
          var ow = Math.round(Number(obj.lots.winners));
          if (isFinite(ow) && ow >= 1) out.lots.winners = ow;
        }
      }
    } catch (e) { /* 기본값 사용 */ }
    return out;
  }

  var settings = loadSettings();

  function saveSettings() {
    write(SKEY, JSON.stringify(settings));
  }

  /* ---------------- 탭 간 동기화 ---------------- */

  window.addEventListener('storage', function (e) {
    if (!storageOk) return;
    if (e.key === PKEY) {
      participants = loadParticipants();
      emit(subs);
    } else if (e.key === HKEY) {
      history = loadHistory();
      emit(historySubs);
    } else if (e.key === SKEY) {
      settings = loadSettings();
    }
  });

  /* ---------------- 공개 API ---------------- */

  window.Store = {
    ok: function () {
      return storageOk;
    },
    LIMITS: {
      participants: MAX_PARTICIPANTS,
      nameLength: MAX_NAME,
      weight: MAX_WEIGHT
    },

    list: function () {
      return participants.map(function (p) {
        return { id: p.id, name: p.name, weight: p.weight };
      });
    },
    count: function () {
      return participants.length;
    },
    add: function (name) {
      name = cleanName(name);
      if (!name || participants.length >= MAX_PARTICIPANTS) return null;
      var p = { id: uid(), name: name, weight: 1 };
      participants.push(p);
      saveParticipants();
      return p;
    },
    addBulk: function (text, replace) {
      var names = String(text == null ? '' : text)
        .split(/\r?\n/)
        .map(cleanName)
        .filter(function (s) { return s; });
      if (!names.length) return { added: 0, truncated: 0 };
      if (replace) participants = [];
      var added = 0;
      for (var i = 0; i < names.length; i++) {
        if (participants.length >= MAX_PARTICIPANTS) break;
        participants.push({ id: uid(), name: names[i], weight: 1 });
        added++;
      }
      saveParticipants();
      return { added: added, truncated: names.length - added };
    },
    update: function (id, patch) {
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].id !== id) continue;
        if (patch && typeof patch.name === 'string') {
          var name = cleanName(patch.name);
          if (name) participants[i].name = name;
        }
        if (patch && patch.weight != null) {
          participants[i].weight = clampWeight(patch.weight);
        }
        saveParticipants();
        return true;
      }
      return false;
    },
    remove: function (id) {
      var before = participants.length;
      participants = participants.filter(function (p) { return p.id !== id; });
      if (participants.length !== before) saveParticipants();
      return participants.length !== before;
    },
    shuffle: function () {
      for (var i = participants.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = participants[i];
        participants[i] = participants[j];
        participants[j] = t;
      }
      saveParticipants();
    },
    clear: function () {
      participants = [];
      saveParticipants();
    },
    subscribe: function (fn) {
      subs.push(fn);
    },

    logHistory: function (tool, text) {
      history.unshift({ id: uid(), tool: tool, ts: Date.now(), text: String(text).slice(0, 200) });
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      saveHistory();
    },
    history: function () {
      return history.slice();
    },
    clearHistory: function () {
      history = [];
      saveHistory();
    },
    subscribeHistory: function (fn) {
      historySubs.push(fn);
    },

    getSettings: function () {
      return JSON.parse(JSON.stringify(settings));
    },
    patchSettings: function (tool, patch) {
      if (!settings[tool]) settings[tool] = {};
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) settings[tool][k] = patch[k];
      }
      saveSettings();
    }
  };
})();
