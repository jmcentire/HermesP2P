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
trial, timing or network-interface selection as its cause. A fresh profile alone
does not determine macOS permission attribution; launch context also matters.
No extension attribution or normal-profile
repair is justified by this comparison. The observations occurred at different
times, so a change over time is another possible explanation. `remoteApi` was zero
even in the connected isolated run; it cannot distinguish these outcomes. The
retained `remoteStats` and `pairs` fields do.

Claude Validator reviewed the supplied helper code, tests and sanitized evidence
without executing them. Its required correction was to acknowledge this temporal
confound explicitly; the result now does. Its source review found the CSP and
one-shot design consistent, while noting that the private process launcher was
outside its packet and the corrected hook still needs a live integration run.

**Next test proposed at that checkpoint (subsequently executed below):** one owned disposable tab
in the existing normal Chrome process, using the same localhost origin, native
trickle fixture and candidate observer. Retain fixed channel-open and dummy-frame
receipt evidence as well as candidate counts. This first distinguishes a currently
reproducible normal-profile failure from a transient condition since the prior
runs. Do not repeat complete-SDP, change extensions/settings, restart normal
Chrome or collect its process logs. If it still fails while the fresh-profile
result remains the positive control, select one further hypothesis from evidence
before any intervention. Stop on a permission prompt. No new window or browser
test was launched during the background correction/review pass.

## Normal-profile recheck after isolated success

One authorized native trickle run in an owned tab of the unchanged normal Chrome
process reproduced the failure. All five fixture source hashes matched the earlier
isolated run. Both peers accepted one candidate without rejection, retained matching
MID/ufrag and complete delivery, but stayed in ICE/RTC `new` at 2/8/12 seconds.
Each had four local candidates (two UDP and two TCP), zero remote candidates and
zero pairs. The one retained exact generated-name OS lookup failed.

The complete fixture result text contained its normal cleanup marker and neither
`native channel OPEN` nor `native dummy frame RECEIVED`. Unlike the isolated run,
these fixed delivery markers were checked explicitly. Both permission queries
reported `prompt`; this is not an observed permission denial or an internal gate
decision. No normal-profile process logging was collected.

See [the recheck receipt](../tests/browser/results/chrome-normal-recheck-2026-10-19.json).
The normal-failure / isolated-connectivity / normal-failure sequence strengthens
the environment association and confirms the failure is currently reproducible.
The runs remain sequential and differ in profile/process/runtime and launch
conditions, so time-varying factors and the original temporal confound are not
eliminated. No causal extension, setting, permission or engine defect is identified.

The fixture completed its normal native-run cleanup. The owned tab was closed;
all 29 original tab IDs remained, and no fixture tab remained. The final inventory
had one additional non-fixture tab, which was not inspected or changed. An explicit
operator stop then ended the owned controller; its PID and listener were verified
absent. The screen was released. No second browser run, settings change or Claude
memory-hook invocation occurred in this pass. Further hypothesis testing remains
separate work; this result does not justify a speculative product change.

## GUI-opened Guest control and launch-attribution limit

The next authorized single run opened Guest through the already-running Chrome
profile menu, then used the same native fixture. The main browser PID, official
binary path and command-line hash were identical before and with Guest open.
This was not another executor-launched Chrome process. Guest reproduced the
failure: accepted candidates, ICE/RTC `new`, zero remote candidates/pairs at
2/8/12 seconds, two UDP plus two TCP local candidates, and a failed retained
generated-name OS lookup. No channel-open or dummy-frame marker appeared.
Native accessibility truncated the long output; an owned-window screenshot
confirmed the normal cleanup marker and absence of those delivery markers.

[The Guest receipt](../tests/browser/results/chrome-guest-2026-10-19.json) keeps
controller snapshots separate from operator visual observations. Its cleanup
baseline is **31 normal tabs before and the same 31 IDs after**. The earlier
normal recheck had its own 29-tab baseline and a later additional non-fixture tab;
the counts describe different checkpoints. The owned Guest window and controller
were closed, the listener was absent, and the screen was released. No second run,
extension installation, sign-in, settings change or permission grant occurred.

