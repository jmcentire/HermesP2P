# Local browser connectivity fixture

This manual test separates browser ICE connectivity from HP2P signalling. It uses
dummy text, no STUN/TURN servers, no media capture, and no permission requests or
security-setting changes. Only the mesh test contacts `ws://localhost:8787/ws`.
`tests/` is excluded from the production Docker image.

From the repository root, using the project's existing Python environment:

```sh
# Terminal 1: local hub, one worker because the registry is process-local.
.venv/bin/python -m gunicorn --bind 127.0.0.1:8787 --workers 1 --threads 16 --timeout 0 main:app
```

```sh
# Terminal 2: serve the fixture and its relative module import, locally only.
.venv/bin/python -m http.server 8788 --bind 127.0.0.1
```

Open `http://localhost:8788/tests/browser/connectivity.html`. Confirm the page and
run output both identify diagnostic version 3; reload after source changes. The
fixture module URL is versioned, and its mesh import uses a source-hash query
parameter to avoid stale diagnostic dependencies. Update that query when the
mesh source changes; it is cache identification, not runtime integrity checking. Run each button once:

1. **Native trickle loopback:** two browser peer connections exchange descriptions
   and candidates directly, without MeshTransport or the hub.
2. **Native complete-SDP loopback:** waits for gathering before exchanging the
   final descriptions, excluding trickle-delivery timing as a cause.
3. **Mesh through local hub:** two MeshTransport clients use the real WebSocket
   signalling relay. Dummy frames are sent only through direct data channels, so
   a received marker cannot be mistaken for relay delivery.

Only one run is allowed at a time. Stop, page navigation, errors, and the absolute
22-second deadline clean up sockets, peer connections, listeners, and timers.
Native candidate application stops after cleanup and is capped at 64 calls per
side. Gathering waits are bounded at five seconds and stats waits at one second. Stop
both local servers with Ctrl-C when finished. Do not expose the fixture server
outside localhost; it serves repository files.

Success requires a channel-open event and a dummy-frame-received marker. Record
the browser/OS version, test mode, result, and the safe pre-close snapshots at
two/eight seconds (mesh also at twelve seconds). Counts and states alone do not
prove application delivery. The fixture prints only fixed status vocabularies,
capped counts, candidate class/protocol, SDP-presence booleans and candidate-line
counts. Native trickle runs also count resolved/rejected `addIceCandidate` calls
and restrict error names to a fixed vocabulary. An accepted API call does not
prove candidate reachability or successful mDNS resolution. No candidate
strings, raw addresses, SDP, keys, routing IDs, or error messages are printed.
Do not collect or publish raw browser networking exports.

## Observed results on the development Mac

On 2026-10-18, Chrome native trickle and complete-SDP loopbacks reached stable signalling
and complete ICE gathering but stayed in ICE `new`, with no remote candidates or
candidate pairs in pre-close snapshots. The real-hub mesh also timed out.

After explicit owner approval, the verified test Chrome application's macOS
Local Network permission was enabled. One switch changed; duplicate Chrome rows
mirrored the app-scoped setting. Other applications' permissions were untouched.
Both native tests and the real-hub mesh were then rerun: all still failed, with
four local candidates, zero remote candidates and zero pairs. The mesh reported
zero direct sends. The browser's separate permission query still read `prompt`.

The owner then approved Chrome's pending update and relaunch. The new process
ran Chrome `155.0.8059.85` with the same profile and previously observed tab URLs.
All three fixtures were repeated without changes: the native tests still had
four local candidates, zero remote candidates/pairs and ICE `new` at two/eight
seconds; the mesh matched at two/eight/twelve seconds, sent zero direct frames,
timed out and cleaned up. The update/relaunch did not resolve the failure.

Instrumented native trickle runs recorded one attempted/resolved candidate API
call per side and zero rejections. Both final remote descriptions retained one
mDNS candidate. The complete-SDP test retained one mDNS candidate immediately
after each description was applied. Despite API acceptance and SDP retention,
ICE statistics still reported zero remote candidates/pairs; this does not prove
which later browser step failed. Instrumented mesh sends also remained zero.

Read-only checks found the system mDNS responder running and no Chrome firewall
application block. Dummy UDP loopback and the system resolver's lookup of the
machine's own `.local` hostname succeeded. These are baseline controls, not proof
that Chrome's generated ICE names are registered or resolvable. The next useful
isolation is that browser mDNS path versus another post-acceptance processing
failure. The Chrome failure's root cause remains unresolved.

