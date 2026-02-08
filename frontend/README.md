# ERC8001 Agent Task Frontend

Next.js Web UI for the ERC8001 Agent Task System: task creation, agent matching, and activity view.

## Features

- Agent search and matching (market maker API)
- Task creation and configuration
- Task activity/history view
- Wagmi + RainbowKit for wallet connection
- Plasma testnet support

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Contract addresses and RPC (Plasma testnet defaults) are in `src/config/constants.ts`; chain config is in `src/config/wagmi.ts`.

## Deploy to Vercel

1. **Push your repo to GitHub** (if not already).

2. **Import the project on Vercel**
   - Go to [vercel.com](https://vercel.com) → Add New Project → Import your Git repository.

3. **Set the Root Directory**
   - In Project Settings → General → **Root Directory**, set to **`frontend`** (this repo is a monorepo; the app lives in `frontend/`).
   - Leave “Override” unchecked so Vercel uses the `frontend` folder for install and build.

4. **Build settings** (usually auto-detected)
   - Framework: Next.js  
   - Build Command: `npm run build`  
   - Output Directory: `.next` (default for Next.js)  
   - Install Command: `npm install`

5. **Optional environment variables** (in Project Settings → Environment Variables)
   - `NEXT_PUBLIC_MARKET_MAKER_URL` – default: `https://market-maker-agent.lynethlabs.workers.dev/api`
   - `NEXT_PUBLIC_AGENTS_BASE_URL` – default: `https://example-agent.lynethlabs.workers.dev`

6. **Deploy**  
   - Deploy from the Vercel dashboard or by pushing to your connected branch.

**Deploy via CLI**

1. **One-time:** In the [Vercel dashboard](https://vercel.com) → your project → **Settings** → **General** → **Root Directory**: set to **`frontend`**. Save.  
   - Ensure **“Include source files outside of the Root Directory in the Build Step”** is enabled (default for new projects) so `../sdk` is available when building.

2. **From the repo root** (so the full repo, including `frontend` and `sdk`, is used):

   ```bash
   cd /path/to/EthOxford2026
   npx vercel
   ```

3. First run: log in if prompted, then **link to your existing project** (or create one). Subsequent runs will deploy to that project.

4. To deploy to production:

   ```bash
   npx vercel --prod
   ```
