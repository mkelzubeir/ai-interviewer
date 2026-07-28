import { normalizeRealtimeEvent } from "./events";
import type { RealtimeCredential } from "./types";

export class RealtimeInterviewClient {
  private peer: RTCPeerConnection | null = null; private channel: RTCDataChannel | null = null; private stream: MediaStream | null = null; private audio: HTMLAudioElement | null = null;
  constructor(private readonly onEvent: (event: ReturnType<typeof normalizeRealtimeEvent>) => void, private readonly onState: (state: "connecting" | "connected" | "failed" | "closed") => void) {}
  async connect(credential: RealtimeCredential) {
    if (this.peer) throw new Error("Voice session already active");
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("This browser does not support voice interviews.");
    this.onState("connecting"); this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const peer = this.peer = new RTCPeerConnection(); this.audio = new Audio(); this.audio.autoplay = true;
    peer.ontrack = (event) => { if (this.audio) { this.audio.srcObject = event.streams[0]; void this.audio.play().catch(() => this.onEvent({ type: "error", message: "Audio playback was blocked. Interact with the page and retry." })); } };
    peer.onconnectionstatechange = () => { if (peer.connectionState === "connected") this.onState("connected"); if (["failed", "disconnected"].includes(peer.connectionState)) this.onState("failed"); if (peer.connectionState === "closed") this.onState("closed"); };
    this.stream.getTracks().forEach((track) => peer.addTrack(track, this.stream!)); this.channel = peer.createDataChannel("oai-events"); this.channel.onmessage = (event) => { try { this.onEvent(normalizeRealtimeEvent(JSON.parse(event.data))); } catch { this.onEvent({ type: "error", message: "Received an invalid realtime event." }); } };
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    const response = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${credential.value}`, "Content-Type": "application/sdp" }, body: offer.sdp }); if (!response.ok) throw new Error("WebRTC negotiation failed."); await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
  }
  setMuted(muted: boolean) { this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); }
  // Note: there is deliberately no manual commit. WebRTC microphone tracks are
  // committed by server VAD; sending input_audio_buffer.commit would target an
  // empty manually-appended buffer and can create a duplicate response.
  interrupt() { this.channel?.send(JSON.stringify({ type: "response.cancel" })); this.channel?.send(JSON.stringify({ type: "output_audio_buffer.clear" })); }
  close() { this.stream?.getTracks().forEach((track) => track.stop()); this.channel?.close(); this.peer?.close(); this.audio?.pause(); this.peer = null; this.channel = null; this.stream = null; this.audio = null; this.onState("closed"); }
}
