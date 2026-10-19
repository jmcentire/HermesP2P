# Bounded Chrome candidate diagnostic plan

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
