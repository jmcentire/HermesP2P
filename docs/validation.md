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
