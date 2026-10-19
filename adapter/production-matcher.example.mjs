/**
 * Deployment-owned matcher example. Replace with a versioned, licensed road-graph
 * implementation; this file intentionally rejects rather than guessing.
 */
export default {
  resolve() {
    return { ok: false, reason: 'production-matcher-not-configured' };
  },
};
