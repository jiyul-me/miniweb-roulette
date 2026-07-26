/* 제비뽑기 — 참가자 수만큼 카드, 순서대로 한 장씩 뒤집기 */
(function () {
  'use strict';

  var grid, banner, noticeEl, hintEl, redealBtn;
  var stepperMinus, stepperPlus, stepperValueEl;
  var resultDialog, resultText, againBtn, closeBtn;

  /* 게임 상태 (deal 시점 스냅샷) */
  var names = [];
  var n = 0;
  var faces = [];       /* 'win' | 'lose' */
  var flippedBy = [];   /* 카드별로 뽑은 사람 이름 */
  var flippedCount = 0;
  var gameOver = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    grid = document.getElementById('cardsGrid');
    banner = document.getElementById('turnBanner');
    noticeEl = document.getElementById('lotsNotice');
    hintEl = document.getElementById('lotsHint');
    redealBtn = document.getElementById('redealBtn');
    stepperValueEl = document.getElementById('lotsWinnerValue');
    resultDialog = document.getElementById('lotsResultDialog');
    resultText = document.getElementById('lotsResultText');
    againBtn = document.getElementById('lotsAgainBtn');
    closeBtn = document.getElementById('lotsCloseBtn');

    var stepper = document.getElementById('lotsWinnerStepper');
    stepperMinus = stepper.querySelector('[data-act="minus"]');
    stepperPlus = stepper.querySelector('[data-act="plus"]');
    stepperMinus.addEventListener('click', function () {
      changeWinners(-1);
    });
    stepperPlus.addEventListener('click', function () {
      changeWinners(1);
    });

    redealBtn.addEventListener('click', deal);
    againBtn.addEventListener('click', function () {
      resultDialog.close();
      deal();
    });
    closeBtn.addEventListener('click', function () {
      resultDialog.close();
    });
    resultDialog.addEventListener('click', function (e) {
      if (e.target === resultDialog) resultDialog.close();
    });

    UI.mountEntryPanel(document.getElementById('entryPanel'), { collapsible: true });
    UI.mountHistoryPanel(document.getElementById('historyPanel'));

    Store.subscribe(function () {
      /* 아직 아무도 안 뽑았으면 새 명단으로 즉시 재배치, 진행 중이면 다음 판부터 반영 */
      if (flippedCount === 0 || gameOver) deal();
    });

    deal();
  }

  function winnersCount() {
    var s = Store.getSettings().lots;
    return Math.min(Math.max(1, s.winners), Math.max(1, n - 1));
  }

  function changeWinners(dir) {
    if (n < 2 || (flippedCount > 0 && !gameOver)) return;
    var next = Math.min(Math.max(1, winnersCount() + dir), n - 1);
    Store.patchSettings('lots', { winners: next });
    deal();
  }

  /* ---------------- 배치 ---------------- */

  function deal() {
    var list = Store.list();
    names = list.map(function (p) {
      return p.name;
    });
    n = names.length;
    flippedBy = new Array(n).fill(null);
    flippedCount = 0;
    gameOver = false;

    if (n < 2) {
      grid.hidden = true;
      banner.hidden = true;
      noticeEl.hidden = false;
      noticeEl.textContent = '참가자를 2명 이상 추가하면 제비가 만들어집니다.';
      hintEl.textContent = '';
      redealBtn.disabled = true;
      updateStepper();
      return;
    }

    grid.hidden = false;
    banner.hidden = false;
    noticeEl.hidden = true;
    redealBtn.disabled = false;
    hintEl.textContent = '자기 차례에 카드를 한 장 골라 탭하세요. 카드 내용은 매판 무작위로 섞입니다.';

    var m = winnersCount();
    faces = [];
    for (var i = 0; i < n; i++) faces.push(i < m ? 'win' : 'lose');
    shuffleInPlace(faces);

    renderCards();
    updateBanner();
    updateStepper();
  }

  function renderCards() {
    grid.innerHTML = '';
    faces.forEach(function (face, idx) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'lot-card dealing';
      card.style.setProperty('--i', idx);
      card.setAttribute('aria-label', '제비 ' + (idx + 1) + '번');

      var inner = document.createElement('div');
      inner.className = 'lot-inner';

      var front = document.createElement('div');
      front.className = 'lot-face lot-front';
      front.textContent = '?';

      var back = document.createElement('div');
      back.className = 'lot-face lot-back' + (face === 'win' ? ' win' : '');

      var label = document.createElement('span');
      label.textContent = face === 'win' ? '당첨' : '꽝';
      back.appendChild(label);

      var owner = document.createElement('span');
      owner.className = 'lot-owner';
      back.appendChild(owner);

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);
      card.addEventListener('click', function () {
        flip(idx, card);
      });
      grid.appendChild(card);
    });
  }

  function flip(idx, card) {
    if (gameOver || flippedBy[idx] !== null || flippedCount >= n) return;

    var currentName = names[flippedCount];
    flippedBy[idx] = currentName;
    card.classList.remove('dealing');
    card.classList.add('flipped');
    card.disabled = true;
    card.querySelector('.lot-owner').textContent = currentName;

    flippedCount += 1;
    updateStepper();

    if (flippedCount >= n) {
      gameOver = true;
      updateBanner();
      setTimeout(finishGame, 700);
    } else {
      updateBanner();
    }
  }

  function finishGame() {
    var winners = [];
    faces.forEach(function (face, idx) {
      if (face === 'win' && flippedBy[idx]) winners.push(flippedBy[idx]);
    });
    var text = '당첨: ' + (winners.length ? winners.join(', ') : '없음');
    resultText.textContent = text;
    Store.logHistory('lots', text);
    resultDialog.showModal();
  }

  function updateBanner() {
    banner.innerHTML = '';
    if (gameOver) {
      banner.appendChild(document.createTextNode('추첨 완료! 다시 하기를 누르면 새 판이 시작됩니다.'));
      return;
    }
    var dot = document.createElement('span');
    dot.className = 'entry-dot';
    dot.style.setProperty('--dot', UI.wheelColorVar(flippedCount));
    banner.appendChild(dot);
    var strong = document.createElement('strong');
    strong.textContent = names[flippedCount];
    banner.appendChild(strong);
    banner.appendChild(document.createTextNode(' 차례입니다 (' + (flippedCount + 1) + '/' + n + ')'));
  }

  function updateStepper() {
    var locked = flippedCount > 0 && !gameOver;
    var m = n >= 2 ? winnersCount() : 1;
    stepperValueEl.textContent = '당첨 ' + m + '개';
    stepperMinus.disabled = n < 2 || locked || m <= 1;
    stepperPlus.disabled = n < 2 || locked || m >= n - 1;
  }

  function shuffleInPlace(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  }
})();
