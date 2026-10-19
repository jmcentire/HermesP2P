# Validation scope and evidence

This revision was checked with executable Node tests, the installed Constrain and PACT mechanical validators, and actual local-model Advocate and Simulacrum reviews. These checks establish properties of the reference sandbox and the tested transport paths. They do not certify production anonymity, human attention, durable money handling, or safe distributed settlement.

## Reproduce the checks

From the repository root:

```sh
npm test
python -m pytest tests/test_relay.py
python3.14 contracts/privacy_sandbox/verify.py
```

The contract runner uses the installed **Constrain 0.5.0** and **PACT (`pact-agents`) 0.14.1** CLIs. It stages only the sandbox component in a temporary directory and does not start the historical provider-backed PACT pipeline. Its actual invocations are:

```sh
constrain validate
constrain boundary verify .constrain/artifacts/boundary_register.yaml --root .
pact validate .
pact boundary verify .
```

Constrain validates the manually authored artifacts and checks exact boundary identifiers against SHA-256-pinned source lines. PACT checks contract completeness, type references, decomposition/test metadata and the same source evidence. The runner also checks JavaScript syntax and verifies that test metadata references existing executable tests and declared contract functions. Node tests remain a separate behavioral gate.

The runner then deliberately modifies a temporary cited source and confirms that both Constrain and PACT reject the stale hash. A third negative control introduces an undefined PACT return type and confirms rejection. These changes affect temporary copies only.

The `.constrain` session is an import of authored public-ready artifacts, not a claim that a Constrain interview or LLM synthesis occurred. Source hashes must be recaptured only after reviewing the corresponding source changes; see [the sandbox contract instructions](../contracts/privacy_sandbox/README.md).

The final sandbox run passed **32 tests with zero failures**. Its contract run passed **26 function contracts, 29 boundary entries, 32 executable-test descriptions and all three negative controls**. These counts refer to the sandbox scope, not the complete transport suite.

## Named reviewer invocations

**Advocate 0.1.5** ran its actual `red_team` persona, using the existing local `gemma3:27b-it-q4_K_M` model through Ollama's OpenAI-compatible endpoint. **PACT's bundled Simulacrum** ran its actual specialist engine using the same local model through Ollama's Anthropic-compatible endpoint. No internal agent role was substituted for either tool. No external paid provider was called. The commands below show the routing; `review-packet.txt` is a review input containing the relevant public sandbox code and protocol contract.

```sh
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
OPENAI_API_KEY=local-ollama-placeholder \
advocate review review-packet.txt --provider openai \
  --model gemma3:27b-it-q4_K_M --persona red_team \
  --sequential --no-color --output advocate-review.json

ANTHROPIC_BASE_URL=http://127.0.0.1:11434 \
ANTHROPIC_API_KEY=local-ollama-placeholder \
SIMULACRUM_CLASSIFIER_MODEL=gemma3:27b-it-q4_K_M \
SIMULACRUM_SPECIALIST_MODEL=gemma3:27b-it-q4_K_M \
GENERALIST_MODEL= OPENAI_API_KEY= \
python3.14 -m pact.vendor.simulacrum < review-packet.txt
```

The placeholder keys above are nonsecret local compatibility values. These commands assume the named model is already installed and running locally; they do not install or download it.

The initial Advocate report alleged unchecked sums and operation-ID reuse; those particular claims were contradicted by the reviewed code. Claude Validator subsequently identified concrete **cross-signer operation-ID squatting and clock-rollback defects**. Those were substantive fixes: requests now use currency/action/signer/id namespaces, and both authority and application settlement paths enforce monotonic trusted time.

