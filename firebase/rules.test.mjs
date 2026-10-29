// Checks firestore.rules with the Firestore emulator. In a folder with this file, firebase.json and the rules
// (ORGANIZER_EMAIL set to boss@test.com): npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
// then: npx firebase emulators:exec --only firestore --project demo-golf "node rules.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteField, FieldPath, setLogLevel } from 'firebase/firestore';
import fs from 'fs';
setLogLevel('error');
let fails = 0; const ok = async (p, m) => { try { await p; console.log('PASS ' + m); } catch (e) { console.log('FAIL ' + m + ' — ' + e.message); fails++; } };
const env = await initializeTestEnvironment({ projectId: 'demo-golf', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, 'tournaments/active_round'), { isArchived: false, roundData: { roundId: 1, theme: 'coastal', currentHoles: { admin: 1 }, groups: [{ id: 1, players: [{ id: 1, name: 'Al' }] }] }, scoresDb: { 1: { 1: {} } }, clipboards: {} });
    await setDoc(doc(d, 'tournaments/signup'), { date: '2099-01-01', note: 'Golf?', responses: {} });
    await setDoc(doc(d, 'tournaments/saved_players'), { players: { 'al a': { name: 'Al A' } } });
    await setDoc(doc(d, 'tournaments/admin_private'), { pin: '1234', phones: { 'al a': '(423) 555-0101' } });
    await setDoc(doc(d, 'tournaments/push_subs'), { subs: { x: { endpoint: 'e', cart: '1' } } });
    await setDoc(doc(d, 'tournaments/archive_1'), { roundData: {} });
  });
};
await seed();
const boss = env.authenticatedContext('boss', { email: 'boss@test.com', firebase: { sign_in_provider: 'password' } }).firestore();
const cart = env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const other = env.authenticatedContext('x', { email: 'stranger@test.com', firebase: { sign_in_provider: 'password' } }).firestore();
const worker = env.unauthenticatedContext().firestore();
const R = (d, p) => doc(d, 'tournaments/' + p);

console.log('--- cart phone (signed in quietly)');
await ok(assertSucceeds(updateDoc(R(cart, 'active_round'), new FieldPath('scoresDb', '1', '1', '3'), 4, new FieldPath('cartActivity', '1'), { at: 1, done: false }, new FieldPath('pace', '1', '3'), 5, new FieldPath('scoreLog', 'k1'), { g: 1, p: 1, hole: 3, from: 5, to: 4 })), 'enter a score (+ cart activity, pace, change log)');
await ok(assertSucceeds(updateDoc(R(cart, 'active_round'), new FieldPath('scoresDb', '1', '1', '3'), deleteField())), 'clear a score');
await ok(assertSucceeds(updateDoc(R(cart, 'active_round'), new FieldPath('roundData', 'currentHoles', '1'), 4)), 'move to another hole');
await ok(assertSucceeds(updateDoc(R(cart, 'active_round'), { clipboards: { 1: 'dev' } })), 'take over scoring');
await ok(assertSucceeds(updateDoc(R(cart, 'active_round'), new FieldPath('matchPresses', 'front', 'A'), 3)), 'press in Our Match');
await ok(assertFails(updateDoc(R(cart, 'active_round'), new FieldPath('roundData', 'theme'), 'x')), 'cannot change the round setup');
await ok(assertFails(updateDoc(R(cart, 'active_round'), new FieldPath('roundData', 'groups'), [])), 'cannot change the teams');
await ok(assertFails(updateDoc(R(cart, 'active_round'), { isArchived: true })), 'cannot finalize');
await ok(assertFails(setDoc(R(cart, 'active_round'), { roundData: {} })), 'cannot start or wipe a round');
await ok(assertFails(setDoc(R(cart, 'saved_players'), { players: {} }, { merge: true })), 'cannot change players');
await ok(assertFails(setDoc(R(cart, 'player_history'), { rounds: {} })), 'cannot change history');
await ok(assertFails(setDoc(R(cart, 'ledger'), { settledAt: 1 })), 'cannot settle up');
await ok(assertFails(setDoc(R(cart, 'archive_1'), {})), 'cannot change past rounds');
await ok(assertFails(getDoc(R(cart, 'admin_private'))), 'cannot read the PIN / phone numbers');
await ok(assertSucceeds(getDoc(R(cart, 'saved_players'))), 'can read player names');
await ok(assertSucceeds(setDoc(R(cart, 'push_subs'), { subs: { y: { endpoint: 'e2', cart: '2' } } }, { merge: true })), 'can save its alerts');