The fixture never changes permissions, replaces mDNS candidates with addresses,
or adds external ICE services to force a connection. No firewall/router/browser
flag changes or external services were used in these reruns. Restarting an active
user's browser requires considering their work and obtaining approval.

### Safari comparison: local direct transport passed

The same unchanged version 3 fixture passed native trickle and actual mesh tests
in already-installed Safari 26.6.2 on the same Mac. Native ICE/RTC connected,
the channel opened, and the dummy frame was received. The real `MeshTransport`
pair used the local hub for signalling, connected both data channels, and each
peer received three direct dummy frames (one per send at two/eight/twelve
seconds). Both runs cleaned up normally. The complete-SDP mode was not run in
Safari; the requested minimal native and real-mesh comparison was sufficient.

No permissions, security settings, installation or restart were required. Only
the test tab and servers were closed afterward. This is a same-tab, same-Mac
transport smoke test, not a separate-tab or Chrome–Safari pair, cross-device/WAN
test, or proof
that the encrypted product UI uses the direct path correctly. The comparison
narrows the failing environment to the tested Chrome browser/session stack; it
does not establish an engine bug or identify mDNS as the cause. No low-level Chrome ICE/mDNS trace was captured.


## Separate browsing contexts (one-shot fixture v3)

Use the dedicated controller below **instead of either server above**. The sole
supported launch binds to loopback and patches data forwarding only in this
process. It imports the actual application hub and `MeshTransport`; it does not
modify their production source or settings. Stop it before starting another pair.

```sh
.venv/bin/python tests/browser/check_context_server.py
.venv/bin/python tests/browser/context_server.py
```

Open these URLs in two new tabs (two Safari tabs, then a fresh process with one
Safari tab and one Chrome tab):

- `http://localhost:8787/__test__/contexts.html?role=A`
- `http://localhost:8787/__test__/contexts.html?role=B`

Each page owns exactly one transport and one hub socket. The controller assigns
a fresh run token at process startup and one-time role credentials. Reusing a
role, joining a finished run, or reporting with a stale run is rejected. The
client also requires its own received counts and phase history before displaying
PASS. Restart the dedicated process for every pair, even after an interrupted
attempt; reload is deliberately not a new run.

Once both direct channels open, the controller disables only its application-data
forwarding while retaining actual hub signalling. Each peer sends two identical
dummy frames through WebRTC and one dummy WebSocket relay probe. Both direct
receipts and blocked probes from two distinct live hub connections are required.
Peer A then closes its transport and socket; B must observe A's old routing ID
absent from an actual hub roster. A reconnects with a new hub identity and both
peers repeat direct duplicate delivery while forwarding remains disabled.

A PASS requires exactly two received frames per peer before and after reconnect.
The transport intentionally passes identical frames to its callback; this is
**not** the authenticated product-message replay test. Those rules are covered
separately in the network/message unit tests. The fixture does not exercise the
product UI or its encryption pipeline. Tabs are separate JavaScript contexts;
process isolation is not measured.

The server verifies the imported mesh file's SHA-256 at startup. Its status route
reports that hash and aggregate counts only. Run/role credentials, routing IDs,
SDP, candidates, addresses and message contents are never logged. The import URL
hash remains cache identification, not browser subresource integrity. The fixture
allows only loopback clients with the expected Host and same-origin POSTs. It is
a controlled two-tab diagnostic, not an adversarial authentication service.

The pair deadline is 90 seconds after both reports arrive; each page has a
180-second absolute deadline and three-second controller-request limits. Stop,
navigation, failure and completion close owned connections and timers. Close
only the test tabs and terminate this server when finished. No external ICE
service, permission grant, profile reset, or browser restart is required by the
fixture. Seven controller checks cover stale/duplicate joins, request origin and
remote-address restrictions, missing/extra duplicate counts, incomplete disconnect
evidence, deadline failure, probe attribution, wrong-role credentials, and import isolation; CI runs these checks.

### Separate Safari result