Both actual local reviewers were then rerun against the clarified economics: pending promises are not settled funds; failed optional superlikes reduce to ordinary likes; advertising proofs bind campaign, action, recipient and budget; and subscription tokens require verified settled ordinary credits. The full packet included all four sandbox modules and the public protocol document. A final supplemental pass reviewed the application clock guard added immediately after the first snapshot. [The final reviewed-source manifest](../contracts/privacy_sandbox/reviewed_sources.json) pins the exact sandbox source bytes covered by the combined passes. Its documentation entries separately record two later disclosure-only edits requested by Claude: product registration is trusted local setup, and the campaign boundary holds only through the advertiser-operated adapter.

The refreshed Advocate reports alleged an unbounded recipient set, budget overflow and a subscription capacity race. Code inspection showed that each inserted recipient requires one of at most 1,024 stored proofs, every budget sum is checked as a safe integer, and the capacity-check/redemption/update path has no asynchronous yield. Seven targeted regression tests passed. An additional runtime counterexample paid a campaign `Number.MAX_SAFE_INTEGER` units, returned the funds to its advertiser, and attempted one further unit: it rejected before monetary mutation. Time-source trust and multiple-instance behavior remain explicit limitations, rather than guarantees supplied by these checks.

Both refreshed Simulacrum passes reported no new actionable defect within the documented single-process, trusted-authority model. That is a local model's assessment, not a proof. No review establishes production durability, anonymity, human attention, real creator payouts or secure key delivery. The adapters return only dummy model outcomes; actual financial and authenticated delivery integrations remain absent.

## Remaining security limits

The dummy-credit authority is synchronous, trusted and in memory. It cannot promise crash recovery, durable idempotency, cross-replica finality or anonymous transfers. Public signing keys and provenance are linkable. Separately signed advertising credits prevent domain mixing in this sandbox, but recipient-supplied evidence does not establish viewing, humanity or attention; bots and collusion remain unresolved.

Publisher authentication and monthly encryption have distinct jobs. Group key holders can author symmetric envelopes; accepting a publisher-only message must additionally verify the configured publisher's signature and the complete inner/outer channel, month and message scope. Rotation does not erase previously disclosed keys or ciphertext. Payment negotiation, secure key delivery, recovery and revocation require further design.

## Transport and browser evidence

The complete local automated run passed **206 Vitest tests across six files**, **32 Node sandbox tests**, and **11 Python relay tests**. The transport tests mix focused mocks with real NaCl cryptography; mocks do not establish browser interoperability. Three temporary mutation controls removed sealed-message proof binding, signature verification, and credit conservation in turn. Each caused the corresponding behavioral test to fail. Original source was not mutated.

Two Chrome clients against the local Gunicorn relay exchanged public text, authenticated encrypted direct messages, and encrypted channel messages using different local channel names with the same key. The final scoped-signing version also delivered the shared-key channel message once. Configuration survived reload. These checks used generated test identities and no live funds.

Direct WebRTC did **not** connect in that local browser run. Offer, answer and ICE signalling reached both clients, but the 15-second negotiation timeout fired; relay delivery remained available. The later Safari comparisons below demonstrate a local host-candidate path, including separate tabs and reconnect. The mixed Safari–Chrome test failed; cross-device and WAN mesh delivery remain unverified. Aggregate timeout diagnostics are best effort and do not establish a root cause. No browser security policy, public STUN service or paid relay was introduced to bypass the result.

The Flask and static Pages website variants were checked at desktop and 390-pixel mobile widths; the existing logo assets are unchanged. The feature branch does not deploy either the Pages main-branch site or the relay.

The hub admits a new connection at capacity by replacing the connection least recently sending a new application frame. Closing happens outside the shared registry lock; evicted handlers cannot relay queued frames. Silent readers can therefore be evicted, and active Sybil churn remains an availability threat. This policy removes indefinite occupation by idle sockets without claiming identity-based fairness.


### Direct-connectivity isolation