console.log('--- sign-up page (signed in quietly)');
await ok(assertSucceeds(setDoc(R(cart, 'signup'), { responses: { 'al a': { name: 'Al A', status: 'in', at: 1 } } }, { merge: true })), 'tap In');
await ok(assertSucceeds(setDoc(R(cart, 'signup'), { responses: { 'bo b': { name: 'Bo B', status: 'in', at: 2, by: 'Al A', note: 'x' } } }, { merge: true })), 'mark a buddy');
await ok(assertFails(setDoc(R(cart, 'signup'), { cancelled: true }, { merge: true })), 'cannot cancel the round');
await ok(assertFails(setDoc(R(cart, 'signup'), { note: 'hacked' }, { merge: true })), 'cannot change the message');

console.log('--- alerts worker (no sign-in)');
await ok(assertSucceeds(updateDoc(R(worker, 'active_round'), new FieldPath('behindAlerted', '1'), 123)), 'mark "no scores" alert sent');
await ok(assertFails(updateDoc(R(worker, 'active_round'), new FieldPath('scoresDb', '1', '1', '3'), 9)), 'cannot enter scores');
await ok(assertSucceeds(updateDoc(R(worker, 'push_subs'), new FieldPath('subs', 'x'), deleteField())), 'remove a dead phone');
await ok(assertSucceeds(getDoc(R(worker, 'active_round'))), 'read the round');
await ok(assertSucceeds(getDoc(R(worker, 'archive_1'))), 'shared results link can read a past round');
await ok(assertFails(getDoc(R(worker, 'admin_private'))), 'cannot read the PIN / phone numbers');
await ok(assertFails(setDoc(R(worker, 'signup'), { responses: { z: { status: 'in' } } }, { merge: true })), 'not signed in: cannot answer');

console.log('--- someone else with an account');
await ok(assertFails(setDoc(R(other, 'saved_players'), { players: {} })), 'cannot change players');
await ok(assertFails(setDoc(R(other, 'active_round'), {})), 'cannot wipe the round');

console.log('--- organizer');
await seed();
await ok(assertSucceeds(setDoc(R(boss, 'active_round'), { roundData: { roundId: 2, groups: [] }, scoresDb: {}, isArchived: false, clipboards: {} })), 'start a round');
await ok(assertSucceeds(updateDoc(R(boss, 'active_round'), { isArchived: true, archivedAt: 5 })), 'finalize');
await ok(assertSucceeds(setDoc(R(boss, 'saved_players'), { players: { 'c c': { name: 'C' } } }, { merge: true })), 'save players');
await ok(assertSucceeds(getDoc(R(boss, 'admin_private'))), 'read the PIN / phone numbers');
await ok(assertSucceeds(setDoc(R(boss, 'admin_private'), { pin: '9876' }, { merge: true })), 'change the PIN');
await ok(assertSucceeds(setDoc(R(boss, 'signup'), { date: '2099-02-02', note: 'Golf Sat?', responses: {}, cancelled: false })), 'new sign-up');
await ok(assertSucceeds(setDoc(R(boss, 'archive_9'), { roundData: {} })), 'archive a round');
await ok(assertSucceeds(setDoc(R(boss, 'player_history'), { rounds: { 9: { date: 'x' } } }, { merge: true })), 'save history');
await env.cleanup();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
