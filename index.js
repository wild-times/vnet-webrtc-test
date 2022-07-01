import './style.css';
let localName = '';

// from https://github.com/wild-times/vnet-signal
const signalServerUrl = (code) => `ws://${window.location.hostname}:8000/sig/chn/${code}/`;

const signalTypes = {
    SIGNAL_CONNECTED: 'signal_connected',
    SIGNAL_DISCONNECTED: 'signal_disconnected',
    OFFER: 'offer',
    ANSWER: 'answer',
    CANDIDATE: 'candidate'
};


function signaling (url) {
    const socket = new WebSocket(url);
    socket.onopen = () => document.getElementById('sig-status').innerText = 'CONNECTED';
    socket.onclose = () => document.getElementById('sig-status').innerText = 'DISCONNECTED';
    return socket;
}

function buildVideo (stream, home) {
    const exists = [...home.children].find((child) => child.id === stream.id);

    if (!exists) {
        const videoEl = document.createElement('video');
        videoEl.id = stream.id;
        videoEl.autoplay = true;
        videoEl.srcObject = stream;
        home.appendChild(videoEl);
    }
}


async function localsStream (localName = '') {
    const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
        peerIdentity: localName
    });
    buildVideo(media, document.getElementById('me'));
    return media;
}


async function makePeerConn (signal, stream, b = false) {
       const conn = new RTCPeerConnection();
       stream.getTracks().forEach((track) => conn.addTrack(track, stream));

       conn.addEventListener('connectionstatechange', () => {
           if (conn.connectionState === 'connected') {
               signal.close();
           }
       });

       // send candidates
       conn.addEventListener('icecandidate', (event_) => {
           if (event_.candidate) {
               // send candidates
               signal.send(JSON.stringify({
                   'type': signalTypes.CANDIDATE,
                   'content': event_.candidate,
                   'name': localName
               }));
           }
       });

       // add tracks
        conn.addEventListener('track', (event_) => {
            buildVideo(event_.streams[0], document.getElementById('others'))
        });

        if (b) {
            // send offer on negotiation
            conn.addEventListener('negotiationneeded', async () => {
                await conn.setLocalDescription(await conn.createOffer());

                // send offer
                signal.send(JSON.stringify({
                    type: signalTypes.OFFER,
                    content: conn.localDescription,
                    name: localName
                }));
            });
        }

        // listen for other (answer, candidates)
        signal.addEventListener('message', async (event_) => {
            const data = JSON.parse(event_.data);

            if (data.sent_by !== localName) {
                if (data.type === signalTypes.OFFER && !b) {
                    await conn.setRemoteDescription(new RTCSessionDescription(data.description));
                    await conn.setLocalDescription(await conn.createAnswer());

                    // send answer
                    signal.send(JSON.stringify({
                        type: signalTypes.ANSWER,
                        content: conn.localDescription,
                        name: localName
                    }));
                }

                if (data.type === signalTypes.ANSWER) {
                    await conn.setRemoteDescription(new RTCSessionDescription(data.description));
                }

                if (data.type === signalTypes.CANDIDATE) {
                    await conn.addIceCandidate(new RTCIceCandidate(data.candidates));
                }
            }
        });

}

document.forms['name-form'].addEventListener('submit', (event_) => {
    event_.preventDefault();
    const f = new FormData(event_.target);
    [...event_.target].forEach((i) => i.disabled = true);
    localName = f.get('cl-name');

    if (localName) {
        localsStream(localName).then((stream) => {
            // start
            document.getElementById('gen').addEventListener('click', (event_) => {
                event_.target.disabled = true;
                const code = Math.floor(Math.random() * (1000000 - 100000 + 1) + 100000);
                document.getElementById('code').innerText = code.toString();
                const sig = signalServerUrl(code);
                const sc = signaling(sig);

                // create peer connection
                sc.addEventListener('message', async (event_) => {
                    const data = JSON.parse(event_.data);

                    if (data.type === "signal_connected" && data.peers_count === 2) {
                        await makePeerConn(sc, stream, true);
                    }
                });
            });

            // join
            document.forms['join'].addEventListener('submit', async (event_) => {
                event_.preventDefault();
                const f = new FormData(event_.target);
                const code = f.get('join-code');
                [...event_.target].forEach((input) => input.disabled = true);
                const sig = signalServerUrl(code);
                const sc = signaling(sig);

                await makePeerConn(sc, stream);
            });
        });
    }
});


