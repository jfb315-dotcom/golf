(function(){
  const DEL = {__delete:true};
  class FieldPath { constructor(...s){ this.segs = s; } }
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  window.__docs = window.__docsInit || {}; window.__updates = []; window.__hold = false; window.__held = [];
  Object.defineProperty(window, '__doc', { get(){ return window.__docs.active_round; }, set(v){ window.__docs.active_round = v; } });
  const listeners = {};
  function fire(id){ const d = clone(window.__docs[id]); (listeners[id]||[]).forEach(cb => cb({ exists: !!d, data: () => clone(d) })); }
  function setPath(obj, segs, v){ let o = obj; for (let i=0;i<segs.length-1;i++){ if(typeof o[segs[i]]!=='object'||o[segs[i]]===null) o[segs[i]]={}; o=o[segs[i]]; } if (v===DEL) delete o[segs[segs.length-1]]; else o[segs[segs.length-1]] = clone(v); }
  function deepMerge(t, s){ for (const k in s){ if (s[k] && typeof s[k]==='object' && !Array.isArray(s[k])) { if (typeof t[k]!=='object'||!t[k]) t[k]={}; deepMerge(t[k], s[k]); } else t[k]=clone(s[k]); } }
  window.__externalUpdate = (segs, v) => { setPath(window.__docs.active_round, segs, v); fire('active_round'); };
  window.__release = () => { window.__hold = false; window.__held.splice(0).forEach(r => r()); };
  // Like real Firestore: throw straight away on lists inside lists or undefined values
  function check(v, inArray){
    if (v === undefined) throw new Error('Unsupported field value: undefined');
    if (Array.isArray(v)) { if (inArray) throw new Error('Nested arrays are not supported'); v.forEach(x => check(x, true)); }
    else if (v && typeof v === 'object' && v !== DEL) Object.values(v).forEach(x => check(x, false));
  }
  const done = () => window.__hold ? new Promise(r => window.__held.push(r)) : Promise.resolve();
  const ref = id => ({
    delete(){ delete window.__docs[id]; setTimeout(() => fire(id),0); return done(); },
    onSnapshot(cb){ (listeners[id] = listeners[id]||[]).push(cb); setTimeout(() => cb({ exists: !!window.__docs[id], data: () => clone(window.__docs[id]) }), 0); },
    get(){ return Promise.resolve({ exists: !!window.__docs[id], data: () => clone(window.__docs[id]) }); },
    set(d, opts){ check(d, false); if (opts && opts.merge) { window.__docs[id] = window.__docs[id] || {}; deepMerge(window.__docs[id], d); } else window.__docs[id] = clone(d); setTimeout(() => fire(id),0); return done(); },
    update(...args){
      const doc = window.__docs[id];
      if (!doc) return Promise.reject(new Error('No document to update: ' + id)); // like Firestore
      for (let i = args.length === 1 ? 0 : 1; i < args.length; i += (args.length === 1 ? 1 : 2)) check(args[i], false);
      if (args.length === 1 && !(args[0] instanceof FieldPath)) { window.__updates.push({obj:Object.keys(args[0])}); Object.entries(args[0]).forEach(([k,v]) => setPath(doc, k.split('.'), v)); }
      else for (let i=0;i<args.length;i+=2){ const segs = args[i] instanceof FieldPath ? args[i].segs : args[i].split('.'); window.__updates.push({path:segs.join('/'), v: args[i+1]===DEL?'DEL':args[i+1]}); setPath(doc, segs, args[i+1]); }
      setTimeout(() => fire(id),0); return done();
    }
  });
  const fs = () => ({ collection: () => ({ doc: ref }), enablePersistence: () => Promise.resolve() });
  fs.FieldPath = FieldPath; fs.FieldValue = { delete: () => DEL };

  // Fake Firebase sign-in: the organizer by default; window.__authUser overrides (null = nobody yet, then anonymous)
  const authObj = { currentUser: null, _cbs: [],
    _set(u){ this.currentUser = u; this._cbs.forEach(cb => cb(u)); },
    onAuthStateChanged(cb){ this._cbs.push(cb); setTimeout(() => { if (this.currentUser === null) this.currentUser = window.__authUser === undefined ? { isAnonymous: false, email: 'admin@test', uid: 'admin' } : window.__authUser; cb(this.currentUser); }, 0); return () => {}; },
    signInAnonymously(){ if (window.__authDisabled) return Promise.reject({ code: 'auth/operation-not-allowed' }); setTimeout(() => this._set({ isAnonymous: true, uid: 'anon' }), 0); return Promise.resolve(); },
    signInWithEmailAndPassword(e, p){ if (p !== 'good') return Promise.reject({ code: 'auth/wrong-password' }); setTimeout(() => this._set({ isAnonymous: false, email: e, uid: 'admin' }), 0); return Promise.resolve(); },
    signOut(){ setTimeout(() => this._set(null), 0); return Promise.resolve(); } };
  window.firebase = { initializeApp(){}, firestore: fs, auth: () => authObj };
})();
