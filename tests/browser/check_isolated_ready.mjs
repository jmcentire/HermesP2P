// Exercise the served module body with test DOM/network dependencies. The Python
// checks independently verify same-origin module URLs/MIME and unchanged CSP.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./isolated_ready.js', import.meta.url), 'utf8');
const body = source.replace("import '/__diag__/observer.js?v=1';", '');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('document', 'fetch', body);
const fixtureSource = readFileSync(new URL('./connectivity.js', import.meta.url), 'utf8');
const initializeFixture = new Function('document', 'window', fixtureSource.replace(/^import .*;\n/, ''));
function harness(fetchImpl) {
    const nodes = Object.fromEntries(['native', 'nontrickle', 'mesh', 'results', 'stop'].map(id => [id, {
        disabled: id === 'native', textContent: '', removed: false,
        remove() { this.removed = true; },
        addEventListener(type, fn, options) { assert.equal(type, 'click'); assert.equal(options.capture, true); this.click = fn; },
    }]));
    const document = { querySelector: selector => nodes[selector.slice(1)], getElementById: id => nodes[id] };
    // Execute the actual fixture's initialization before the hook, as the module
    // import graph does. No test click/RTCPeerConnection is invoked here.
    initializeFixture(document, { addEventListener() {} });
    return { nodes, ready: execute(document, fetchImpl) };
}

test('waits for acknowledged readiness; records one click and blocks repeat execution', async () => {
    const sent = [];
    let acknowledge;
    const pending = new Promise(resolve => { acknowledge = resolve; });
    const h = harness(async (url, options) => {
        assert.equal(url, '/__isolated__/event');
        sent.push(JSON.parse(options.body));
        if (sent.length === 1) await pending;
        return { ok: true };
    });
    assert.equal(h.nodes.native.disabled, true);
    assert.equal(typeof h.nodes.native.onclick, 'function');
    acknowledge(); await h.ready;
    assert.equal(h.nodes.native.disabled, false);
    assert.equal(h.nodes.nontrickle.removed, true);
    assert.equal(h.nodes.mesh.removed, true);
    const event = { stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    h.nodes.native.click(event);
    assert.equal(event.stopped, undefined);
    h.nodes.native.click(event);
    assert.equal(event.stopped, true);
    assert.equal(event.prevented, true);
    assert.deepEqual(sent, [{ event: 'page_ready' }, { event: 'test_clicked' }]);
});

test('failed readiness leaves the test disabled and shows a fixed error', async () => {
    const h = harness(async () => { throw new Error('sensitive network detail'); });
    await h.ready;
    assert.equal(h.nodes.native.disabled, true);
    assert.equal(h.nodes.results.textContent, 'Diagnostic readiness unavailable. Do not start another test.');
});

test('failed click receipt does not claim no execution or leak network errors', async () => {
    const h = harness(async (_url, options) => ({ ok: JSON.parse(options.body).event === 'page_ready' }));
    await h.ready;
    h.nodes.native.click({});
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.results.textContent, /Click receipt unavailable; inspect independent candidate evidence/);
});
