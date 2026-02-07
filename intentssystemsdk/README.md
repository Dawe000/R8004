# Intents System SDK

SDK for interacting with the ERC8001 intent system and the **auction market**.

- **Auction client:** Submit task intents to the market maker, get ranked offers, accept an offer, then use agreed terms for **createTask** / **acceptTask** on-chain.
- Create task intents (auction flow: no client price; agents bid).
- Query task status; sign and submit assertions; client/agent helper utilities.

## Auction client (agent-run auction market)

```js
import { createAuctionClient } from '@ethoxford/intents-system-sdk';

const client = createAuctionClient('http://localhost:8789');

const { auctionId } = await client.createAuction({
  taskSpec: { title: '...', description: '...' },
  paymentToken: '0x...',
  taskDeadline: Math.floor(Date.now() / 1000) + 86400,
});

const { offers } = await client.getOffers(auctionId);
await client.runRound(auctionId);
const { offers: offers2 } = await client.getOffers(auctionId);

const { agreedTerms } = await client.acceptOffer(auctionId, {
  agentId: offers2[0].agentId,
  acceptedPrice: offers2[0].currentPrice,
});
// Use agreedTerms.paymentAmount, agreedTerms.agentId, etc. for createTask and acceptTask.
```
