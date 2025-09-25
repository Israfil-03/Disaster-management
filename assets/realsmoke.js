// Real Supabase E2E smoke test (local-only, gated by URL params)
// Usage (LOCALHOST ONLY):
// AadhyaPath_dashboard.html?realsmoke=1&cemail=...&cpass=...&aemail=...&apass=...&arole=ndrf
(function(){
  try{
    const url = new URL(window.location.href);
    const run = url.searchParams.get('realsmoke') === '1';
    const isLocal = ['localhost','127.0.0.1','::1'].includes(location.hostname);
    if(!run || !isLocal) return;

    const supabase = window.supabaseClient;
    if(!supabase){ console.warn('realsmoke: supabase client missing'); return; }

    const cfg = {
      cemail: url.searchParams.get('cemail') || '',
      cpass: url.searchParams.get('cpass') || '',
      aemail: url.searchParams.get('aemail') || '',
      apass: url.searchParams.get('apass') || '',
      arole: (url.searchParams.get('arole')||'authority').toLowerCase()
    };
    if(!cfg.cemail || !cfg.cpass || !cfg.aemail || !cfg.apass){
      console.warn('realsmoke: missing credentials in URL params');
      return;
    }

    // UI overlay
    const wrap = document.createElement('div');
    wrap.id = 'realsmoke-overlay';
    wrap.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;background:#0b1020;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:10px 12px;max-width:440px;font:12px/1.45 system-ui,Segoe UI,Roboto,Arial;box-shadow:0 6px 24px rgba(0,0,0,0.25)';
    wrap.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Real Smoke Test</div><div id="rs-log" style="white-space:pre-wrap;max-height:220px;overflow:auto"></div><div id="rs-sum" style="margin-top:8px;font-weight:600"></div>';
    document.body.appendChild(wrap);
    const logEl = wrap.querySelector('#rs-log');
    const sumEl = wrap.querySelector('#rs-sum');
    function log(s){ logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; }
    function summarize(ok){ sumEl.textContent = ok ? 'PASS: All checks passed' : 'FAIL: See log above'; sumEl.style.color = ok ? '#10b981' : '#f43f5e'; wrap.title = 'Click to dismiss'; wrap.onclick = ()=> wrap.remove(); }

    // Helpers
    const ts = Date.now();
    const uniqLoc = `SELFTEST-${ts}`;
    async function ensureProfile(role){
      try{
        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user;
        if(!user) return;
        const fullName = (user.user_metadata?.full_name || user.email || '').trim();
        await supabase.from('profiles').upsert({ id: user.id, full_name: fullName, role }, { onConflict: 'id' });
      }catch(e){ log('warn: upsert profile failed: '+(e?.message||e)); }
    }

    (async ()=>{
      try{
        log('Step 0: sign out existing session');
        await supabase.auth.signOut().catch(()=>{});

        // Citizen login
        log('Step 1: sign in as citizen: '+cfg.cemail);
        let { data: l1, error: e1 } = await supabase.auth.signInWithPassword({ email: cfg.cemail, password: cfg.cpass });
        if(e1){ log('error: citizen login failed: '+e1.message); return summarize(false); }
        await ensureProfile('citizen');

        // Insert report
        log('Step 2: insert citizen report');
        {
          const payload = { type: 'Flood', description: 'E2E smoke test', location: uniqLoc, contact: null };
          const { error } = await supabase.from('reports').insert(payload);
          if(error){ log('error: insert report failed: '+error.message); return summarize(false); }
        }

        // Switch to authority/ndrf
        log('Step 3: sign out');
        await supabase.auth.signOut();
        log('Step 4: sign in as '+cfg.arole+': '+cfg.aemail);
        let { data: l2, error: e2 } = await supabase.auth.signInWithPassword({ email: cfg.aemail, password: cfg.apass });
        if(e2){ log('error: authority/ndrf login failed: '+e2.message); return summarize(false); }
        await ensureProfile(cfg.arole);

        // Fetch and verify presence
        log('Step 5: verify report visible to '+cfg.arole);
        let { data: reports, error: qerr } = await supabase.from('reports').select('*').eq('location', uniqLoc).limit(1);
        if(qerr){ log('error: select report failed: '+qerr.message); return summarize(false); }
        if(!Array.isArray(reports) || reports.length === 0){ log('error: report not visible to '+cfg.arole); return summarize(false); }
        const rep = reports[0];

        // Approve
        log('Step 6: update report status → Verified');
        {
          const { error } = await supabase.from('reports').update({ status: 'Verified' }).eq('id', rep.id);
          if(error){ log('error: update status failed: '+error.message); return summarize(false); }
        }

        // Confirm status
        log('Step 7: confirm status');
        {
          const { data: chk, error } = await supabase.from('reports').select('status').eq('id', rep.id).maybeSingle();
          if(error){ log('error: re-select failed: '+error.message); return summarize(false); }
          if(!chk || chk.status !== 'Verified'){ log('error: status not Verified'); return summarize(false); }
        }

        log('Step 8: sign out');
        await supabase.auth.signOut();
        summarize(true);
      }catch(e){
        log('fatal: '+(e?.message||String(e)));
        summarize(false);
      }
    })();
  }catch(e){ console.warn('realsmoke init failed', e); }
})();
