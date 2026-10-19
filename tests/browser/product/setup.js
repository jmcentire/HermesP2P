import { validateLocalConfig } from '/static/js/config-import.js';
const role = new URL(location.href).searchParams.get('role');
const labels = {A:'sender Alice', B:'recipient Bob', C:'wrong channel key / wrong DM recipient', D:'missing channel key / wrong DM recipient'};
document.querySelector('#role').textContent = 'Test role: ' + (labels[role] || 'invalid');
document.querySelector('#start').addEventListener('click', async () => {
    const button = document.querySelector('#start'); button.disabled = true;
    try {
        if (!Object.hasOwn(labels, role)) throw new Error();
        const response = await fetch('/__ui__/join', {method:'POST', headers:{'Content-Type':'application/json'},
            signal:AbortSignal.timeout(3000), body:JSON.stringify({role})});
        if (!response.ok) throw new Error();
        const credentials = await response.json();
        const key = n => {
            // Public deterministic TEST seeds. These are not persistent user credentials.
            const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(n));
            return {pubKey:base64js.fromByteArray(pair.publicKey),privKey:base64js.fromByteArray(pair.secretKey)};
        };
        const names = {A:'Dummy Alice',B:'Dummy Bobby',C:'Dummy Carol',D:'Dummy Delta'};
        const channel = {name: role === 'B' ? 'ReceiverRoom' : 'SenderRoom'};
        if (role !== 'D') channel.key = base64js.fromByteArray(new Uint8Array(32).fill(role === 'C' ? 82 : 81));
        const config = {user:{name:names[role],...key(role.charCodeAt(0))},
            channels:[{name:'General'}, channel], friends:Object.keys(names).filter(r=>r!==role)
                .map(r=>({name:names[r],pubKey:key(r.charCodeAt(0)).pubKey}))};
        sessionStorage.setItem('hp2pConfig', JSON.stringify(validateLocalConfig(config,nacl,base64js)));
        sessionStorage.setItem('hp2pUiTest', JSON.stringify(credentials));
        location.href='/client';
    } catch { document.querySelector('#status').textContent='Setup rejected; restart the dedicated one-shot server.'; }
});
