/**
 * Continuum — Auto-Inject (Cycle 5 D3)
 * Location: extension/content/autoInject.js
 *
 * Watches the page's composer (textarea / contenteditable), debounces the
 * user's draft, asks the daemon's /assemble endpoint for a budget-trimmed
 * context block, and — when the response has any context — surfaces a
 * floating chip the user can ACCEPT (insert) or DISMISS.
 *
 * Acceptance is logged via /feedback so the Cycle 5 KPI (auto-inject
 * acceptance rate) is measurable from day one.
 *
 * Per-site shim: a site's content script supplies a `composerSelectors`
 * array and a `sourceTag` (e.g. "chatgpt"). This file does not assume DOM
 * specifics so we can extend to Perplexity / Claude.ai later.
 */

(function () {
  if (window.__continuumAutoInject) return; // idempotent across re-injections

  // -------- tunables -------- //
  const DEBOUNCE_MS = 1200;
  const MIN_DRAFT_CHARS = 8;
  const QUERY_COOLDOWN_MS = 30_000;     // don't re-pop the chip for the same draft
  const CONFIDENCE_FLOOR = 0;            // Q1 = 0 — always offer when context exists
  const TOKEN_BUDGET = 600;
  const CHIP_ID = 'continuum-autoinject-chip';
  const INSERTED_MARKER = '<!-- continuum:auto-inject -->';

  // -------- per-tab state -------- //
  const state = {
    enabled: true,
    lastSeenDraft: '',
    lastDecisionAt: 0,
    pendingRecallId: null,
    pendingMemoryId: null,
    submitListenerAttached: false,
  };

  // ============================================================ //
  // Public init — called by per-site content scripts.
  //   opts: { composerSelectors: string[], sourceTag: string }
  // ============================================================ //
  function initAutoInject(opts) {
    const composerSelectors = (opts && opts.composerSelectors) || [];
    const sourceTag = (opts && opts.sourceTag) || 'unknown';

    if (!composerSelectors.length) {
      console.warn('[continuum] autoInject: no composerSelectors given');
      return;
    }

    let composerEl = null;
    let debounceTimer = null;

    const handleInput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => evaluate(composerEl, sourceTag), DEBOUNCE_MS);
    };

    // Composer can be ripped out & re-rendered by SPA — keep finding it.
    function bindToCurrentComposer() {
      const el = findFirst(composerSelectors);
      if (!el || el === composerEl) return;
      if (composerEl) detach(composerEl, handleInput);
      composerEl = el;
      attach(composerEl, handleInput);
      attachSubmitListener(composerEl);
    }

    bindToCurrentComposer();
    const mo = new MutationObserver(() => bindToCurrentComposer());
    mo.observe(document.body, { childList: true, subtree: true });

    console.log(`[continuum] autoInject armed for ${sourceTag}`);
  }

  function findFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function attach(el, handler) {
    el.addEventListener('input', handler, { passive: true });
    el.addEventListener('keyup', handler, { passive: true });
  }
  function detach(el, handler) {
    el.removeEventListener('input', handler);
    el.removeEventListener('keyup', handler);
  }

  // ============================================================ //
  // Read the draft (works for <textarea> and contenteditable).
  // ============================================================ //
  function readDraft(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value || '';
    }
    if (el.isContentEditable || el.contentEditable === 'true') {
      return el.innerText || '';
    }
    return el.textContent || '';
  }

  // ============================================================ //
  // The decision: debounced, gated by floor + cooldown.
  // ============================================================ //
  function evaluate(el, sourceTag) {
    if (!state.enabled) return;
    const draft = readDraft(el).trim();

    if (draft.length < MIN_DRAFT_CHARS) {
      removeChip();
      return;
    }
    if (draft === state.lastSeenDraft) return;
    state.lastSeenDraft = draft;

    if (Date.now() - state.lastDecisionAt < QUERY_COOLDOWN_MS) return;

    chrome.runtime.sendMessage(
      {
        type: 'ASSEMBLE_CONTEXT',
        data: { query: draft, token_budget: TOKEN_BUDGET },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          // service worker bounced — log and bail
          console.debug('[continuum] runtime error:', chrome.runtime.lastError.message);
          return;
        }
        if (!response || !response.success) return;
        const payload = response.data || {};
        if (!payload.context) return;
        if ((payload.confidence ?? 0) < CONFIDENCE_FLOOR) return;
        showChip(payload, el, sourceTag);
      }
    );
  }

  // ============================================================ //
  // Chip UI — non-intrusive bottom-right floating card.
  // ============================================================ //
  function showChip(payload, composerEl, sourceTag) {
    removeChip();
    const chip = document.createElement('div');
    chip.id = CHIP_ID;
    chip.style.cssText = `
      position: fixed;
      right: 360px;
      bottom: 24px;
      max-width: 380px;
      background: linear-gradient(135deg, #ffffff 0%, #f7f5ff 100%);
      border: 1px solid #d6cef5;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.25);
      padding: 12px 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12.5px;
      color: #2a2a2a;
      z-index: 99998;
      animation: continuumFadeIn 180ms ease-out;
    `;

    const headerEl = document.createElement('div');
    headerEl.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-weight: 600;
      color: #4c3aa8;
    `;
    const stats = payload.stats || {};
    headerEl.innerHTML = `
      <span>💡 Continuum found relevant context</span>
      <span style="font-weight:500; font-size:11px; color:#777;">
        conf ${(payload.confidence ?? 0).toFixed(2)} · ${stats.included || 0}/${stats.candidates || 0}
      </span>
    `;

    const previewEl = document.createElement('div');
    previewEl.style.cssText = `
      max-height: 72px;
      overflow: hidden;
      color: #444;
      line-height: 1.4;
      white-space: pre-wrap;
      border-left: 3px solid #b6a8ee;
      padding-left: 8px;
      margin: 6px 0 10px;
    `;
    const previewText = (payload.context || '').slice(0, 220);
    previewEl.textContent = previewText + (payload.context.length > 220 ? ' …' : '');

    const actionsEl = document.createElement('div');
    actionsEl.style.cssText = `display:flex; gap:8px; justify-content:flex-end;`;

    const insertBtn = makeBtn('Insert', '#5c4fd1', '#fff');
    const dismissBtn = makeBtn('Dismiss', '#eee', '#444');

    insertBtn.onclick = () => acceptChip(payload, composerEl, sourceTag);
    dismissBtn.onclick = () => {
      state.lastDecisionAt = Date.now();
      removeChip();
    };

    actionsEl.appendChild(dismissBtn);
    actionsEl.appendChild(insertBtn);

    chip.appendChild(headerEl);
    chip.appendChild(previewEl);
    chip.appendChild(actionsEl);
    document.body.appendChild(chip);
    ensureChipStyles();

    // Auto-dismiss after 25s of inattention so it doesn't linger.
    chip._timer = setTimeout(() => {
      state.lastDecisionAt = Date.now();
      removeChip();
    }, 25_000);
  }

  function makeBtn(label, bg, fg) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `
      background: ${bg};
      color: ${fg};
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    `;
    return b;
  }

  function ensureChipStyles() {
    if (document.getElementById('continuum-autoinject-styles')) return;
    const s = document.createElement('style');
    s.id = 'continuum-autoinject-styles';
    s.textContent = `
      @keyframes continuumFadeIn {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function removeChip() {
    const c = document.getElementById(CHIP_ID);
    if (c) {
      if (c._timer) clearTimeout(c._timer);
      c.remove();
    }
  }

  // ============================================================ //
  // Acceptance: insert into composer + remember for /feedback.
  // ============================================================ //
  function acceptChip(payload, composerEl, sourceTag) {
    const block = formatInjectedBlock(payload.context);
    insertIntoComposer(composerEl, block);

    // Remember what we injected so we can log acceptance when the user sends.
    state.pendingRecallId = payload.recall_id || null;
    state.pendingMemoryId =
      (payload.included && payload.included[0] && payload.included[0].id) || null;
    state.lastDecisionAt = Date.now();
    removeChip();

    if (!state.pendingRecallId) {
      // Daemon returned context without a recall_id (e.g. logging_failed).
      // Nothing to log; we still injected.
      return;
    }
  }

  function formatInjectedBlock(context) {
    return `${INSERTED_MARKER}\n[Continuum: prior context]\n${context}\n---\n`;
  }

  function insertIntoComposer(el, block) {
    if (!el) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const before = el.value || '';
      el.value = block + (before ? '\n' + before : '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    } else if (el.isContentEditable || el.contentEditable === 'true') {
      const before = el.innerText || '';
      // contenteditable: replace text content; ChatGPT's Lexical/ProseMirror
      // editor will re-render. Simpler than splicing nodes and good enough
      // for the first version.
      el.innerText = block + (before ? '\n' + before : '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    }
  }

  // ============================================================ //
  // Acceptance attribution: when the user actually sends the message
  // (Enter, send-button), fire /feedback if we have a pending recall_id.
  // ============================================================ //
  function attachSubmitListener(composerEl) {
    if (state.submitListenerAttached || !composerEl) return;
    state.submitListenerAttached = true;

    const fire = () => {
      if (!state.pendingRecallId || !state.pendingMemoryId) return;
      chrome.runtime.sendMessage(
        {
          type: 'FEEDBACK',
          data: {
            recall_id: state.pendingRecallId,
            memory_id: state.pendingMemoryId,
          },
        },
        () => { /* fire-and-forget */ }
      );
      state.pendingRecallId = null;
      state.pendingMemoryId = null;
    };

    // Enter without Shift = send (matches ChatGPT/Perplexity convention).
    composerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // queue after the actual send happens
        setTimeout(fire, 50);
      }
    });

    // Catch send-button clicks too.
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const sendBtn =
        target.closest('[data-testid="send-button"]') ||
        target.closest('button[aria-label*="Send" i]');
      if (sendBtn) setTimeout(fire, 50);
    }, true);
  }

  // ============================================================ //
  // Expose to per-site scripts.
  // ============================================================ //
  window.__continuumAutoInject = { init: initAutoInject };
})();
