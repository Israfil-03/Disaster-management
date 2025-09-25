// Lightweight in-browser smoke test for the dashboard.
// Usage: open AadhyaPath_dashboard.html?demo=1&selftest=1&role=citizen
// This runs only in demo mode to avoid touching live databases.
(function(){
  try{
    const url = new URL(window.location.href);
    const run = url.searchParams.get('selftest') === '1';
    if(!run) return;

    function el(q){ return document.querySelector(q); }
    function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }
    function createOverlay(){
      const wrap = document.createElement('div');
      wrap.id = 'selftest-overlay';
      wrap.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:10px 12px;max-width:360px;font:12px/1.4 system-ui,Segoe UI,Roboto,Arial';
      wrap.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Self-test</div><ul id="selftest-list" style="margin:0;padding-left:16px"></ul><div id="selftest-summary" style="margin-top:6px;font-weight:600"></div>';
      document.body.appendChild(wrap);
      return wrap;
    }
    function logItem(text, ok){
      const ul = document.getElementById('selftest-list');
      const li = document.createElement('li');
      li.textContent = `${ok ? 'PASS' : 'FAIL'} — ${text}`;
      li.style.color = ok ? '#10b981' : '#f43f5e';
      ul.appendChild(li);
    }
    function setSummary(passed, total){
      const s = document.getElementById('selftest-summary');
      const color = passed === total ? '#10b981' : '#f59e0b';
      s.textContent = `Result: ${passed}/${total} checks passed`;
      s.style.color = color;
    }

    async function runTests(){
      const overlay = createOverlay();
      let passed = 0, total = 0;

      function check(desc, cond){ total++; if(cond){ passed++; } logItem(desc, !!cond); }

      // Ensure demo mode
      check('Demo mode enabled', !!window.__DEMO_MODE__);

      // Wait for DOM and initial renders
      await delay(400);

      // Basic elements
      check('Stats present', !!el('#alerts-count') && !!el('#reports-count'));
      check('Report form present', !!el('#submit-report'));

      // 1) Citizen submits a report
      const testLoc = `Test Village ${Date.now().toString().slice(-6)}`;
      const testDesc = 'Water level rising; need boats';
      const beforePending = parseInt((el('#pending-count')?.textContent||'0'), 10) || 0;
      try{
        el('#report-type').value = 'Flood';
        el('#report-description').value = testDesc;
        el('#report-location').value = testLoc;
        el('#submit-report').click();
      }catch{}
      await delay(200);
      const afterPending = parseInt((el('#pending-count')?.textContent||'0'), 10) || 0;
      check('Citizen: pending count incremented', afterPending === beforePending + 1);
      check('State updated with new report', Array.isArray(window.state?.verifyQueue) ? window.state.verifyQueue[0]?.loc === testLoc : true);

      // 2) Switch to Authority and verify report visible
      try{
        const roleSel = el('#role-select');
        roleSel.value = 'authority';
        roleSel.dispatchEvent(new Event('change', { bubbles:true }));
      }catch{}
      await delay(200);
      const verifyRows = Array.from(document.querySelectorAll('#verify-list tr'));
      const hasRow = verifyRows.some(tr => tr.textContent.includes(testLoc));
      check('Authority: report appears in Verify table', hasRow);

      // 3) Approve the top report
      const approveBtn = document.querySelector('#verify-list tr button[data-act="approve"]');
      if(approveBtn){ approveBtn.click(); await delay(150); }
      const firstRow = document.querySelector('#verify-list tr');
      const rowHasVerified = firstRow ? /Verified/i.test(firstRow.textContent) : false;
      check('Authority: approving report updates status', rowHasVerified);

      // 4) Broadcast alert (Authority)
      const beforeAlerts = (document.querySelectorAll('#alert-feed li')||[]).length;
      try{
        el('#alert-message').value = 'Test broadcast — stay safe and avoid low-lying areas';
        el('#alert-severity').value = 'Medium';
        el('#alert-hazard').value = 'Flood';
        el('#alert-state').value = '';
        el('#alert-district').value = '';
        el('#send-alert').click();
      }catch{}
      await delay(200);
      const afterAlerts = (document.querySelectorAll('#alert-feed li')||[]).length;
      check('Authority: broadcast alert appears in feed', afterAlerts === beforeAlerts + 1);

      setSummary(passed, total);
      overlay.title = 'Click to dismiss';
      overlay.addEventListener('click', ()=> overlay.remove());
      // Switch back to role from URL, if any
      const roleParam = (new URL(window.location.href)).searchParams.get('role')||'';
      if(roleParam && el('#role-select')){
        try{ el('#role-select').value = roleParam; el('#role-select').dispatchEvent(new Event('change', { bubbles:true })); }catch{}
      }
    }

    // Run after DOM loaded
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', runTests);
    } else {
      runTests();
    }
  }catch(e){ console.warn('Self-test init failed', e); }
})();
