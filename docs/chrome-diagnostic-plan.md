# Bounded Chrome candidate diagnostic plan

**Later outcome:** the owner-authorized disposable-process diagnostic below was
subsequently performed; see [the isolated result](#isolated-process-result-and-next-discriminator).
The original scoped plan and its capability checkpoint remain historical records.

Prepared 2026-10-19; **not executed**. This preparation used files and public source
only. No browser, screen capture, permission change or new Chrome process was used.
The live checkpoint remains Chrome 155.0.8059.85 on macOS 26.6.2, with direct
connectivity failing despite accepted candidates. Existing completed controls
must not be repeated unless new instrumentation distinguishes an unanswered case.

## What is already known

- Native Chrome accepted every emitted candidate with matching MID/ufrag, but
  remote-candidate and candidate-pair counts stayed zero at 2/8/12 seconds.
- The official native two-tab WebRTC sample also failed to open a usable channel.
  Its exact elapsed duration and candidate trace were not recorded. This control
  has been run; a future instrumented version would add evidence, not be a first run.
- Exact live Chrome-generated mDNS names failed bounded OS lookups; Safari names
  resolved to IPv4. Native Safari connected. In the mixed case Chrome also failed
  to admit Safari's OS-resolvable candidate. OS lookup is not browser resolution.
- Effective Chrome policy UI showed no policies set; active flags contained only
  restart markers and empty flag-switch delimiters. Those observations do not
  reveal internal feature activation or the browser permission decision below.
- A historical operator brief from the post-update run records browser permission
  queries for `local-network-access`/`local-network` as `prompt`. That observation
  is not in the retained scalar candidate snapshots and was not re-queried in
  this pass. `prompt` is neither a grant nor a recorded denial and does not prove
  the cited permission factory ran. Treat it as a reason to distinguish the gate,
  not as a confirmed cause. Even a Chrome admission-gate explanation would not
  explain why the OS failed to resolve Chrome's own generated names.
- A permission toggle and an approved update/relaunch were already tried without
  resolving this issue. Do not repeat resets, toggles or restarts as diagnostics.

Evidence: [candidate comparison](../tests/browser/results/candidate-comparison-2026-10-18.json)
and [effective policy](../tests/browser/results/chrome-effective-policy-2026-10-19.json).

## Source matched to the displayed version

The Chromium tag's [VERSION](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/chrome/VERSION)
reports 155.0.8059.85. Its [DEPS](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.85/DEPS)
pins WebRTC to `5bd86a2f17a35dfc986b87d058f511e45805bd1d`.
This matches the displayed version, not an attestation of shipped binary contents,
build flags, field trials or which factories are active at runtime.

In that revision:

- [`Port::MaybeObfuscateAddress`](https://webrtc.googlesource.com/src/+/5bd86a2f17a35dfc986b87d058f511e45805bd1d/p2p/base/port.cc#253)
  requests a name from the mDNS responder and publishes the hostname candidate
  through its callback. Callback completion does not prove another resolver can
  resolve the name.
- [`AddRemoteCandidate` and `ResolveHostnameCandidate`](https://webrtc.googlesource.com/src/+/5bd86a2f17a35dfc986b87d058f511e45805bd1d/p2p/base/p2p_transport_channel.cc#1188)
  can discard an older ICE generation, skip resolution based on candidate filters,
  or initiate an asynchronous resolver. A missing resolver factory is another exit.
- [`AddRemoteCandidateWithResult`](https://webrtc.googlesource.com/src/+/5bd86a2f17a35dfc986b87d058f511e45805bd1d/p2p/base/p2p_transport_channel.cc#1278)
  exits on resolution error/no address. On success it calls
  `CheckLocalNetworkAccessPermission`, rather than immediately creating pairs.
- [`CheckLocalNetworkAccessPermission` / `OnLocalNetworkAccessResult`](https://webrtc.googlesource.com/src/+/5bd86a2f17a35dfc986b87d058f511e45805bd1d/p2p/base/p2p_transport_channel.cc#1310)
  either bypass a permission query when unnecessary, or await a result. A
  non-granted result returns before `FinishAddingRemoteCandidate` creates
  connections. The repository does not prove this factory is active in this Mac's
  browser. This browser-level gate is distinct from the macOS application toggle.

These are discriminating hypotheses, not a diagnosis. A guessed Chromium Blink
adapter path returned 404; no platform-adapter implementation or runtime activation
was verified. The plan does not infer it from current-main source.

## Later live pass: budget and boundaries

Use only two owned disposable tabs in the existing Chrome profile, with dummy
identities, no media, no external ICE service, and a loopback-only controller.
Coordinate screen availability first. Do not reopen unrelated tabs, enumerate
browsing history, attach to other peer connections, restart Chrome or create a new
profile/process. Save startup source hashes and observer version. Use one native
pair initially; one Safari/Chrome comparison is optional only if the first run
establishes a new useful discriminator. Maximum two runs, 60 seconds per run,
10 minutes total including setup and cleanup. Stop on any unexpected permission
prompt, instrumentation error, missing ownership correlation or resource overrun.

Record at 2/8/12/30 seconds using monotonic elapsed time: fixed role and per-run
connection ordinal, candidate emitted/applied/rejected counts, MID/ufrag equality
booleans, end-of-candidates counts, ICE/RTC/data-channel states, remote-candidate
and pair counts, and allowlisted error categories. No raw SDP, ICE credentials,
keys, peer addresses, candidate strings, user URLs or unrelated console output
may be persisted. Candidate equality and generated-name correlation stay in memory.
OS resolver probes may emit local-link mDNS traffic; keep exact names transient,
probe only names emitted by these owned test connections, and retain only outcome,
family and elapsed time. Record explicit deduplication counts instead of inferring
that a missing record means a duplicate. Cap probes at four names and eight seconds
each; never substitute an address into a candidate or weaken mDNS privacy.

The missing discriminator is **inside the browser**. Before collecting a lower-level
trace, establish that a supported read-only diagnostic can restrict capture to the
two owned test connections and redact before persistence. Do not presume ordinary
JavaScript stats expose resolver callbacks or permission decisions. Global NetLog,
whole-profile WebRTC dumps, packet captures and raw process logs are outside this
plan: they can contain unrelated traffic, addresses or credentials. If safe scoping
is unavailable, stop and report that exact limitation; do not collect globally and
promise to sanitize afterward. No new extension, remote-debugging port, permission,
browser flag, native tracing process or persistent access is authorized by this plan.

If supported scoped diagnostics expose these events, retain only:

| Boundary | Safe discriminator | Interpretation |
|---|---|---|
| Candidate generation/filter | Current-generation and allowed-filter booleans | Distinguishes stale generation/filtering from resolution |
| Browser resolver | Started, completed, success/error/no-address and elapsed time | Distinguishes browser resolution from the independent OS lookup |
| Browser local-network gate | Factory/query present; bypassed/pending/granted/denied | Distinguishes permission gating after successful resolution |
| Candidate admission | Finish-add observed; pair count afterward | Distinguishes admission from later connectivity/pair formation |

A test-origin permission intervention would be a separate security-setting change
requiring explicit owner approval; it is outside this plan. It could discriminate
an admission-gate hypothesis but would not by itself prove the cause of both
candidate admission and generated-name resolution failures. In-scope observations
may leave that hypothesis unresolved.

Unavailable events remain **unknown**, not false. If the official sample is chosen
for new instrumentation, preserve its signaling/end-of-candidates behavior and
record its exact source revision; never describe a modified control as the untouched
official page. A same-profile result alone cannot establish an engine-wide defect.

## Cleanup and output

Stop only owned peer connections/WebSockets, clear dummy tab storage, close only
owned tabs, stop the owned controller and verify its listener is gone. State that
the screen is released. Save a bounded scalar result with source/fixture hashes,
completed/unavailable events, timeout and cleanup outcomes. No production fix is
justified until evidence identifies an HP2P defect. Cross-device comparison and a
clean-profile/new-process test remain separate work outside this pass.


## Safe-scoping checkpoint

On 2026-10-19 the connected Chrome extension documentation and advertised
capabilities were inspected without claiming/enumerating user tabs or opening a
Chrome diagnostic tab. Only tab console/DOM inspection and viewport/management
capabilities were exposed; no documented per-connection internal resolver/ICE trace
or isolated-profile capture was available. Safe scoping of an internal-page trace
was not established, so the plan stopped before a new runtime test. No global dump,
security intervention or new process was attempted. This records a limit of the
available supported route, not proof that every possible Chrome tool lacks such a
facility. The existing native and mDNS controls were not rerun.

## Isolated-process result and next discriminator

On 2026-10-19 an authorized temporary profile used the installed official Chrome
155.0.8059.85 binary, with `--enable-logging=stderr` and
`--vmodule=p2p_transport_channel=1`. An in-memory filter retained only fixed event
categories and elapsed times. There was no remote debugging, normal-profile
logging, security change, copied profile or extension installation. The owner
clicked Native trickle loopback once. The complete-SDP test was not run.

[The sanitized receipt](../tests/browser/results/chrome-isolated-2026-10-19.json)
records two browser resolver successes and two branches where a local-network
permission query was unnecessary. Both peers had connected ICE/RTC state, one
remote candidate and one pair at 2/8/12 seconds. One retained distinct-name OS
lookup resolved IPv4. The observer did not retain an explicit deduplication count.
Data-channel-open and dummy-frame-received markers were not retained, so this is
**connectivity evidence, not verified application delivery**.

The added inline readiness/click hook conflicted with the application's existing
`script-src 'self'`. This source/policy finding explains the absent callbacks;
a browser console CSP error was not captured. The original `testRan:false` field
only reflected that callback and must not override six independent snapshots.
The original receipt and launcher are preserved privately, with SHA-256 hashes
in the public result. The corrected hook is an external same-origin module;
regression checks verify unchanged CSP, asset availability, readiness failure,
duplicate-click prevention and conservative evidence labels. It has not been
rerun in a live browser.

The window disappeared because the operator explicitly requested cleanup after
reading the results. The post-click timer never started. The original generic
`owned_process_stopped` receipt is disambiguated by the retained stop action;
future cleanup labels distinguish these causes. Both owned processes exited,
the loopback listener closed and the temporary profile was removed. Normal Chrome
was untouched.

Only already available evidence supports this comparison:

| Observation | Earlier normal-profile runs | Disposable-profile run |
|---|---|---|
| Candidate API | Accepted one per peer | Accepted one per peer |
| Browser resolver | Internal events unavailable | Two successes |
| Permission processing | Historical query `prompt`; branch unknown | Query unnecessary for both candidates |
| Candidate statistics | Four local; zero remote/pairs | Two local; one remote/pair per peer |
| Host TCP statistics | Two local host TCP candidates | Zero local host TCP candidates |
| Exact generated-name OS lookup | Retained Chrome result failed | Retained result resolved IPv4 |
| Policy/configuration evidence | Effective policy UI empty; active flags only restart markers | Fresh profile; explicit diagnostic logging and first-run suppression flags |

The same installed version can connect in this environment. That narrows the
failure but does not isolate a profile setting, extension, permission, feature
trial, timing or network-interface selection as its cause. Fresh profiles still
share application-level OS permissions. No extension attribution or normal-profile
repair is justified by this comparison. The observations occurred at different
times, so a change over time is another possible explanation. `remoteApi` was zero
even in the connected isolated run; it cannot distinguish these outcomes. The
retained `remoteStats` and `pairs` fields do.

Claude Validator reviewed the supplied helper code, tests and sanitized evidence
without executing them. Its required correction was to acknowledge this temporal
confound explicitly; the result now does. Its source review found the CSP and
one-shot design consistent, while noting that the private process launcher was
outside its packet and the corrected hook still needs a live integration run.

**Smallest next discriminating test (not executed):** one owned disposable tab
in the existing normal Chrome process, using the same localhost origin, native
trickle fixture and candidate observer. Retain fixed channel-open and dummy-frame
receipt evidence as well as candidate counts. This first distinguishes a currently
reproducible normal-profile failure from a transient condition since the prior
runs. Do not repeat complete-SDP, change extensions/settings, restart normal
Chrome or collect its process logs. If it still fails while the fresh-profile
result remains the positive control, select one further hypothesis from evidence
before any intervention. Stop on a permission prompt. No new window or browser
test was launched during the background correction/review pass.