The corrected v2 fixture and final v3 fixture passed on Safari 26.6.2 in two separate tabs on the same
Mac. Both peers opened channels and each received two identical dummy frames
before and two after A disconnected and rejoined. B observed the old routing ID
absent from the actual hub roster. The local hub recorded two blocked probes from
two distinct peers and stayed disabled for data forwarding. Both pages completed
cleanup. Reloading A after completion was rejected, demonstrating that a fresh
page could not inherit PASS. A preliminary v1 run also passed with a fresh server,
but the corrected runs supersede that evidence after Claude's stale-run,
source-hash and roster-observation review fixes. Final v3 also requires exactly
one remote roster peer and adds probe/role-attribution negative controls.
Production transport source was unchanged.


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
[`separate-contexts-2026-10-18.json`](results/separate-contexts-2026-10-18.json).
Original Safari/Chrome tabs were retained (9/29 respectively); all owned test tabs
and local test-server processes were closed afterward.
## Product UI and candidate diagnostics

These manual fixtures use foreground browser tabs. Coordinate screen availability
before running them; automated controller checks below require no browser.
Use one server at a time. All bind only to loopback and must never be deployed.

## Product UI pairs

```sh
python tests/browser/ui_server.py AB
```

Open `http://localhost:8787/__ui__/setup.html?role=A` and the same URL with `role=B`
in two disposable tabs. Click **Start disposable product client** in each. The
public test seeds are dummy credentials, never real identities. Configuration is
tab-local session storage. Product source files and crypto libraries must exactly
match the starting Git commit; `/__ui__/status` records their hashes and the
fixture hashes captured at startup.

Wait for one open direct channel in both clients, then use A's **Disable TEST hub
data forwarding** button. Both pages must show **DISABLED** before sending any
product messages. Recent client reports and exactly two hub sockets are required.
Reject an acceptance claim if either page reports a lost link or a send while
forwarding was enabled. Require a positive blocked-frame count at the hub as well
as actual received direct frames and displayed product messages.

Use the actual sidebar, message input and Send button:

- A → General: `accept-public-01`; replay twice, then send the fresh-ID tampered
  copy using the observer buttons. B should receive three valid raw public frames
  but show one copy, and receive an invalid frame without displaying the tampered
  text in General.
- A → SenderRoom: `accept-private-01`; B uses ReceiverRoom with the same key.
- A → Dummy Bobby: `accept-direct-01`; B selects Dummy Alice.
- B → Dummy Alice: `accept-reply-01`; A selects Dummy Bobby.

After the final send, inspect **every configured conversation** on each tab,
recording its header and token counts. The current counts are for the selected
conversation only; a zero without a recorded conversation is not negative proof.
No automatic PASS is issued. Replays exercise combined transport/application
suppression, not an isolated inner replay cache. The tamper probe checks public
envelope integrity, not private or direct ciphertext tampering.

Restart the dedicated server for each further pair: `AC` uses Carol's wrong
shared key, `AD` uses Delta's missing shared key. Open the corresponding role URL.
In each, send the private token to SenderRoom and a DM to **Dummy Bobby**, who is
absent. Require the active receiver to observe valid outer private/direct frames,
then inspect all its conversations for absence of plaintext. These browser
negative cases remain pending in the recorded partial run.

Stop the test connections and close only owned test tabs when screen use is
permitted, then stop the server. The observer also stops on controller failure,
page exit or its 15-minute deadline. It clears its dummy session storage and
closes owned connections; a stopped tab should be closed rather than reused.

## Exact generated-candidate comparison

```sh
python tests/browser/candidate_server.py
```

Open `http://localhost:8787/__diag__/connectivity.html?browser=chrome` (or
`browser=safari`) and run **Native trickle loopback** once per fresh page. For a
mixed pair use `/__test__/contexts.html?role=A&browser=safari` and
`/__test__/contexts.html?role=B&browser=chrome`.
The observer retains candidates only in memory, checks API acceptance and
MID/ufrag matching, and requests a bounded OS lookup of the exact generated
`.local` name while the peer connection is alive. Names travel only to the
loopback test server and via stdin to its resolver subprocess. Reports retain
only booleans, counts and address-family labels. The OS resolver may emit multicast
mDNS queries on the local link; names are deduplicated within each server run. `/__diag__/status` contains
sanitized observations. It does not establish the browser's resolver behavior.

Never rewrite candidates, disable privacy controls, grant media permissions or
add external ICE services to make this comparison pass. Stop owned test pages and
the server afterward. See `results/candidate-comparison-2026-10-18.json` for the
observed Chrome failure and Safari success; no root cause is established.

## Background-only controls

```sh
python tests/browser/check_ui_server.py
python tests/browser/check_candidate_server.py
node tests/browser/check_signature_control.mjs
```

These checks open no browsers or listening sockets. Resolver calls are mocked.
The mutation control removes signature verification only in an owned temporary
copy and proves the tamper probe distinguishes the original from that mutant.
