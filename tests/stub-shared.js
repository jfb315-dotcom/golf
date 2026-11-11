// Fake Firestore shared by several pages: writes go to the test runner, which applies them in order
// and pushes the new documents to every open page (like real snapshot listeners).
(function(){
  const DEL = { __delete: true };
  class FieldPath { constructor(...s){ this.segs = s; } }
  const listeners = {}; let docs = {};
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  function fire(id){ const d = clone(docs[id]); (listeners[id]||[]).forEach(cb => cb({ exists: !!d, data: () => clone(d) })); }
  window.__receiveDocs = d => { docs = d; Object.keys(listeners).forEach(fire); };
  window.__docs = () => docs;
  const ref = id => ({
    delete(){ return Promise.resolve(); },
    onSnapshot(cb){ (listeners[id] = listeners[id]||[]).push(cb); setTimeout(() => cb({ exists: !!docs[id], data: () => clone(docs[id]) }), 0); },
    get(){ return Promise.resolve({ exists: !!docs[id], data: () => clone(docs[id]) }); },
    set(d, opts){ return window.__backendWrite({ op: 'set', id, data: clone(d), merge: !!(opts && opts.merge) }); },
    update(...args){
      const pairs = [];
      if (args.length === 1 && !(args[0] instanceof FieldPath)) Object.entries(args[0]).forEach(([k, v]) => pairs.push([k.split('.'), v === DEL ? DEL : clone(v)]));
      else for (let i = 0; i < args.length; i += 2) pairs.push([args[i] instanceof FieldPath ? args[i].segs : args[i].split('.'), args[i+1] === DEL ? DEL : clone(args[i+1])]);
      return window.__backendWrite({ op: 'update', id, pairs });
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
