/* 공유 UI — 참가자 패널, 기록 패널, 토스트, 헬퍼 */
(function () {
  'use strict';

  var TOOL_LABELS = { roulette: '돌림판', ladder: '사다리', lots: '제비' };

  /* ---------------- 헬퍼 ---------------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function wheelColorVar(i) {
    return 'var(--wheel-' + ((i % 8) + 1) + ')';
  }

  function wheelColor(i) {
    return cssVar('--wheel-' + ((i % 8) + 1));
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function absTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function relTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60 * 1000) return '방금';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '분 전';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '시간 전';
    return absTime(ts);
  }

  /* ---------------- 토스트 ---------------- */

  var toastEl = null;
  var toastTimer = null;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2500);
  }

  /* ---------------- 참가자 패널 ---------------- */

  function mountEntryPanel(container, opts) {
    opts = opts || {};
    var showWeights = !!opts.showWeights;
    var collapsible = !!opts.collapsible;

    var listEl, badgeEls = [], detailsEl = null;

    if (collapsible) {
      var details = document.createElement('details');
      detailsEl = details;
      details.className = 'card';
      if (Store.count() === 0) details.open = true;
      details.innerHTML =
        '<summary>참가자 <span class="count-badge"></span></summary>' +
        '<div class="details-body">' +
        '  <div class="head-actions" style="margin-bottom: var(--space-3);">' +
        '    <button type="button" class="btn btn-ghost btn-sm" data-act="shuffle">섞기</button>' +
        '    <button type="button" class="btn btn-ghost btn-sm danger" data-act="clear">전체 삭제</button>' +
        '  </div>' +
        panelBodyHtml() +
        '</div>';
      container.appendChild(details);
      badgeEls.push(details.querySelector('.count-badge'));
      wireBody(details);
    } else {
      var section = document.createElement('section');
      section.className = 'card';
      section.innerHTML =
        '<div class="card-head">' +
        '  <h2>참가자 <span class="count-badge"></span></h2>' +
        '  <div class="head-actions">' +
        '    <button type="button" class="btn btn-ghost btn-sm" data-act="shuffle">섞기</button>' +
        '    <button type="button" class="btn btn-ghost btn-sm danger" data-act="clear">전체 삭제</button>' +
        '  </div>' +
        '</div>' +
        panelBodyHtml();
      container.appendChild(section);
      badgeEls.push(section.querySelector('.count-badge'));
      wireBody(section);
    }

    function panelBodyHtml() {
      return (
        '<form class="add-row">' +
        '  <input class="input" type="text" maxlength="' + Store.LIMITS.nameLength + '" placeholder="이름 입력 후 Enter" aria-label="참가자 이름">' +
        '  <button type="submit" class="btn btn-primary">추가</button>' +
        '</form>' +
        '<ul class="entry-list"></ul>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="bulk-toggle">여러 명 붙여넣기</button>' +
        '<div class="bulk-panel" hidden>' +
        '  <textarea class="input" rows="5" placeholder="한 줄에 한 명씩 입력하세요"></textarea>' +
        '  <div class="bulk-actions">' +
        '    <button type="button" class="btn btn-ghost btn-sm" data-act="bulk-append">추가하기</button>' +
        '    <button type="button" class="btn btn-primary btn-sm" data-act="bulk-replace">전체 교체</button>' +
        '  </div>' +
        '</div>' +
        (showWeights ? '<p class="hint">가중치(×N)는 돌림판 당첨 확률에만 적용됩니다.</p>' : '')
      );
    }

    function wireBody(root) {
      listEl = root.querySelector('.entry-list');

      var form = root.querySelector('.add-row');
      var addInput = form.querySelector('input');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = addInput.value.trim();
        if (!name) return;
        if (Store.count() >= Store.LIMITS.participants) {
          toast('참가자는 최대 ' + Store.LIMITS.participants + '명까지 가능합니다.');
          return;
        }
        Store.add(name);
        addInput.value = '';
        addInput.focus();
      });

      root.querySelector('[data-act="shuffle"]').addEventListener('click', function () {
        if (Store.count() < 2) return;
        Store.shuffle();
        toast('순서를 섞었습니다.');
      });

      root.querySelector('[data-act="clear"]').addEventListener('click', function () {
        if (Store.count() === 0) return;
        if (confirm('참가자를 모두 삭제할까요?')) Store.clear();
      });

      var bulkPanel = root.querySelector('.bulk-panel');
      var bulkText = bulkPanel.querySelector('textarea');
      root.querySelector('[data-act="bulk-toggle"]').addEventListener('click', function () {
        bulkPanel.hidden = !bulkPanel.hidden;
        if (!bulkPanel.hidden) bulkText.focus();
      });

      function runBulk(replace) {
        if (!bulkText.value.trim()) {
          toast('추가할 이름을 입력해주세요.');
          return;
        }
        if (replace && Store.count() > 0 && !confirm('기존 참가자를 지우고 붙여넣은 내용으로 교체할까요?')) return;
        var r = Store.addBulk(bulkText.value, replace);
        var msg = r.added + '명 ' + (replace ? '교체' : '추가') + '되었습니다.';
        if (r.truncated > 0) msg += ' (최대 인원 제한으로 ' + r.truncated + '명 제외)';
        toast(msg);
        if (r.added > 0) bulkText.value = '';
      }
      root.querySelector('[data-act="bulk-append"]').addEventListener('click', function () { runBulk(false); });
      root.querySelector('[data-act="bulk-replace"]').addEventListener('click', function () { runBulk(true); });
    }

    function buildRow(p, idx) {
      var li = document.createElement('li');
      li.className = 'entry-row';
      li.dataset.id = p.id;

      var dot = document.createElement('span');
      dot.className = 'entry-dot';
      dot.style.setProperty('--dot', wheelColorVar(idx));
      li.appendChild(dot);

      var nameInput = document.createElement('input');
      nameInput.className = 'entry-name';
      nameInput.type = 'text';
      nameInput.maxLength = Store.LIMITS.nameLength;
      nameInput.value = p.name;
      nameInput.setAttribute('aria-label', '참가자 이름 수정');
      var commit = debounce(function () {
        if (nameInput.value.trim()) Store.update(p.id, { name: nameInput.value });
      }, 250);
      nameInput.addEventListener('input', commit);
      nameInput.addEventListener('blur', function () {
        if (!nameInput.value.trim()) renderList();
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') nameInput.blur();
      });
      li.appendChild(nameInput);

      if (showWeights) {
        var stepper = document.createElement('div');
        stepper.className = 'stepper';
        var minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = '−';
        minus.disabled = p.weight <= 1;
        minus.setAttribute('aria-label', '가중치 낮추기');
        var val = document.createElement('span');
        val.className = 'stepper-value';
        val.textContent = '×' + p.weight;
        var plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = '+';
        plus.disabled = p.weight >= Store.LIMITS.weight;
        plus.setAttribute('aria-label', '가중치 높이기');
        minus.addEventListener('click', function () {
          Store.update(p.id, { weight: p.weight - 1 });
        });
        plus.addEventListener('click', function () {
          Store.update(p.id, { weight: p.weight + 1 });
        });
        stepper.appendChild(minus);
        stepper.appendChild(val);
        stepper.appendChild(plus);
        li.appendChild(stepper);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'entry-del';
      del.textContent = '×';
      del.setAttribute('aria-label', p.name + ' 삭제');
      del.addEventListener('click', function () {
        Store.remove(p.id);
      });
      li.appendChild(del);

      return li;
    }

    function renderList() {
      var list = Store.list();

      badgeEls.forEach(function (b) {
        b.textContent = list.length;
      });

      /* 명단이 비면 접힌 패널을 펼쳐 바로 입력할 수 있게 */
      if (detailsEl && list.length === 0) detailsEl.open = true;

      /* 이름 입력 중 재렌더링되면 포커스·커서 위치를 복원한다 */
      var focused = document.activeElement;
      var focusId = null, selStart = 0, selEnd = 0;
      if (focused && focused.classList && focused.classList.contains('entry-name') && listEl.contains(focused)) {
        focusId = focused.closest('.entry-row').dataset.id;
        selStart = focused.selectionStart;
        selEnd = focused.selectionEnd;
      }

      listEl.innerHTML = '';
      if (list.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'entry-empty';
        empty.textContent = '아직 참가자가 없습니다. 이름을 추가해보세요.';
        listEl.appendChild(empty);
      } else {
        list.forEach(function (p, idx) {
          listEl.appendChild(buildRow(p, idx));
        });
      }

      if (focusId) {
        var again = listEl.querySelector('.entry-row[data-id="' + focusId + '"] .entry-name');
        if (again) {
          again.focus();
          try {
            again.setSelectionRange(selStart, selEnd);
          } catch (e) { /* 브라우저별 예외 무시 */ }
        }
      }
    }

    Store.subscribe(renderList);
    renderList();
  }

  /* ---------------- 기록 패널 ---------------- */

  function mountHistoryPanel(container) {
    var details = document.createElement('details');
    details.className = 'card';
    details.innerHTML =
      '<summary>추첨 기록 <span class="count-badge"></span></summary>' +
      '<div class="details-body">' +
      '  <ul class="history-list"></ul>' +
      '  <div class="history-clear-row">' +
      '    <button type="button" class="btn btn-ghost btn-sm danger" data-act="history-clear">기록 지우기</button>' +
      '  </div>' +
      '</div>';
    container.appendChild(details);

    var badge = details.querySelector('.count-badge');
    var listEl = details.querySelector('.history-list');
    var clearBtn = details.querySelector('[data-act="history-clear"]');

    clearBtn.addEventListener('click', function () {
      if (Store.history().length === 0) return;
      if (confirm('추첨 기록을 모두 지울까요?')) Store.clearHistory();
    });

    function render() {
      var items = Store.history();
      badge.textContent = items.length;
      listEl.innerHTML = '';
      clearBtn.disabled = items.length === 0;

      if (items.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'history-empty';
        empty.textContent = '아직 기록이 없습니다.';
        listEl.appendChild(empty);
        return;
      }

      items.forEach(function (h) {
        var li = document.createElement('li');
        li.className = 'history-row';

        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = TOOL_LABELS[h.tool] || h.tool;
        li.appendChild(chip);

        var text = document.createElement('span');
        text.className = 'history-text';
        text.textContent = h.text;
        text.title = h.text;
        li.appendChild(text);

        var time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = relTime(h.ts);
        time.title = absTime(h.ts);
        li.appendChild(time);

        listEl.appendChild(li);
      });
    }

    Store.subscribeHistory(render);
    render();
  }

  /* ---------------- 초기화 ---------------- */

  document.addEventListener('DOMContentLoaded', function () {
    if (!Store.ok()) {
      toast('저장이 지원되지 않는 환경입니다. 새로고침하면 내용이 사라져요.');
    }
  });

  window.UI = {
    cssVar: cssVar,
    wheelColor: wheelColor,
    wheelColorVar: wheelColorVar,
    debounce: debounce,
    reducedMotion: reducedMotion,
    toast: toast,
    relTime: relTime,
    mountEntryPanel: mountEntryPanel,
    mountHistoryPanel: mountHistoryPanel
  };
})();
