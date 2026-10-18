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

On 2026-10-18, native trickle and complete-SDP loopbacks reached stable signalling
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
isolation is that browser mDNS path, or an independently controlled browser/device
comparison if authorized. The root cause and direct delivery remain unresolved.

The fixture never changes permissions, replaces mDNS candidates with addresses,
or adds external ICE services to force a connection. No firewall/router/browser
flag changes or external services were used in these reruns. Restarting an active
user's browser requires considering their work and obtaining approval.
