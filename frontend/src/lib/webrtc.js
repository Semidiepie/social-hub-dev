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

// Cloudflare Stream Live needs a video track to initialise its transcode /
// playback pipeline — an audio-only WHIP ingest produces no playable output,
// so viewers of an "audio only" live hear nothing. For audio rooms we publish
// the mic audio alongside a lightweight black placeholder video track. Viewers
// only ever see the pulsing avatar UI; the black frame is hidden.
export function withPlaceholderVideo(audioStream) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  const paint = () => { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  paint();
  const timer = setInterval(paint, 1000); // keep frames flowing across browsers
  const canvasStream = canvas.captureStream(10);
  const videoTrack = canvasStream.getVideoTracks()[0];
  const combined = new MediaStream([videoTrack, ...audioStream.getAudioTracks()]);
  const stop = () => { clearInterval(timer); try { videoTrack.stop(); } catch { /* noop */ } };
  return { stream: combined, stop };
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
