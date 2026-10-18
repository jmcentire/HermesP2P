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

Open `http://localhost:8788/tests/browser/connectivity.html`. Run each button once:

1. **Native trickle loopback:** two browser peer connections exchange descriptions
   and candidates directly, without MeshTransport or the hub.
2. **Native complete-SDP loopback:** waits for gathering before exchanging the
   final descriptions, excluding trickle-delivery timing as a cause.
3. **Mesh through local hub:** two MeshTransport clients use the real WebSocket
   signalling relay. Dummy frames are sent only through direct data channels, so
   a received marker cannot be mistaken for relay delivery.

Only one run is allowed at a time. Stop, page navigation, errors, and the absolute
22-second deadline clean up sockets, peer connections, listeners, and timers.
Gathering waits are bounded at five seconds and stats waits at one second. Stop
both local servers with Ctrl-C when finished. Do not expose the fixture server
outside localhost; it serves repository files.

Success requires a channel-open event and a dummy-frame-received marker. Record
the browser/OS version, test mode, result, and the safe pre-close snapshots at
two/eight seconds (mesh also at twelve seconds). Counts and states alone do not
prove application delivery. The fixture prints only fixed status vocabularies,
capped counts, candidate class/protocol, and SDP-presence booleans; no candidate
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

This reproduces failure without HP2P signalling but does not identify the root
cause. Enabling the OS permission did not prove or fix the cause. A fresh browser
process or another test device is the next useful isolation step; do not restart
an active user's browser without considering their work and obtaining approval.
The fixture never changes permissions, replaces mDNS candidates with addresses,
or adds external ICE services to force a connection. No firewall/router/browser
flag changes or external services were used in this rerun.
