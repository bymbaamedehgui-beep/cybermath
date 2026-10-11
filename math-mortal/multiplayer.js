let peer = null;
let channel = null;
let role = 'none';
let initialized = false;
const $ = id => document.getElementById(id);

function setConnectionStatus(text) {
  const status = $('connection-status');
  if (status) status.textContent = text;
  window.dispatchEvent(new CustomEvent('arena:peer-status', { detail: { role, text } }));
}

function emitNetworkMessage(message) {
  window.dispatchEvent(new CustomEvent('arena:network-message', { detail: message }));
}

function send(message) {
  if (channel?.readyState !== 'open') return false;
  try { channel.send(JSON.stringify(message)); return true; } catch { return false; }
}

function attachChannel(nextChannel) {
  channel = nextChannel;
  channel.addEventListener('open', () => {
    setConnectionStatus(role === 'host' ? 'Холбогдлоо · та өрөөний эзэн.' : 'Холбогдлоо · хамтрагч орлоо.');
    window.dispatchEvent(new CustomEvent('arena:peer-connected', { detail: { role } }));
    if (role === 'guest') send({ type: 'request-state' });
  });
  channel.addEventListener('close', () => {
    setConnectionStatus('Холболт тасарлаа. Дахин холбогдохын тулд өрөөг дахин үүсгэнэ үү.');
    window.dispatchEvent(new CustomEvent('arena:peer-disconnected'));
  });
  channel.addEventListener('error', () => setConnectionStatus('Өгөгдлийн сувагт алдаа гарлаа.'));
  channel.addEventListener('message', event => {
    try { emitNetworkMessage(JSON.parse(event.data)); }
    catch { setConnectionStatus('Хүлээн авсан мессежийг уншиж чадсангүй.'); }
  });
}

function createPeer(nextRole) {
  if (peer) peer.close();
  peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  role = nextRole;
  peer.addEventListener('connectionstatechange', () => {
    if (peer?.connectionState === 'failed') setConnectionStatus('Холболт амжилтгүй. SDP кодоо дахин солилцоод үзнэ үү.');
    else if (peer?.connectionState === 'disconnected') setConnectionStatus('Холболт түр тасарлаа…');
  });
  return peer;
}

function waitForIceGathering(connection) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      connection.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timeout);
      resolve();
    };
    const onChange = () => { if (connection.iceGatheringState === 'complete') done(); };
    const timeout = setTimeout(done, 12000);
    connection.addEventListener('icegatheringstatechange', onChange);
  });
}

function readDescription(text) {
  const parsed = JSON.parse(text.trim());
  if (!parsed || !['offer', 'answer'].includes(parsed.type) || !parsed.sdp) throw new Error('SDP код буруу байна. Бүтэн урилгыг хуулна уу.');
  return parsed;
}

export function initMultiplayer() {
  if (initialized) return;
  initialized = true;
  const panel = $('connection-panel');
  $('connection-toggle')?.addEventListener('click', () => {
    if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  });
  $('connection-close')?.addEventListener('click', () => { if (panel) panel.style.display = 'none'; });

  $('create-room')?.addEventListener('click', async () => {
    try {
      if (!window.RTCPeerConnection) throw new Error('Энэ браузер WebRTC холболт дэмжихгүй байна.');
      const connection = createPeer('host');
      attachChannel(connection.createDataChannel('arena-fighter', { ordered: true }));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      setConnectionStatus('Урилга үүсгэж байна… ICE бэлэн болтол түр хүлээнэ үү.');
      await waitForIceGathering(connection);
      $('connection-output').value = JSON.stringify(connection.localDescription);
      setConnectionStatus('Урилгаа найздаа илгээ. Түүний хариуг доод талбарт оруулаад батална уу.');
    } catch (error) { setConnectionStatus(error.message || 'Өрөө үүсгэж чадсангүй.'); }
  });

  $('join-room')?.addEventListener('click', async () => {
    try {
      if (!window.RTCPeerConnection) throw new Error('Энэ браузер WebRTC холболт дэмжихгүй байна.');
      const offer = readDescription($('connection-input')?.value || '');
      const connection = createPeer('guest');
      connection.addEventListener('datachannel', event => attachChannel(event.channel));
      await connection.setRemoteDescription(offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      setConnectionStatus('Хариу үүсгэж байна… ICE бэлэн болтол түр хүлээнэ үү.');
      await waitForIceGathering(connection);
      $('connection-output').value = JSON.stringify(connection.localDescription);
      setConnectionStatus('Хариу кодоо өрөөний эзэнд илгээнэ үү.');
    } catch (error) { setConnectionStatus(error.message || 'Өрөөнд нэгдэж чадсангүй.'); }
  });

  $('complete-room')?.addEventListener('click', async () => {
    try {
      if (!peer || role !== 'host') throw new Error('Эхлээд өрөө үүсгэнэ үү.');
      const answer = readDescription($('connection-input')?.value || '');
      if (answer.type !== 'answer') throw new Error('Энд зочны хариу кодыг оруулна уу.');
      await peer.setRemoteDescription(answer);
      setConnectionStatus('Хариу батлагдлаа. Peer холбогдохыг хүлээж байна…');
    } catch (error) { setConnectionStatus(error.message || 'Хариуг холбож чадсангүй.'); }
  });

  $('copy-sdp')?.addEventListener('click', async () => {
    const output = $('connection-output');
    if (!output?.value) return setConnectionStatus('Хуулах код одоогоор алга.');
    try { await navigator.clipboard.writeText(output.value); setConnectionStatus('Код clipboard-д хуулагдлаа.'); }
    catch { output.focus(); output.select(); setConnectionStatus('Кодыг сонголоо · Ctrl+C дарж хуулна уу.'); }
  });

  window.ArenaMultiplayer = {
    send,
    get role() { return role; },
    get connected() { return channel?.readyState === 'open'; },
  };
}
