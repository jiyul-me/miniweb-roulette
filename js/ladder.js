/* 사다리타기 — 세로 사다리, 이름 클릭 시 경로 애니메이션 */
(function () {
  'use strict';

  var MAX_PLAYERS = 20;
  var MIN_COL_W = 56;
  var MAX_COL_W = 110;
  var ROW_GAP = 26;
  var PAD_Y = 16;

  var canvas, ctx, topRow, bottomRow, innerEl, scrollEl, noticeEl, hintEl;
  var stepperValue, revealAllBtn, rebuildBtn, editLabelsBtn;
  var labelsDialog, labelsInputs, labelsSaveBtn, labelsResetBtn, labelsCancelBtn;

  /* 게임 상태 */
  var players = [];        /* build 시점 스냅샷 */
  var n = 0;
  var H = 0;               /* 가로줄 행 수 */
  var rungs = [];          /* rungs[r][i] : r행에서 i–i+1 레일 사이 가로줄 */
  var bottomLabels = [];   /* 슬롯 순서로 셔플된 결과 문구 */
  var outcomes = [];       /* 플레이어 i가 도착하는 슬롯 */
  var revealedPlayers = [];
  var revealedSlots = [];
  var anims = [];          /* {i, t0, dur} 진행 중 경로 애니메이션 */
  var logged = false;
  var colW = MIN_COL_W;
  var canvasH = 0;
  var rafActive = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    canvas = document.getElementById('ladderCanvas');
    ctx = canvas.getContext('2d');
    topRow = document.getElementById('ladderTop');
    bottomRow = document.getElementById('ladderBottom');
    innerEl = document.getElementById('ladderInner');
    scrollEl = document.querySelector('.ladder-scroll');
    noticeEl = document.getElementById('ladderNotice');
    hintEl = document.getElementById('ladderHint');
    stepperValue = document.getElementById('ladderWinnerValue');
    revealAllBtn = document.getElementById('revealAllBtn');
    rebuildBtn = document.getElementById('rebuildBtn');
    editLabelsBtn = document.getElementById('editLabelsBtn');
    labelsDialog = document.getElementById('labelsDialog');
    labelsInputs = document.getElementById('labelsInputs');
    labelsSaveBtn = document.getElementById('labelsSaveBtn');
    labelsResetBtn = document.getElementById('labelsResetBtn');
    labelsCancelBtn = document.getElementById('labelsCancelBtn');

    UI.mountEntryPanel(document.getElementById('entryPanel'), { collapsible: true });
    UI.mountHistoryPanel(document.getElementById('historyPanel'));

    var stepper = document.getElementById('ladderWinnerStepper');
    stepper.querySelector('[data-act="minus"]').addEventListener('click', function () {
      changeWinners(-1);
    });
    stepper.querySelector('[data-act="plus"]').addEventListener('click', function () {
      changeWinners(1);
    });

    revealAllBtn.addEventListener('click', revealAll);
    rebuildBtn.addEventListener('click', build);
    editLabelsBtn.addEventListener('click', openLabelsDialog);
    labelsSaveBtn.addEventListener('click', saveLabels);
    labelsResetBtn.addEventListener('click', function () {
      Store.patchSettings('ladder', { labels: null });
      labelsDialog.close();
      build();
    });
    labelsCancelBtn.addEventListener('click', function () {
      labelsDialog.close();
    });
    labelsDialog.addEventListener('click', function (e) {
      if (e.target === labelsDialog) labelsDialog.close();
    });

    Store.subscribe(onDataChange);
    Theme.onChange(drawScene);
    window.addEventListener('resize', UI.debounce(function () {
      if (n >= 2) {
        layout();
      }
    }, 150));

    build();
  }

  /* 이름만 바뀐 경우(같은 id 순서)에는 게임을 유지하고 라벨만 갱신 */
  function onDataChange() {
    var list = Store.list();
    var sameIds =
      list.length === players.length &&
      list.every(function (p, i) {
        return p.id === players[i].id;
      });
    if (sameIds && n >= 2) {
      players = list;
      layout();
    } else {
      build();
    }
  }

  function effectiveWinners(count) {
    var s = Store.getSettings().ladder;
    return Math.min(Math.max(1, s.winners), Math.max(1, count - 1));
  }

  function changeWinners(dir) {
    if (n < 2) return;
    var s = Store.getSettings().ladder;
    var base = s.labels ? 1 : effectiveWinners(n);
    var next = Math.min(Math.max(1, base + dir), n - 1);
    Store.patchSettings('ladder', { winners: next, labels: null });
    build();
  }

  /* ---------------- 게임 생성 ---------------- */

  function build() {
    players = Store.list();
    n = players.length;
    anims = [];
    logged = false;

    var s = Store.getSettings().ladder;
    var custom = s.labels && s.labels.length === n ? s.labels.slice() : null;

    updateControls(custom);

    if (n < 2 || n > MAX_PLAYERS) {
      innerEl.hidden = true;
      noticeEl.hidden = false;
      noticeEl.textContent =
        n < 2
          ? '참가자를 2명 이상 추가하면 사다리가 만들어집니다.'
          : '사다리타기는 최대 ' + MAX_PLAYERS + '명까지 지원합니다. (현재 ' + n + '명)';
      hintEl.textContent = '';
      return;
    }
    innerEl.hidden = false;
    noticeEl.hidden = true;
    hintEl.textContent = '위쪽 이름을 클릭하면 그 사람의 경로가 공개됩니다.';

    /* 결과 문구 구성 후 셔플 */
    var labelSet;
    if (custom) {
      labelSet = custom;
    } else {
      var w = effectiveWinners(n);
      labelSet = [];
      for (var i = 0; i < n; i++) labelSet.push(i < w ? '당첨' : '꽝');
    }
    bottomLabels = shuffleArray(labelSet);

    /* 가로줄 생성 */
    H = Math.min(16, Math.max(10, n + 4));
    genRungs();

    /* 결과 사전 계산 */
    outcomes = [];
    for (var p = 0; p < n; p++) outcomes.push(trace(p));

    revealedPlayers = new Array(n).fill(false);
    revealedSlots = new Array(n).fill(false);

    layout();
  }

  function updateControls(custom) {
    var enabled = n >= 2 && n <= MAX_PLAYERS;
    stepperValue.textContent = custom ? '커스텀' : '당첨 ' + (enabled ? effectiveWinners(n) : 1) + '개';
    revealAllBtn.disabled = !enabled;
    rebuildBtn.disabled = !enabled;
    editLabelsBtn.disabled = !enabled;
  }

  function genRungs() {
    rungs = [];
    var r, i;
    for (r = 0; r < H; r++) {
      var row = new Array(n - 1).fill(false);
      for (i = 0; i < n - 1; i++) {
        if (i > 0 && row[i - 1]) continue; /* 같은 행 인접 금지 */
        row[i] = Math.random() < 0.35;
      }
      rungs.push(row);
    }
    /* 가로줄이 하나도 없는 레일 쌍에는 최소 1개 보장 */
    for (i = 0; i < n - 1; i++) {
      var has = false;
      for (r = 0; r < H; r++) {
        if (rungs[r][i]) {
          has = true;
          break;
        }
      }
      if (has) continue;
      var valid = [];
      for (r = 0; r < H; r++) {
        var leftOk = i === 0 || !rungs[r][i - 1];
        var rightOk = i === n - 2 || !rungs[r][i + 1];
        if (leftOk && rightOk) valid.push(r);
      }
      if (valid.length) {
        rungs[valid[Math.floor(Math.random() * valid.length)]][i] = true;
      }
    }
  }

  function trace(startCol) {
    var c = startCol;
    for (var r = 0; r < H; r++) {
      if (c > 0 && rungs[r][c - 1]) c -= 1;
      else if (c < n - 1 && rungs[r][c]) c += 1;
    }
    return c;
  }

  /* ---------------- 레이아웃 / DOM ---------------- */

  function colX(i) {
    return i * colW + colW / 2;
  }

  function rowY(r) {
    return PAD_Y + ROW_GAP * (r + 1);
  }

  function layout() {
    var avail = scrollEl.clientWidth || 600;
    colW = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.floor(avail / n)));
    var innerW = colW * n;
    canvasH = PAD_Y * 2 + ROW_GAP * (H + 1);

    innerEl.style.width = innerW + 'px';
    canvas.style.width = innerW + 'px';
    canvas.style.height = canvasH + 'px';

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerW * dpr);
    canvas.height = Math.round(canvasH * dpr);

    /* 리사이즈로 좌표가 바뀌면 진행 중 경로도 다시 계산 */
    anims.forEach(function (a) {
      a.pts = pathPoints(a.i);
      a.len = pathLength(a.pts);
    });

    buildRows();
    drawScene();
  }

  function buildRows() {
    topRow.innerHTML = '';
    bottomRow.innerHTML = '';

    players.forEach(function (p, i) {
      var cell = document.createElement('div');
      cell.className = 'ladder-cell';
      cell.style.width = colW + 'px';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ladder-name' + (revealedPlayers[i] ? ' done' : '');
      btn.style.setProperty('--accent', UI.wheelColorVar(i));
      btn.textContent = p.name;
      btn.title = p.name;
      btn.disabled = revealedPlayers[i];
      btn.addEventListener('click', function () {
        revealPlayer(i);
      });
      cell.appendChild(btn);
      topRow.appendChild(cell);
    });

    bottomLabels.forEach(function (label, slot) {
      var cell = document.createElement('div');
      cell.className = 'ladder-cell';
      cell.style.width = colW + 'px';

      var div = document.createElement('div');
      div.className = 'ladder-result';
      applySlotState(div, slot);
      cell.appendChild(div);
      bottomRow.appendChild(cell);
    });
  }

  function applySlotState(div, slot) {
    if (revealedSlots[slot]) {
      var label = bottomLabels[slot];
      div.textContent = label;
      div.title = label;
      div.classList.add('revealed');
      if (label === '당첨') div.classList.add('win');
    } else {
      div.textContent = '?';
      div.classList.remove('revealed', 'win');
    }
  }

  function refreshSlot(slot) {
    var div = bottomRow.children[slot] && bottomRow.children[slot].firstChild;
    if (div) applySlotState(div, slot);
  }

  function refreshName(i) {
    var btn = topRow.children[i] && topRow.children[i].firstChild;
    if (btn) {
      btn.classList.toggle('done', revealedPlayers[i]);
      btn.disabled = revealedPlayers[i];
    }
  }

  /* ---------------- 공개 ---------------- */

  function revealPlayer(i) {
    if (revealedPlayers[i] || isAnimating(i)) return;
    startAnim(i, null);
  }

  function revealAll() {
    var delay = 0;
    for (var i = 0; i < n; i++) {
      if (!revealedPlayers[i] && !isAnimating(i)) {
        startAnim(i, delay);
        delay += 90;
      }
    }
  }

  function isAnimating(i) {
    return anims.some(function (a) {
      return a.i === i;
    });
  }

  function startAnim(i, delay) {
    var pts = pathPoints(i);
    var len = pathLength(pts);
    var dur = UI.reducedMotion() ? 1 : Math.min(1600, Math.max(600, len / 0.55));
    anims.push({ i: i, pts: pts, len: len, dur: dur, t0: performance.now() + (delay || 0) });
    ensureRaf();
  }

  function finishAnim(a) {
    revealedPlayers[a.i] = true;
    revealedSlots[outcomes[a.i]] = true;
    refreshName(a.i);
    refreshSlot(outcomes[a.i]);
    maybeLog();
  }

  function maybeLog() {
    if (logged) return;
    if (!revealedPlayers.every(Boolean)) return;
    logged = true;

    var isAuto = bottomLabels.every(function (l) {
      return l === '당첨' || l === '꽝';
    });
    var text;
    if (isAuto) {
      var winners = [];
      players.forEach(function (p, i) {
        if (bottomLabels[outcomes[i]] === '당첨') winners.push(p.name);
      });
      text = '당첨: ' + (winners.length ? winners.join(', ') : '없음');
    } else {
      var pairs = players.map(function (p, i) {
        return p.name + '→' + bottomLabels[outcomes[i]];
      });
      text = pairs.slice(0, 3).join(', ');
      if (pairs.length > 3) text += ' 외 ' + (pairs.length - 3) + '명';
    }
    Store.logHistory('ladder', text);
  }

  /* ---------------- 경로 계산 ---------------- */

  function pathPoints(startCol) {
    var pts = [{ x: colX(startCol), y: 4 }];
    var c = startCol;
    for (var r = 0; r < H; r++) {
      var y = rowY(r);
      if (c > 0 && rungs[r][c - 1]) {
        pts.push({ x: colX(c), y: y });
        c -= 1;
        pts.push({ x: colX(c), y: y });
      } else if (c < n - 1 && rungs[r][c]) {
        pts.push({ x: colX(c), y: y });
        c += 1;
        pts.push({ x: colX(c), y: y });
      }
    }
    pts.push({ x: colX(c), y: canvasH - 4 });
    return pts;
  }

  function pathLength(pts) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    }
    return len;
  }

  /* ---------------- 그리기 ---------------- */

  function drawScene(now) {
    now = typeof now === 'number' ? now : performance.now();
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (n < 2) return;

    var railColor = UI.cssVar('--rail');
    ctx.lineCap = 'round';

    /* 레일 */
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 3;
    for (var i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(colX(i), 6);
      ctx.lineTo(colX(i), canvasH - 6);
      ctx.stroke();
    }
    /* 가로줄 */
    for (var r = 0; r < H; r++) {
      for (var g = 0; g < n - 1; g++) {
        if (!rungs[r][g]) continue;
        ctx.beginPath();
        ctx.moveTo(colX(g), rowY(r));
        ctx.lineTo(colX(g + 1), rowY(r));
        ctx.stroke();
      }
    }

    /* 완료된 경로 (흐리게) */
    for (var p = 0; p < n; p++) {
      if (!revealedPlayers[p]) continue;
      ctx.globalAlpha = 0.45;
      strokePath(pathPoints(p), UI.wheelColor(p), 4, 1);
      ctx.globalAlpha = 1;
    }

    /* 진행 중 애니메이션 */
    var active = false;
    for (var a = anims.length - 1; a >= 0; a--) {
      var anim = anims[a];
      var t = (now - anim.t0) / anim.dur;
      if (t < 0) {
        active = true;
        continue;
      }
      if (t >= 1) {
        anims.splice(a, 1);
        finishAnim(anim);
        strokePath(anim.pts, UI.wheelColor(anim.i), 4, 1);
        continue;
      }
      active = true;
      strokePath(anim.pts, UI.wheelColor(anim.i), 4.5, t, true);
    }

    if (active) ensureRaf();
  }

  function ensureRaf() {
    if (rafActive) return;
    rafActive = true;
    requestAnimationFrame(function (ts) {
      rafActive = false;
      drawScene(ts);
    });
  }

  function strokePath(pts, color, width, progress, withHead) {
    var total = pathLength(pts);
    var target = total * Math.min(1, progress);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    var drawn = 0;
    var headX = pts[0].x, headY = pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      var seg = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      if (drawn + seg <= target) {
        ctx.lineTo(pts[i].x, pts[i].y);
        headX = pts[i].x;
        headY = pts[i].y;
        drawn += seg;
      } else {
        var remain = target - drawn;
        var f = seg === 0 ? 0 : remain / seg;
        headX = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f;
        headY = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f;
        ctx.lineTo(headX, headY);
        break;
      }
    }
    ctx.stroke();
    if (withHead) {
      ctx.beginPath();
      ctx.arc(headX, headY, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /* ---------------- 결과 문구 편집 ---------------- */

  function openLabelsDialog() {
    if (n < 2) return;
    labelsInputs.innerHTML = '';

    var s = Store.getSettings().ladder;
    var current;
    if (s.labels && s.labels.length === n) {
      current = s.labels.slice();
    } else {
      var w = effectiveWinners(n);
      current = [];
      for (var i = 0; i < n; i++) current.push(i < w ? '당첨' : '꽝');
    }

    current.forEach(function (label) {
      var input = document.createElement('input');
      input.className = 'input';
      input.type = 'text';
      input.maxLength = 30;
      input.value = label;
      input.placeholder = '꽝';
      labelsInputs.appendChild(input);
    });

    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = '저장하면 문구가 무작위로 섞인 새 사다리가 만들어집니다.';
    labelsInputs.appendChild(note);

    labelsDialog.showModal();
  }

  function saveLabels() {
    var values = Array.prototype.map.call(
      labelsInputs.querySelectorAll('input'),
      function (input) {
        return input.value.trim() || '꽝';
      }
    );
    Store.patchSettings('ladder', { labels: values });
    labelsDialog.close();
    build();
  }

  /* ---------------- 유틸 ---------------- */

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
})();
