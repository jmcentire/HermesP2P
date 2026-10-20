// Same-origin external module: compatible with the application's script-src 'self'.
import '/__diag__/observer.js?v=1';

const native = document.querySelector('#native');
const output = document.querySelector('#results');
const report = async event => {
    const response = await fetch('/__isolated__/event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Diagnostic event rejected');
};
let started = false;
native.addEventListener('click', event => {
    if (started) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
    }
    started = true;
    void report('test_clicked').catch(() => {
        output.textContent += '\nClick receipt unavailable; inspect independent candidate evidence.\n';
    });
}, { capture: true });
// The underlying fixture re-enables its buttons at cleanup; keep other modes
// unavailable throughout this one-shot diagnostic without changing product code.
for (const id of ['nontrickle', 'mesh']) document.querySelector('#' + id).remove();
try {
    await report('page_ready');
    native.disabled = false;
} catch {
    output.textContent = 'Diagnostic readiness unavailable. Do not start another test.';
}
