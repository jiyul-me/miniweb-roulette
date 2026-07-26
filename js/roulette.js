/* 돌림판 — 가중치 비례 부채꼴, 당첨자를 먼저 뽑고 그 위치로 회전 */
(function () {
  'use strict';

  var canvas, ctx, spinBtn, hintEl, dialog, winnerNameEl, removeBtn, closeBtn;

  var currentRot = 0;      /* 현재 회전 각도(deg), 0~360 정규화 유지 */
  var spinning = false;
  var pendingRedraw = false;
  var lastWinner = null;
  var segments = [];       /* 화면에 그려진 세그먼트 스냅샷 */

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    canvas = document.getElementById('wheelCanvas');
    ctx = canvas.getContext('2d');
    spinBtn = document.getElementById('spinBtn');
    hintEl = document.getElementById('wheelHint');
    dialog = document.getElementById('winnerDialog');
    winnerNameEl = document.getElementById('winnerName');
    removeBtn = document.getElementById('removeRespinBtn');
    closeBtn = document.getElementById('closeWinnerBtn');

    UI.mountEntryPanel(document.getElementById('entryPanel'), { showWeights: true });
    UI.mountHistoryPanel(document.getElementById('historyPanel'));

    Store.subscribe(onDataChange);
    Theme.onChange(function () {
      if (!spinning) draw();
      else pendingRedraw = true;
    });
    window.addEventListener('resize', UI.debounce(function () {
      if (!spinning) draw();
    }, 150));

    spinBtn.addEventListener('click', spin);
    canvas.addEventListener('click', spin);
    removeBtn.addEventListener('click', onRemoveRespin);
    closeBtn.addEventListener('click', function () {
      dialog.close();
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    draw();
    updateControls();
  }

  function onDataChange() {
    if (spinning) {
      pendingRedraw = true;
    } else {
      draw();
    }
    updateControls();
  }

  function updateControls() {
    var n = Store.count();
    spinBtn.disabled = spinning || n < 2;
    if (n < 2) {
      hintEl.textContent = '참가자를 2명 이상 추가하면 돌릴 수 있어요.';
    } else {
      hintEl.textContent = '휠을 탭해도 돌아갑니다.';
    }
  }

  /* ---------------- 세그먼트 계산 ---------------- */

  /* start/arc는 12시 방향 기준 시계방향 각도(deg) */
  function buildSegments(entries) {
    var total = 0;
    entries.forEach(function (e) {
      total += e.weight;
    });
    var segs = [];
    var acc = 0;
    entries.forEach(function (e, i) {
      var arc = (e.weight / total) * 360;
      segs.push({ entry: e, start: acc, arc: arc, colorIdx: i % 8 });
      acc += arc;
    });
    /* 참가자 수가 8의 배수+1이면 첫/마지막 조각 색이 이어져 보이므로 마지막만 교체 */
    if (segs.length > 8 && segs[segs.length - 1].colorIdx === segs[0].colorIdx) {
      segs[segs.length - 1].colorIdx = 3;
    }
    return segs;
  }

  /* ---------------- 그리기 ---------------- */

  function draw() {
    var entries = Store.list();
    var size = canvas.offsetWidth;
    if (!size) return;

    var dpr = window.devicePixelRatio || 1;
    var px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    var c = size / 2;
    var radius = c - 6;

    if (entries.length === 0) {
      resetRotation();
      segments = [];
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fillStyle = UI.cssVar('--surface-2');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = UI.cssVar('--border');
      ctx.stroke();
      ctx.fillStyle = UI.cssVar('--text-muted');
      ctx.font = '600 15px ' + fontStack();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('참가자를 추가하세요', c, c);
      return;
    }

    if (entries.length === 1) {
      resetRotation();
    }

    segments = buildSegments(entries);

    segments.forEach(function (seg) {
      var a0 = deg2rad(seg.start - 90);
      var a1 = deg2rad(seg.start + seg.arc - 90);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = UI.wheelColor(seg.colorIdx);
      ctx.fill();
    });

    /* 조각 라벨 — 반지름 방향으로 배치 (1명이면 수평으로) */
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (segments.length === 1) {
      ctx.font = '700 18px ' + fontStack();
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(truncateText(segments[0].entry.name, radius * 1.1), c, c - radius * 0.55);
      ctx.shadowBlur = 0;
    }
    segments.forEach(function (seg) {
      if (segments.length === 1) return;
      if (seg.arc < 4) return; /* 너무 얇으면 생략 */
      var fontPx = Math.max(9, Math.min(18, seg.arc * 0.5));
      ctx.font = '700 ' + fontPx + 'px ' + fontStack();
      var text = truncateText(seg.entry.name, radius * 0.52);
      var midDeg = seg.start + seg.arc / 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(deg2rad(midDeg - 90));
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      if (midDeg > 180) {
        /* 왼쪽 반원은 180° 뒤집어 글자가 똑바로 읽히게 */
        ctx.rotate(Math.PI);
        ctx.textAlign = 'left';
        ctx.fillText(text, -(radius - 14), 0);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(text, radius - 14, 0);
      }
      ctx.restore();
    });

    /* 중앙 허브 */
    ctx.beginPath();
    ctx.arc(c, c, 52, 0, Math.PI * 2);
    ctx.fillStyle = UI.cssVar('--surface');
    ctx.fill();

    /* 바깥 테두리 */
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.cssVar('--border');
    ctx.stroke();

    if (entries.length === 1) {
      ctx.fillStyle = UI.cssVar('--text-muted');
      ctx.font = '600 14px ' + fontStack();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('1명 더 필요해요', c, c + radius * 0.55);
    }
  }

  function fontStack() {
    return 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
  }

  function truncateText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  function deg2rad(d) {
    return (d * Math.PI) / 180;
  }

  function resetRotation() {
    currentRot = 0;
    canvas.style.transform = 'rotate(0deg)';
  }

  /* ---------------- 스핀 ---------------- */

  function spin() {
    if (spinning || segments.length < 2) return;
    spinning = true;
    updateControls();

    /* 1) 가중치 누적합으로 당첨자 선정 */
    var total = 0;
    segments.forEach(function (s) {
      total += s.entry.weight;
    });
    var r = Math.random() * total;
    var acc = 0;
    var winnerSeg = segments[segments.length - 1];
    for (var i = 0; i < segments.length; i++) {
      acc += segments[i].entry.weight;
      if (r < acc) {
        winnerSeg = segments[i];
        break;
      }
    }

    /* 2) 당첨 조각 내부의 목표 지점(가장자리 10% 제외)으로 회전량 계산 */
    var target = winnerSeg.start + winnerSeg.arc * (0.1 + 0.8 * Math.random());
    var desiredMod = (360 - target) % 360;
    var curMod = ((currentRot % 360) + 360) % 360;
    var delta = (desiredMod - curMod + 360) % 360;

    var reduced = UI.reducedMotion();
    var turns = reduced ? 1 : 4 + Math.floor(Math.random() * 3);
    var duration = reduced ? 700 : 4200 + Math.random() * 600;
    var startRot = curMod;
    var totalDelta = turns * 360 + delta;
    var t0 = performance.now();

    function frame(now) {
      var p = Math.min(1, (now - t0) / duration);
      var eased = 1 - Math.pow(1 - p, 4);
      var rot = startRot + totalDelta * eased;
      canvas.style.transform = 'rotate(' + rot + 'deg)';
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        currentRot = ((startRot + totalDelta) % 360 + 360) % 360;
        canvas.style.transform = 'rotate(' + currentRot + 'deg)';
        spinning = false;
        if (pendingRedraw) {
          pendingRedraw = false;
          draw();
        }
        updateControls();
        showWinner(winnerSeg.entry);
      }
    }
    requestAnimationFrame(frame);
  }

  function showWinner(entry) {
    lastWinner = entry;
    winnerNameEl.textContent = entry.name;
    Store.logHistory('roulette', '당첨: ' + entry.name);
    dialog.showModal();
  }

  function onRemoveRespin() {
    if (!lastWinner) return;
    Store.remove(lastWinner.id);
    lastWinner = null;
    dialog.close();
    var remain = Store.list();
    if (remain.length >= 2) {
      setTimeout(spin, 350);
    } else if (remain.length === 1) {
      UI.toast('마지막 참가자: ' + remain[0].name);
    }
  }
})();