A minimal native WebRTC loopback, with no HP2P or hub code, reproduced the failure using both trickled candidates and complete SDP exchanged after gathering. At two and eight seconds before cleanup, both peers had stable signalling, completed gathering, usable application SDP and SCTP, but ICE stayed `new`, with zero remote candidates or candidate pairs. The real-hub mesh probe showed the same pre-close result. This rules out HP2P signalling as a necessary cause of this particular failure; it does not prove the mesh works on another network.

The tested Chrome instance emitted host UDP candidates using mDNS and reported the browser local-network permission as `prompt`. Initially, macOS showed Chrome Local Network access off. The owner subsequently approved enabling it for the test Chrome application. The selected entry was verified against the running application's path before one switch was changed; macOS mirrored that app-scoped change across its duplicate Chrome rows. Other applications and network settings were not changed.

The approved rerun **did not resolve connectivity**. Both native loopbacks still had stable signalling, complete gathering, valid application SDP/SCTP, four local candidates, zero remote candidates and zero pairs at two/eight seconds. The actual HP2P mesh exchanged and applied offers, answers and ICE, but its two/eight/twelve-second snapshots remained the same; direct sends were zero and negotiation timed out. All three runs cleaned up normally. The browser permission query remained `prompt`, which is distinct from the enabled macOS application permission.

A later owner-approved Chrome update used the official **Relaunch to Update** action. The process changed and its running framework was verified as `155.0.8059.85`; the existing profile returned with all previously observed tab URLs. The same three fixtures then ran again without source changes. Both native runs still had four local candidates, zero remote candidates/pairs and ICE `new` at two/eight seconds. The mesh had the same counts at two/eight/twelve seconds, zero direct sends, a negotiation timeout and normal cleanup. No native channel-open or received-frame marker appeared. The update/relaunch therefore did not resolve the failure; stale state in the old browser process is not a sufficient explanation.

The test fixture was then instrumented with capped `addIceCandidate` attempted/resolved/rejected counts, allowlisted error names, and SDP candidate-line/mDNS counts. Its visible diagnostic version and module URL identify the loaded revision, because initial reloads continued running a cached script. In the instrumented native trickle run, each side applied one candidate with one resolved promise and zero rejections; later local/remote SDP each contained one mDNS candidate. Complete-SDP descriptions also each contained one mDNS candidate immediately after application. ICE statistics still showed no remote candidates or pairs. API acceptance and SDP retention therefore do not establish usable ICE connectivity or prove a particular mDNS failure. The instrumented mesh retained the same direct-send failure.

Additional local diagnostics found the system mDNS responder running. Dummy UDP loopback and resolution of the machine's own `.local` hostname succeeded. These controls establish only those OS paths; they do not establish that Chrome registers or resolves the generated mDNS ICE names. Read-only firewall inspection did not identify a Chrome application block. No raw hostnames, addresses or candidate strings were retained in the reports.

The Chrome failure's root cause remains unresolved, and these checks have not established a recoverable HP2P signalling defect. Chrome's generated mDNS candidate registration/resolution versus another post-acceptance candidate-processing failure remains a useful investigation. No lower-level browser ICE/mDNS trace was captured. No firewall rules, browser flags, router settings, media permissions or external ICE services were changed.

### Installed Safari comparison

The unchanged version 3 fixture was run in an existing **Safari 26.6.2** session on the same Mac, in one new test tab. The native trickle loopback accepted one candidate per side without rejection, reached connected ICE/RTC states, opened its data channel and received the dummy frame. It completed its normal cleanup.

The actual `MeshTransport` pair then used the real local WebSocket hub for signalling. Both direct channels connected. At two/eight/twelve seconds each peer reported one successful direct send and received the other peer's dummy frame: three received markers per peer. This fixture sends its dummy data only through WebRTC, so these markers cannot come from a WebSocket data fallback. It completed its normal cleanup. No new permissions, settings, installation or restart were needed. Only the test tab and temporary servers were closed; the original Safari tabs remained.

