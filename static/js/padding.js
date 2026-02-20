/**
 * Fixed-Size Message Padding Module
 *
 * Pads outgoing messages to canonical frame sizes to prevent traffic analysis.
 * Uses random fill bytes and a 2-byte big-endian length suffix.
 */

/** @type {readonly number[]} Canonical frame sizes in ascending order. */
export const FRAME_SIZES = Object.freeze([1024, 4096, 16384, 65536]);

/**
 * Pads a message to the smallest canonical frame size that fits
 * the message plus a 2-byte big-endian length suffix.
 * @param {Uint8Array} messageBytes - The raw message bytes to pad.
 * @returns {Uint8Array} A new Uint8Array of a canonical frame size.
 * @throws {RangeError} If messageBytes.length > 65534.
 */
export function padMessage(messageBytes) {
  const msgLen = messageBytes.length;

  if (msgLen > 65534) {
    throw new RangeError(
      'Message too large for any frame size: maximum payload is 65534 bytes'
    );
  }

  const needed = msgLen + 2;
  let frameSize;
  for (const size of FRAME_SIZES) {
    if (size >= needed) {
      frameSize = size;
      break;
    }
  }

  if (frameSize === undefined) {
    throw new RangeError(
      'Message too large for any frame size: maximum payload is 65534 bytes'
    );
  }

  const frame = new Uint8Array(frameSize);
  frame.set(messageBytes, 0);

  // Fill random padding between message end and length suffix
  const paddingStart = msgLen;
  const paddingEnd = frameSize - 2;
  if (paddingEnd > paddingStart) {
    const padding = frame.subarray(paddingStart, paddingEnd);
    crypto.getRandomValues(padding);
  }

  // Write original message length as big-endian uint16 in last 2 bytes
  frame[frameSize - 2] = (msgLen >> 8) & 0xFF;
  frame[frameSize - 1] = msgLen & 0xFF;

  return frame;
}

/**
 * Extracts the original message from a padded frame by reading the
 * big-endian uint16 length suffix from the last 2 bytes.
 * @param {Uint8Array} paddedBytes - A padded frame from padMessage.
 * @returns {Uint8Array} The original message bytes.
 * @throws {RangeError} If frame is too short or length is corrupted.
 */
export function unpadMessage(paddedBytes) {
  if (paddedBytes.length < 2) {
    throw new RangeError(
      'Padded frame too short: must be at least 2 bytes to contain the length suffix'
    );
  }

  const highByte = paddedBytes[paddedBytes.length - 2];
  const lowByte = paddedBytes[paddedBytes.length - 1];
  const msgLen = (highByte << 8) | lowByte;

  if (msgLen > paddedBytes.length - 2) {
    throw new RangeError(
      'Decoded message length exceeds available frame space — corrupted or invalid frame'
    );
  }

  return paddedBytes.slice(0, msgLen);
}
