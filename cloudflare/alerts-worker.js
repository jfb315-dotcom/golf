// JB Golf alerts: a Cloudflare Worker that sends phone notifications to everyone who tapped
// "Turn on alerts" in the app. The app calls it with a short message; it looks up the phones
// in Firebase and pushes the message to each one. Tapping the notification opens the app.
//
// Settings (Worker → Settings → Variables and Secrets):
//   VAPID_PUBLIC_KEY   the public key (also in index.html)
//   VAPID_PRIVATE_KEY  the private key, added as a Secret
//   VAPID_SUBJECT      mailto: plus your email, e.g. mailto:you@example.com

const SUBS_DOC = 'https://firestore.googleapis.com/v1/projects/golf-327be/databases/(default)/documents/tournaments/push_subs';
const ALLOWED_ORIGIN = 'https://jfb315-dotcom.github.io';

export default {
    async fetch(request, env) {
        const cors = {
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return new Response('JB Golf alerts are running.', { headers: cors });

        let msg;
        try { msg = await request.json(); } catch (e) { return new Response('Bad message', { status: 400, headers: cors }); }
        const text = v => String(v || '').slice(0, 200);
        const payload = { title: text(msg.title).slice(0, 80), body: text(msg.body), view: text(msg.view).slice(0, 20), tag: text(msg.tag).slice(0, 60) };
        if (!payload.title) return new Response('Missing title', { status: 400, headers: cors });

        const subs = await loadSubscriptions();
        let sent = 0, gone = [];
        await Promise.all(Object.entries(subs).map(async ([id, sub]) => {
            if (id === msg.from) return; // not back to the phone that sent it
            try {
                const res = await sendPush(sub, JSON.stringify({ ...payload, url: sub.url || '' }), env);
                if (res.status === 404 || res.status === 410) gone.push(id); // phone turned alerts off or reinstalled
                else if (res.ok) sent++;
            } catch (e) { /* one bad subscription shouldn't stop the rest */ }
        }));
        if (gone.length) await removeSubscriptions(gone);
        return new Response(JSON.stringify({ sent, removed: gone.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    },
};

// ---------- Subscriptions, stored by the app in Firestore at tournaments/push_subs ----------

async function loadSubscriptions() {
    const res = await fetch(SUBS_DOC);
    if (!res.ok) return {};
    const doc = await res.json();
    const fields = doc.fields?.subs?.mapValue?.fields || {};
    const out = {};
    for (const [id, v] of Object.entries(fields)) {
        const f = v.mapValue?.fields || {};
        const get = k => f[k]?.stringValue || '';
        if (get('endpoint') && get('p256dh') && get('auth')) out[id] = { endpoint: get('endpoint'), p256dh: get('p256dh'), auth: get('auth'), url: get('url') };
    }
    return out;
}

async function removeSubscriptions(ids) {
    // A field in the update mask but not in the body is deleted
    const mask = ids.map(id => 'updateMask.fieldPaths=' + encodeURIComponent(`subs.${id}`)).join('&');
    await fetch(`${SUBS_DOC}?${mask}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
}

// ---------- Web push (RFC 8291 message encryption + RFC 8292 VAPID) ----------

const enc = new TextEncoder();
const b64urlToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const bytesToB64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };

async function hkdf(salt, ikm, info, length) {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function encryptPayload(sub, text) {
    const uaPublic = b64urlToBytes(sub.p256dh);
    const authSecret = b64urlToBytes(sub.auth);
    const server = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

    const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

    const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const plain = concat(enc.encode(text), new Uint8Array([2])); // 2 = last (only) record
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));

    const header = new Uint8Array(21 + asPublic.length);
    header.set(salt, 0);
    new DataView(header.buffer).setUint32(16, 4096);
    header[20] = asPublic.length;
    header.set(asPublic, 21);
    return concat(header, cipher);
}

async function vapidToken(endpoint, env) {
    const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
    const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const part = o => bytesToB64url(enc.encode(JSON.stringify(o)));
    const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:jbgolf@example.com' })}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
    return `${unsigned}.${bytesToB64url(sig)}`;
}

async function sendPush(sub, text, env) {
    const body = await encryptPayload(sub, text);
    return fetch(sub.endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `vapid t=${await vapidToken(sub.endpoint, env)}, k=${env.VAPID_PUBLIC_KEY}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '3600',
            'Urgency': 'high',
        },
        body,
    });
}
