// -----------------------------------------------------------------------------
// A fake Broadlink device listening on 127.0.0.1 (random UDP port).
//
// It implements the device side of the protocol: hello answers, the
// authentication handshake and encrypted commands. What a command answers is
// decided by the test through `onCommand(packetType, payload)`, which returns
// the clear answer payload, or `{ error: code }` to simulate a device error.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import {
  INITIAL_KEY,
  PACKET_TYPES,
  checksum,
  decrypt,
  encrypt,
  padPayload,
} from '../../src/broadlink/protocol.js';

export const SESSION_KEY = Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex');
export const SESSION_ID = 0x0badcafe;

/** Hello answer, as a real device sends it. */
export function buildHelloAnswer({ mac, devtype, name = '', locked = false }) {
  const answer = Buffer.alloc(0x80);
  answer.writeUInt16LE(devtype, 0x34);
  Buffer.from(mac, 'hex').reverse().copy(answer, 0x3a);
  answer.write(name, 0x40, 'utf8');
  answer[0x7f] = locked ? 1 : 0;
  return answer;
}

export async function startFakeDevice({
  mac,
  devtype,
  name = '',
  onCommand = () => Buffer.alloc(16),
}) {
  const socket = dgram.createSocket('udp4');
  const received = []; // { packetType, payload } of every encrypted command
  let key = INITIAL_KEY;
  let authCount = 0;
  let expired = false;

  function answer(request, errorCode, payload, rinfo) {
    const header = Buffer.from(request.subarray(0, 0x38));
    header.writeInt16LE(errorCode, 0x22);
    header.writeUInt16LE(0, 0x20);
    const packet = Buffer.concat([
      header,
      payload ? encrypt(key, padPayload(payload)) : Buffer.alloc(0),
    ]);
    packet.writeUInt16LE(checksum(packet), 0x20);
    socket.send(packet, rinfo.port, rinfo.address);
  }

  socket.on('message', (message, rinfo) => {
    // Hello (discovery) packet.
    if (message.length === 0x30 && message[0x26] === PACKET_TYPES.HELLO) {
      socket.send(buildHelloAnswer({ mac, devtype, name }), rinfo.port, rinfo.address);
      return;
    }

    const packetType = message.readUInt16LE(0x26);
    if (packetType === PACKET_TYPES.AUTH) {
      // The auth request is always encrypted with the initial key.
      key = INITIAL_KEY;
      authCount += 1;
      const session = Buffer.alloc(0x14);
      session.writeUInt32LE(SESSION_ID, 0);
      SESSION_KEY.copy(session, 4);
      answer(message, 0, session, rinfo);
      key = SESSION_KEY;
      return;
    }

    if (expired) {
      // "Control key is expired": the client must authenticate again.
      expired = false;
      answer(message, -7, null, rinfo);
      return;
    }

    const payload = decrypt(key, message.subarray(0x38));
    received.push({ packetType, payload, id: message.readUInt32LE(0x30) });
    const result = onCommand(packetType, payload);
    if (result && result.error) {
      answer(message, result.error, null, rinfo);
    } else {
      answer(message, 0, result ?? Buffer.alloc(16), rinfo);
    }
  });

  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));

  return {
    port: socket.address().port,
    received,
    get authCount() {
      return authCount;
    },
    /** Refuse the next command with "control key expired", like a rebooted device. */
    expireSession() {
      expired = true;
    },
    close: () => new Promise((resolve) => socket.close(resolve)),
  };
}