This earlier comparison demonstrates a **same-tab, same-Mac Safari direct-transport smoke test**. By itself it does not validate the encrypted product UI over that direct path, connections between separate tabs, a Chrome–Safari connection, cross-device/WAN delivery, NAT traversal, resilient mesh routing or anonymity. Safari's successful path means the failure is not universal to this fixture and Mac; it does not establish a Chrome engine defect or exclude browser-specific profile, permission, runtime or network-policy differences. The native accessibility view truncated long result text, so channel-open, received-frame and connection-state markers were verified visually; unobserved numeric ICE fields are not claimed.

Claude Validator reviewed successive source snapshots through a dedicated CLI session on the existing subscription. Its final transport review found the two availability defects fixed, and its final economics review found no critical or high defect within the explicit trusted, single-process sandbox boundary. It requested the two trust-boundary disclosures above. Claude inspected source; the executable checks reported here were run separately. Its follow-up reviews of the permission and update/relaunch reruns found no justified application-code correction from the observed native and HP2P failures. It recommended the additional candidate-application instrumentation above; the root cause remains unresolved.


### Separate-tab direct path and reconnect

The new `tests/browser/contexts.html` fixture creates one actual `MeshTransport`
per browsing context, with the application's real hub signalling. Its dedicated
loopback controller disables only that process's data forwarding after both data
channels open, then verifies direct duplicates, one peer's disconnect, actual
hub-roster removal, reconnect and another direct exchange. It has fresh per-process
run credentials, one-time role claims, local PASS evidence guards, startup source
hash enforcement, bounded deadlines and a loopback-only launch. Production
transport code and security settings are unchanged; test files are excluded from
the deployment image.

Final fixture v3 passed in **two separate Safari 26.6.2 tabs on one Mac**. Each
peer received exactly two identical dummy frames before and two after reconnect.
The hub blocked two probes from distinct live connections and kept application
data forwarding disabled. B observed A's old routing ID disappear from an actual
hub roster before A rejoined. Both pages displayed PASS from their own counts and
phase history and cleaned up. Reloading a completed v2 page was also explicitly
rejected rather than inheriting PASS. The final v3 adds a one-remote-peer guard;
seven automated controller checks pass and are included in CI.

These are transport-level duplicate receipts, not proof of product-message
replay suppression: `MeshTransport` delivers duplicates by design. The existing
network/message tests check authenticated replay behavior separately. This test
does not validate encrypted product UI delivery over the direct path, independent
Safari processes, other devices, NAT/WAN reachability, anonymity or mesh resilience.

Claude Validator reviewed actual v1, v2 and final v3 source snapshots. Its review
found and drove fixes to stale-run PASS reuse, source attribution, roster-removal
observation and probe attribution. The earlier v1 fresh-process Safari pass is
retained only as preliminary evidence; corrected v2 and final v3 runs are distinct.
All final test pairs use separate fresh server processes and run credentials.


### Final Safari–Chrome result (v3)

A fresh v3 process and fresh run/role credentials paired Safari 26.6.2 with
Chrome 155.0.8059.85 on the same Mac. Both pages reported a negotiation timeout,
then the 90-second pair deadline and cleanup. No direct channel opened; both
received counts stayed zero. Data forwarding remained enabled because the test
never reached its connected prerequisite. Thus the relay-off, duplicate-delivery
and reconnect stages are **not tested for this mixed pair**. Corrected v2 had the
same failure in its own fresh run. An earlier interrupted v1 mixed run remains
preliminary and is not counted as completed validation.

The mixed-browser root cause remains unresolved. No speculative production fix,
additional security permission, external ICE service, browser flag or extra device
was introduced. The seven fixture checks pass alongside the existing 206 Vitest,
32 Node sandbox and 11 Python relay tests. Claude's final source review reported
no blockers; it explicitly did not run the browser tests. The test reconnects one
peer once and does not establish that both offer directions occurred.

