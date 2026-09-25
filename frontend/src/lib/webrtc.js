// Minimal WHIP (publish) / WHEP (play) WebRTC helpers for Cloudflare Stream Live.
// The broadcaster pushes camera tracks via WHIP; viewers pull via WHEP.

async function negotiate(pc, url) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer.sdp,
  });
  if (!res.ok) throw new Error(`WebRTC negotiation failed (${res.status})`);
  const answer = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  const loc = res.headers.get("Location");
  return loc ? new URL(loc, url).toString() : null;
}

export async function whipPublish(whipUrl, stream) {
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach((t) => pc.addTransceiver(t, { direction: "sendonly" }));
  const session = await negotiate(pc, whipUrl);
  return { pc, session };
}

export async function whepPlay(whepUrl, videoEl) {
  const pc = new RTCPeerConnection();
  const remote = new MediaStream();
  videoEl.srcObject = remote;
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (e) => remote.addTrack(e.track);
  const session = await negotiate(pc, whepUrl);
  return { pc, session };
}

export async function endSession(session) {
  if (session) {
    try { await fetch(session, { method: "DELETE" }); } catch { /* noop */ }
  }
}
