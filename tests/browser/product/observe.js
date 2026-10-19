// Test-only transport observation + raw replay. Application UI/crypto/receive logic is unmodified.
import { unpadMessage, padMessage } from '/static/js/padding.js';
import { validEnvelope } from '/static/js/envelope.js';
const credentials = JSON.parse(sessionStorage.getItem('hp2pUiTest') || 'null');
if (!credentials || !['A','B','C','D'].includes(credentials.role)) throw new Error('Test setup required');
const channels = new Set(), sockets = new Set(), connections = new Set();
const nativeRTC = window.RTCPeerConnection, nativeWS = window.WebSocket;
let active = true, captureNext = false, lastFrame = null, timer, captureTimer, localForwarding = true;
const inboundFrames = new Set();
const frameKey = frame => typeof frame === 'string' ? 'text:'+frame : base64js.fromByteArray(new Uint8Array(frame));
const metrics = {sentWhileForwarding:0,linkLost:0,open:0,publicRx:0,privateRx:0,directRx:0,invalidRx:0,outbound:0,
    publicShown:0,privateShown:0,directShown:0,replyShown:0,tamperedShown:0};
const panel = document.createElement('aside');
panel.style.cssText='position:sticky;top:0;z-index:2000;background:#fffbdc;color:#111;padding:8px;font:15px system-ui;border:2px solid #876;';
panel.innerHTML='<strong>Product acceptance observer v4 — dummy '+credentials.role+'</strong><p id="testLink"></p><p id="testRelay"></p><p id="testRx"></p><p id="testVisible"></p><button id="testDisable">Disable TEST hub data forwarding</button> <button id="testReplay" disabled>Replay last submitted signed frame twice DIRECT</button> <button id="testTamper" disabled>Send tampered last public frame DIRECT</button> <button id="testRefresh">Refresh observation</button> <button id="testStop">Stop test connections</button><p id="testAction">Ready for product UI interaction</p>';
document.body.prepend(panel);
function describe(frame) {
    try {
        const text = typeof frame === 'string' ? frame : new TextDecoder().decode(unpadMessage(new Uint8Array(frame)));
        return JSON.parse(text);
    } catch { return null; }
}
function watch(channel) {
    if (channels.has(channel)) return;
    channels.add(channel);
    const send = channel.send.bind(channel);
    channel.send = frame => {
        send(frame);
        metrics.outbound = Math.min(10000, metrics.outbound + 1);
        if (captureNext && !localForwarding && !inboundFrames.has(frameKey(frame)) && validEnvelope(describe(frame))) {
            lastFrame = typeof frame === 'string' ? frame : new Uint8Array(frame).slice();
            captureNext = false; clearTimeout(captureTimer);
            document.querySelector('#testReplay').disabled=false;document.querySelector('#testTamper').disabled=false;
            document.querySelector('#testAction').textContent='Captured own submitted '+describe(frame).type+' signed frame for replay';
        }
    };
    channel.addEventListener('message', event => {
        if(inboundFrames.size>=64)inboundFrames.delete(inboundFrames.values().next().value);
        inboundFrames.add(frameKey(event.data));
        const envelope = describe(event.data);
        const field = validEnvelope(envelope) ? ({public:'publicRx',private:'privateRx',direct:'directRx'}[envelope.type]) : 'invalidRx';
        if (field) metrics[field] = Math.min(10000, metrics[field] + 1);
        render();
    });
}
window.RTCPeerConnection = class extends nativeRTC {
    constructor(...args) { if(!active)throw new Error('Test stopped'); super(...args); connections.add(this); this.addEventListener('datachannel',e=>watch(e.channel)); }
    createDataChannel(...args) { const c=super.createDataChannel(...args); watch(c); return c; }
};
window.WebSocket = class extends nativeWS {
    constructor(...args) { if(!active)throw new Error('Test stopped'); super(...args); sockets.add(this); }
};
function render() {
    metrics.open = [...channels].filter(c=>c.readyState==='open').length;
    if(!localForwarding && metrics.open!==credentials.expectedConnections)metrics.linkLost=1;
    const contents = [...document.querySelectorAll('#messages .message-content')].map(e=>e.textContent);
    for (const [key, token] of Object.entries({publicShown:'accept-public-01',privateShown:'accept-private-01',directShown:'accept-direct-01',replyShown:'accept-reply-01',tamperedShown:'accept-tampered-01'})) {
        metrics[key] = contents.filter(v=>v.includes(token)).length;
    }
    document.querySelector('#testLink').textContent=`Open direct channels: ${metrics.open}; role ${credentials.role}; sends while relay enabled ${metrics.sentWhileForwarding}; lost-link failure ${metrics.linkLost}; RTC states ${[...connections].map(p=>p.connectionState).join(',')}; observed channels ${[...channels].map(c=>c.readyState).join(',')}`;
    document.querySelector('#testRx').textContent=`Direct authenticated frames: public ${metrics.publicRx}, private ${metrics.privateRx}, direct ${metrics.directRx}; invalid ${metrics.invalidRx}`;
    document.querySelector('#testVisible').textContent=`Visible message counts: public ${metrics.publicShown}, private ${metrics.privateShown}, direct ${metrics.directShown}, reply ${metrics.replyShown}, tampered ${metrics.tamperedShown}`;
}
async function post(path, value={}) {
    const response=await fetch('/__ui__/'+path,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(3000),body:JSON.stringify({...credentials,...value})});
    if (!response.ok) throw new Error('controller unavailable');
    return response.json();
}
async function report() {
    if (!active) return;
    clearTimeout(timer);
    render();
    try {
        const status=await post('report',{metrics});
        if (!active) return;
        localForwarding=status.forwarding;
        document.querySelector('#testRelay').textContent=`TEST hub data forwarding: ${status.forwarding?'enabled':'DISABLED'}; blocked frames ${status.blocked}; test participants ${status.participants}`;
    } catch { document.querySelector('#testAction').textContent='Controller unavailable; stop test'; stop(); return; }
    timer=setTimeout(report,500);
}
function stop() {
    if (!active) return; active=false;clearTimeout(timer);clearTimeout(deadline);clearTimeout(captureTimer);
    window._hermesDiscoveryCleanup?.();
    for (const socket of sockets) {socket.onclose=socket.onerror=socket.onmessage=socket.onopen=null;socket.close(1000,'test complete');}
    for (const connection of connections) connection.close();
    lastFrame=null; sessionStorage.removeItem('hp2pConfig');sessionStorage.removeItem('hp2pUiTest');
    panel.querySelectorAll('button').forEach(b=>b.disabled=true);
    document.querySelector('#testAction').textContent='Test stopped; owned sockets closed and dummy storage removed';
}
document.querySelector('#testDisable').addEventListener('click',async()=>{
    try {await post('disable');document.querySelector('#testAction').textContent='Test data relay disabled after both clients reported their open direct channel';}
    catch {document.querySelector('#testAction').textContent='Disable rejected: both clients must have one open direct channel';}
});
function sendDirect(frame) {
    if (!active || localForwarding || metrics.open!==credentials.expectedConnections) throw new Error('Direct-only prerequisites not met');
    for (const c of channels) if(c.readyState==='open') c.send(frame);
}
document.querySelector('#testReplay').addEventListener('click',()=>{
    try {if(!lastFrame)throw new Error();sendDirect(lastFrame);sendDirect(lastFrame);document.querySelector('#testAction').textContent='Replayed exact last submitted frame twice through each direct channel';}
    catch {document.querySelector('#testAction').textContent='Replay rejected: send a product message after direct setup first';}
});
document.querySelector('#testTamper').addEventListener('click',()=>{
    try {const value=describe(lastFrame);if(value?.type!=='public')throw new Error();value.message='accept-tampered-01';value.id='tampered_'+crypto.randomUUID();value.timestamp=Date.now();sendDirect(padMessage(new TextEncoder().encode(JSON.stringify(value))));document.querySelector('#testAction').textContent='Sent altered public payload without changing its original signature';}
    catch {document.querySelector('#testAction').textContent='Tamper test requires last submitted public frame';}
});
document.querySelector('#testRefresh').addEventListener('click',()=>void report());
window.addEventListener('error',()=>{document.querySelector('#testAction').textContent='Script error: acceptance invalid; stop and inspect';});
document.querySelector('#testStop').addEventListener('click',stop);
window.addEventListener('pagehide',stop,{once:true});
const deadline=setTimeout(stop,900000);
await import('/static/js/client.js');
document.querySelector('#messageForm').addEventListener('submit',()=>{
    captureNext=true;lastFrame=null;clearTimeout(captureTimer);
    if(localForwarding)metrics.sentWhileForwarding++;
    document.querySelector('#testReplay').disabled=true;document.querySelector('#testTamper').disabled=true;
    captureTimer=setTimeout(()=>{captureNext=false;document.querySelector('#testAction').textContent='No own frame captured; replay disabled';},5000);
},{capture:true});
void report();