Safe aggregate evidence and source hashes are in
[`separate-contexts-2026-10-18.json`](../tests/browser/results/separate-contexts-2026-10-18.json).
Original Safari/Chrome tabs were retained (9/29 respectively); all owned test tabs
and local test-server processes were closed afterward.
### Exact generated-candidate comparison

A passive, test-only observer compared the generated candidate strings, successful
`addIceCandidate` calls, SDP MID/ufrag matching and ICE stats. A loopback controller
queried the OS resolver for the exact generated `.local` names while connections
were alive. Names, addresses, SDP and credentials were not retained in the result. The OS
resolver may query mDNS on the local link. Repeated names are deduplicated; the
native Chrome pair produced one retained distinct-name result.

In the native Chrome loopback, every emitted candidate was delivered and accepted:
one per peer, no rejections, matching MID/ufrag and one local/remote SDP candidate.
Chrome still reported zero remote candidates/pairs at 2/8/12 seconds. Four local
stats entries were two host UDP and two host TCP entries; the exposed candidate
count and native local-candidate API count were each one. The exact generated
Chrome name did not resolve through the OS probe. Safari's exact names resolved
to IPv4 and its native pair connected with one remote candidate and candidate pair.

In the mixed pair, the generated Safari name resolved and the generated Chrome
name did not. Both browsers accepted one remote candidate with matching MID/ufrag,
but neither formed a candidate pair. The bounded controller ended failed with no
direct frames. This supports investigating Chrome's mDNS registration/resolver or
later candidate-processing path; it does **not** identify a root cause. In
particular, Chrome also failed to admit Safari's OS-resolvable candidate, so
Chrome-name registration failure alone is not a complete explanation. Browser
policy, permission and resolver behavior remain distinct from the OS probe.

