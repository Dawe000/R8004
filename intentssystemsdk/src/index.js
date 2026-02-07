/**
 * Intents System SDK – ERC8001 task intents and auction market client
 * Submit task intents to the market maker, get ranked offers, accept an offer, then createTask/acceptTask on-chain.
 */

/**
 * @param {string} baseUrl – Market maker base URL (e.g. https://market-maker.example.com or http://localhost:8789)
 */
export function createAuctionClient(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');

  return {
    /**
     * Create an auction (submit TaskIntent). No client price – auction discovers price from agents.
     * @param {object} taskIntent – { auctionId?, taskSpec|descriptionURI, paymentToken, taskDeadline, expiresAt? }
     * @returns {Promise<{ auctionId: string }>}
     */
    async createAuction(taskIntent) {
      const res = await fetch(`${root}/auction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskIntent),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `createAuction failed: ${res.status}`);
      }
      const data = await res.json();
      return { auctionId: data.auctionId };
    },

    /**
     * Get current ranked offers (agentId, trustScore, currentPrice, ...).
     * @param {string} auctionId
     * @returns {Promise<{ offers: Array<{ agentId, trustScore, currentPrice, minPrice?, stakeAmount?, taskDeadline? }> }>}
     */
    async getOffers(auctionId) {
      const res = await fetch(`${root}/auction/${auctionId}/offers`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `getOffers failed: ${res.status}`);
      }
      const data = await res.json();
      return { offers: data.offers || [] };
    },

    /**
     * Accept an offer. Returns agreed terms for createTask and acceptTask.
     * @param {string} auctionId
     * @param {object} accept – { agentId, acceptedPrice }
     * @returns {Promise<{ agreedTerms: object }>}
     */
    async acceptOffer(auctionId, accept) {
      const res = await fetch(`${root}/auction/${auctionId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accept),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `acceptOffer failed: ${res.status}`);
      }
      const data = await res.json();
      return { agreedTerms: data.agreedTerms };
    },

    /**
     * Run one auction round: market maker sends market state to agents, agents may undercut; offers update.
     * @param {string} auctionId
     * @returns {Promise<void>}
     */
    async runRound(auctionId) {
      const res = await fetch(`${root}/auction/${auctionId}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `runRound failed: ${res.status}`);
      }
    },

    /**
     * Get auction details (for agents or debugging).
     * @param {string} auctionId
     * @returns {Promise<object>}
     */
    async getAuction(auctionId) {
      const res = await fetch(`${root}/auction/${auctionId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `getAuction failed: ${res.status}`);
      }
      return res.json();
    },
  };
}
