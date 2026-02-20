/**
 * TTL Enforcement Module
 *
 * Time-to-live stamping, expiry checking, and rebroadcast probability decay.
 */

/** @type {Readonly<{direct: number, private: number, public: number}>} */
const DEFAULT_TTLS = Object.freeze({
  direct: 300,
  private: 3600,
  public: 86400,
});

const BASE_REBROADCAST_PROBABILITY = 0.6;

/**
 * Parses a timestamp value into epoch milliseconds.
 * @param {string|number} ts - Epoch ms number or ISO date string.
 * @returns {number} Epoch milliseconds.
 */
export function parseTimestamp(ts) {
  if (typeof ts === 'number') {
    if (!Number.isFinite(ts)) {
      throw new Error('Invalid timestamp: expected number or string');
    }
    return ts;
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    if (Number.isNaN(parsed)) {
      throw new Error('Invalid timestamp: unparseable date string');
    }
    return parsed;
  }
  throw new Error('Invalid timestamp: expected number or string');
}

/**
 * Returns the default TTL in seconds for a given message type.
 * @param {'direct'|'private'|'public'} messageType
 * @returns {number} TTL in seconds.
 */
export function getDefaultTTL(messageType) {
  const ttl = DEFAULT_TTLS[messageType];
  if (ttl === undefined) {
    throw new Error(`Unknown message type: ${messageType}`);
  }
  return ttl;
}

/**
 * Checks whether a message has exceeded its TTL.
 * Fail-safe: returns true (expired) for any malformed input.
 * @param {{timestamp: string|number, ttl: number}} message
 * @returns {boolean}
 */
export function isExpired(message) {
  try {
    if (message == null || typeof message !== 'object') return true;
    if (message.timestamp == null || message.ttl == null) return true;
    if (typeof message.ttl !== 'number' || !Number.isFinite(message.ttl)) return true;
    const timestampMs = parseTimestamp(message.timestamp);
    const ageSeconds = Math.max(0, (Date.now() - timestampMs) / 1000);
    return ageSeconds >= message.ttl;
  } catch {
    return true;
  }
}

/**
 * Returns the number of seconds remaining before expiry, clamped to 0.
 * @param {{timestamp: string|number, ttl: number}} message
 * @returns {number}
 */
export function getRemainingTTL(message) {
  if (message.ttl == null || typeof message.ttl !== 'number') {
    throw new Error('message.ttl must be a number');
  }
  const timestampMs = parseTimestamp(message.timestamp);
  const ageSeconds = Math.max(0, (Date.now() - timestampMs) / 1000);
  return Math.max(0, message.ttl - ageSeconds);
}

/**
 * Computes rebroadcast probability with linear TTL decay.
 * Fail-safe: returns 0.0 on any error.
 * @param {{timestamp: string|number, ttl: number}} message
 * @returns {number} Probability between 0.0 and 0.6.
 */
export function getRebroadcastProbability(message) {
  try {
    if (message == null || typeof message !== 'object') return 0.0;
    if (typeof message.ttl !== 'number' || message.ttl <= 0) return 0.0;
    const remaining = getRemainingTTL(message);
    return BASE_REBROADCAST_PROBABILITY * (remaining / message.ttl);
  } catch {
    return 0.0;
  }
}

/**
 * Adds the ttl field to a message package based on message type.
 * Mutates in-place and returns the same reference.
 * @param {Object} messagePackage
 * @param {'direct'|'private'|'public'} messageType
 * @returns {Object} The same messagePackage with ttl added.
 */
export function stampTTL(messagePackage, messageType) {
  messagePackage.ttl = getDefaultTTL(messageType);
  return messagePackage;
}