The official [WebRTC two-tab data-channel sample](https://webrtc.github.io/samples/src/content/datachannel/channel/)
also failed to produce a usable channel in the existing Chrome process. Its
source forwards the end-of-candidates marker. No precise duration or candidate
trace was recorded for that control. None of these observations justifies a
speculative production-code correction or a browser security bypass.

Sanitized observations are in
`tests/browser/results/candidate-comparison-2026-10-18.json`. Five background
controller checks cover origin, name/record restrictions, count limits, resolver
timeout and no raw-name persistence. The resolver is mocked in those tests.

### Initial encrypted product-UI acceptance (historical partial run)

The actual product client and crypto were loaded in two separate Safari 26.6.2
tabs using public deterministic dummy identities. Product sources and vendored
crypto hashes were pinned to commit `9dd2115a0c1a5d18cba5402afab5ce3131451a1a`.
Both direct channels opened before the dedicated test hub disabled data
forwarding. Product messages were submitted through the normal sidebar/input/Send
controls. The hub blocked five data frames; both observers reported zero sends
while forwarding was enabled and no observed link loss.

The following steps were observed by the operator through the native product UI
and observer panel. They are not per-step controller snapshots:

- B's General conversation showed one public post after receiving its original
  signed frame and two exact direct replays. This is combined transport/application
  replay suppression, not isolated proof of the inner replay cache.
- B received one invalid public frame with altered text, a fresh ID/current
  timestamp and the unchanged original signature. General did not display its
  tampered token. A background mutation control independently confirms the real
  verifier rejects this probe while a temporary signature-disabled copy accepts it.
- B decrypted the private post under ReceiverRoom using the same key that A used
  under SenderRoom. Different local labels did not prevent decryption.
- B decrypted A's direct message in the Dummy Alice conversation.

**This initial run was partial when paused.** The reply was attempted but not
verified. Wrong-key, missing-key, wrong-recipient checks and the final inspection
were completed in the resumed runs below. The observer's displayed
counts refer only to the currently selected conversation; later zero counts must
not erase earlier observations or be treated as proof of absence elsewhere.
Private/direct tampering, WAN delivery and anonymity were not tested.

A preliminary four-client attempt never satisfied the requirement of three open
direct channels at every client. It sent no product messages and kept data
forwarding enabled. Per-page periodic reports were not a synchronized topology
snapshot, and no connection/candidate trace was captured for that attempt; its
cause is unresolved. This does not establish an encryption defect or a generally
reliable four-peer mesh.

See `tests/browser/results/product-ui-partial-2026-10-19.json` for exact completed
and pending checks, selected conversations and the executed fixture hashes. Nine
background controller checks now reject stale, malformed, cross-origin and
incomplete readiness evidence. The result records executed and current fixture hashes separately; the observer
JavaScript is unchanged. The hardened controller was subsequently used in the resumed browser runs below. No automatic product-UI PASS is issued by the harness.

Claude Validator reviewed the current fixture source and sanitized observations in
a background CLI session. Its two evidence-labeling blockers were corrected; a
follow-up found no remaining publication blockers in the result files. Claude
did not run the browser tests or CI. The previously executed UI controller was
uncommitted and its original bytes were not retained; the result preserves its
hash and distinguishes the reproducible, subsequently hardened controller.


### Resumed product acceptance and four-client setup

The remaining enumerated same-Mac Safari product cases passed on 2026-10-19.
Fresh AB, AC and AD runs used the committed controller and observer from
`ea9c2df72d1377e582c2ba66b4a4ae6fd81474d5`, with unchanged product source hashes.
Every configured conversation was selected and inspected after the final send:

- The stopped initial AB tabs retained exactly the expected public/private/DM
  messages, with no tampered token anywhere. Their final history sweep does not
  imply that their intentionally stopped channels were still connected.
- In fresh AB, B's encrypted reply appeared once in A's Dummy Bobby conversation,
  and only in the corresponding sender conversation on B. The hub blocked two
  frames and both clients reported zero pre-disable sends or link loss.
- In fresh AC and AD, the wrong-key and missing-key clients each received one valid
  outer private frame and one valid direct frame addressed to absent Bobby.
  Every private/friend conversation remained empty. The public positive control
  appeared once in General. The hub blocked five frames in each run; both clients
  retained their direct channel with no observed link loss or pre-disable sends.

The operator attributed the earlier failed reply attempt to input focus; that
earlier cause was not separately reproduced, and no product defect was confirmed. The resumed interaction verified focus and the exact
text field value before sending. Sanitized controller snapshots and forty
operator-recorded conversation readings are in
`tests/browser/results/product-ui-resumed-2026-10-19.json`. Operator readings are
not automatically captured per-step controller records. Private/direct tampering,
cross-device/WAN behavior and anonymity remain untested.

One additional four-client setup run succeeded: all four Safari tabs reported
three open direct channels, and all 24 passive samples (twelve local connection
objects at 2 and 12 seconds) showed connected channels. The controller accepted
disabling its data relay. No application messages were sent in this setup-only
run, so it is not four-peer data-delivery acceptance. The earlier failed setup did
not reproduce; neither a cause nor a reliability fix is established. See
`tests/browser/results/four-peer-setup-2026-10-19.json` for source/fixture hashes and
counts. Three additional background checks validate this diagnostic's loader,
authentication, bounded scalar records and origin protection.

A read-only native-UI inspection of Chrome 155.0.8059.85's effective policy page
reported no Chrome, precedence, extension-install or displayed extension policies
set. Its active command line contained only two restart markers and empty
flag-switch delimiters. No displayed enterprise policy or WebRTC/network flag
explains the prior candidate failure. This does not establish a root cause or
inspect every browser-internal runtime state. Evidence is in
`tests/browser/results/chrome-effective-policy-2026-10-19.json`.

All owned test tabs and servers were closed, the original tabs were preserved,
and the screen was released. No production code, permissions or security settings
were changed for these resumed checks.


Claude Validator reviewed the resumed source and evidence without running the
browser tests. Its two publication-labeling blockers were corrected with an
explicit case/run/controller-hash map and retained-versus-executed fixture hashes.
Its follow-up found no remaining publication blockers; Claude did not independently
verify test execution or hash equality. The negative-party pairs do not claim
simultaneous delivery to the absent intended
recipient. All 274 automated checks passed locally after these additions.


### Background sealed-message tampering checks

The 2026-10-19 follow-up adds 24 real-crypto module checks. For both private
secretbox and direct box encryption, the unchanged positive control decrypts;
changed authentication-tag/body bits, truncated/empty ciphertext, changed first/
last nonce bits and short/long/empty nonces return no plaintext. The same original
payload still decrypts after each rejection.

Four of those checks exercise the real receive module with correctly signed outer
envelopes containing damaged ciphertext or a nonce bit flip. The known disposable
proof key keeps the outer signature valid, so rejection cannot be credited merely
to the envelope verifier. The same-ID original is then accepted once and its
repeat rejected. Network and traffic-panel dependencies are mocked, and DOM
rendering is absent. These are module-admission checks, **not live transport/UI
acceptance**. Receive rejection may occur at decryption, inner parsing or inner
verification; these four checks establish overall module rejection. Authentication
failure specifically is exercised by the direct decryptor checks and mutation
control. The direct-message `ephemeralPubKey` input, including small-order values,
is not mutated by these new tests.

A separate temporary-copy mutation control changes each decryptor's explicit
failed-authentication branch to return an unauthenticated sentinel. Four valid-length
bit-flip probes distinguish each mutant from the real decryptor; unchanged positives
still decrypt. This detects those two fail-open regressions, not every cryptographic
implementation defect. Malformed-length rejection is covered by the real-module
checks but is not claimed to kill these mutants. Product files are never modified.

The full background run passed 230 Vitest, 32 Node sandbox, 11 Python relay
and 24 controller tests, plus both mutation-control scripts (297 individual tests).
See [sealed-module results](../tests/sealed-tampering-results-2026-10-19.json) for
test/source hashes and exact scope.

No production crypto fix was required. The earlier completed public browser tamper
check remains distinct; private/direct ciphertext tampering over live transport/UI
is still pending. The [bounded Chrome diagnostic plan](chrome-diagnostic-plan.md)
uses the displayed version's source tag and pinned WebRTC revision, identifies a
possible browser-level local-network permission gate after name resolution, and
requires scoped/redacted evidence before any later live tracing. It was not executed.

### Standalone website framing and source history

The unsupported stack wording predates this review. Commit
[`999c70de`](https://github.com/jmcentire/HermesP2P/commit/999c70de22c7b23bceeefa152b730ca67a21bfd4),
2026-03-01, added it to both landing pages and README. Our initial October rewrite,
[`52dbc14a`](https://github.com/jmcentire/HermesP2P/commit/52dbc14a67ce952a309de69e08882a06d3e1c796),
already removed that section from this draft branch. It was not introduced by the
current revision, and the draft was not deployed.

A tracked-source and dependency-manifest/lockfile inspection found no use of
Signet, Agent-Safe, Tessera or BlindDB as a dependency or integration. At the March
commit, their names occurred only in the website/README cross-links. Both current
website variants now explicitly describe HermesP2P as standalone and label these
links **Related projects**, with no integration promise. README carries the same
scope. Existing logo bytes are unchanged. This copy correction was checked with
static HTML parsing and Flask's in-process test client; no browser or screen capture
was used, and visual layout was not rechecked in this background pass.


Claude Validator found no blockers in the sealed-message tests, mutation control,
Chrome plan or standalone copy. Its review did not execute tests or independently
verify source citations/history. Its precision suggestions are reflected above;
no permission-state observation is treated as proof of a root cause. Publication
remains a draft-branch change: the live Pages source is still `main:/docs` and this
pass performs no merge or deployment.