A narrowly scoped read-only comparison found four stored WebRTC keys absent in
both normal-profile preference stores: IP handling, multiple routes, non-proxied
UDP and UDP port range. Six installed extension records had no declared or stored
active `privacy` API permission. That API permission is required for Chrome's
[WebRTC IP-handling control](https://developer.chrome.com/docs/extensions/reference/api/privacy#property-network-webRTCIPHandlingPolicy).
This is not a complete audit of extension effects or proof of runtime effective
preference values. No broad preference dump, browsing history or credential store
was read or published. HermesP2P must work without requiring an extension.

[Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
distinguishes Terminal/SSH-launched command-line tools and their children from
other app-responsible code. The observed executor ancestry was Python → shell →
Codex CLI → ChatGPT, so the Terminal/SSH exemption is **not established**. The
successful disposable process was already deleted before responsibility could
be recorded. Same-PID and parent-PID observations do not identify macOS responsible
code, and the WebRTC log's permission-query bypass is a separate browser-level
decision, not proof of an OS exemption.

No safe unprivileged responsible-code query was established. The local documented
`launchctl procinfo` facility requires root; it was not invoked. The documented
`ps` parent-process fields do not supply that attribution. No privileged access,
stack capture or broad OS logs were requested to fill this gap.

### Launch-route control — plan and completed result

| Control already performed | Result |
|---|---|
| Normal profile after official update/relaunch into a new browser process | Failed |
| Normal profile recheck in that GUI process | Failed |
| Guest opened in that same GUI browser process | Failed |
| Fresh disposable profile in a separate directly executor-launched process | Connected; application delivery unverified |
| Fresh disposable profile in a new LaunchServices-launched instance | Failed at retained 2/8-second samples; no delivery markers |

The following pre-run plan was executed once, with the result below.
Another ordinary restart is redundant: the official update/relaunch already
changed the main process and still failed. The smallest useful missing control
is **one fresh disposable-profile instance launched through macOS LaunchServices**,
using the same installed binary, fixture, origin and Chrome argument values as
the successful direct-executable launch (apart from the unique temporary path).
The installed `open` manual documents `-n` for a new application instance,
`--args` for application arguments and `--stdout`/`--stderr` redirection. This can
keep the existing normal Chrome process and tabs running. If matching the previous
diagnostic flags, direct stdout/stderr to `/dev/null`; do not persist raw logs.
Do not copy the normal profile, grant permissions or use remote debugging.

Expected cost is roughly **2–4 minutes**, one temporary Chrome window and a
12-second normal native run (22-second hard fixture limit). No paid service or
normal-browser restart is needed. The earlier separate-process targeting limit
means one owner click may be needed after the new fixture window is identified.
Verify the new main PID and matching arguments before interpreting the result,
then close only that instance and remove its dummy profile/controller.

This would test a documented launch-route difference while retaining a fresh
process/profile on both sides of the comparison. LaunchServices invocation by
the executor is **not proof of a different macOS responsible app**, and inherited
environment, helper attribution and time remain limitations. A failure would
show that fresh-process-plus-clean-profile is insufficient under that route;
a success would show that direct executor launch is not necessary for this
connectivity result. Neither result alone diagnoses macOS permission enforcement.
No additional browser action was taken during the subsequent reconciliation pass.


### Completed LaunchServices control (2026-10-19)

The [sanitized receipt](../tests/browser/results/chrome-launchservices-2026-10-19.json)
records a successful `open -n` invocation, a uniquely identified new main process
with the intended disposable profile and matched Chrome arguments, and acknowledged
page-ready and single-click callbacks. The corrected external readiness module ran
under the unchanged CSP. A same-origin external observer sent only three allowlisted
DOM marker categories; unknown categories and cross-origin requests were rejected
in the wrapper check. Eight existing telemetry checks also passed before launch.
The private original controller and receipt were archived byte-for-byte; their hashes
are published, with no personal profile paths, PIDs, raw logs or network identifiers.

Both peers accepted one candidate with no rejection, matching MID/ufrag and all
observed candidates delivered. At **2 and 8 seconds**, ICE/RTC remained `new`, local
stats contained two UDP and two TCP host candidates, and remote candidates/pairs
were zero. The retained exact generated-name OS lookup failed. The fixture's normal
cleanup callback arrived; neither channel-open nor dummy-frame callback arrived.
These callbacks are observed telemetry, not a guarantee that every event was delivered.
No permission-state query result or native resolver log category was retained in this
run. Browser stdout and stderr went directly to `/dev/null`.

**No 12-second snapshot was retained.** The independent observer schedules a sample
at 12 seconds and returns without posting if closed before or after asynchronous
`getStats()`. The native fixture schedules normal cleanup at 12 seconds after setup.
A cleanup/sample race is therefore plausible, but no timing trace was retained to
identify the exact reason. The missing sample is not evidence of success, failure,
App Nap or permission enforcement. Neither earlier receipts nor fixture bytes were
changed to fill the gap.

The fixture reported `cleanup: native run complete`. Separately, the controller
recorded `post_click_deadline`: its condition was more than 28 seconds since the
acknowledged click, checked every half-second. The precise stop timestamp was not
retained. It then terminated only the identified disposable main process, shut down
the loopback server, removed the temporary profile and verified original main PIDs
and command lines unchanged. No tab inventory was taken in this run, so the earlier
Guest tab-count proof must not be reused here. A subsequent read-only process/listener
check confirmed the controller and port 8787 listener absent; the original receipt
still matched its archive byte-for-byte. No further user action was required.

### Diagnosis and focused next step

The failure occurs in the native browser loopback without HP2P signalling or message
validation. Candidate API acceptance plus matching descriptions and zero pairs narrows
the observed failure to later browser host-candidate processing/reachability. Failed
exact-name OS lookup and earlier successful native resolver categories make the mDNS
path a useful lead. They do not identify its failing component. Chromium documents
its own [mDNS client and separate system-resolver source](https://chromium.googlesource.com/chromium/src/+/main/net/dns/README.md#MULTICAST_DNS);
an OS lookup is a corroborating probe, not a trace of Chrome's resolver. No native
Bonjour bottleneck, wrong virtual interface or extension cause is established.

Normal, Guest and fresh LaunchServices failures versus direct-executor connectivity
support a launch-context association. A clean profile/new main process alone is
insufficient. Responsible-code attribution, inherited environment, helper state,
log-consumer differences and time remain confounds. The browser LNA branch and macOS
privacy enforcement must remain separate hypotheses.

The next useful action is a **source-guided Chromium escalation packet**, using this
matrix, pinned fixture hashes, retained counters and cleanup limits. Ask the browser
maintainer to identify a connection-scoped, address-redacting instrumentation point
between accepted remote mDNS candidate, resolver result and pair creation. Review that
instrumentation before proposing any further runtime capture; do not repeat broad
restart/profile/extension experiments. This section and linked receipts are the draft
packet; no external issue or message has been sent.

Keep the product's bounded relay fallback and honest experimental-direct status.
Do not require an extension, request camera/microphone for text, expose host addresses
or disable privacy protections as a workaround. Production cross-network traversal
is a separate design/acceptance task: document metadata disclosure and verify the
selected host/server-reflexive/relay path with application encryption intact. This
host-only control does not justify adding public STUN/TURN servers or claiming WAN
readiness; no such configuration was added.
