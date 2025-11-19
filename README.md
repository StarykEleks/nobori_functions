# AI Visibility Starter (MVP Monorepo)

Monorepo for a startup that measures brand visibility in AI responses (OpenAI, Anthropic, Google Gemini, Perplexity) and browser interfaces (optionally with Playwright).

## Packages and Applications

- **apps/web** — React app (dashboard, authentication, charts, run launches)
- **apps/api** — NestJS (REST API, BullMQ queues, AI integrations)
- **apps/worker** — Node/Nest worker (background task processing, AI calls, normalization)

## Quick Start

1. **Install Node.js 20+ and npm 9+**
2. **Clone the repository and install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment configuration:**
   - Copy `.env.example` to `.env` in the root directory and add your keys.

## Running All Apps Locally

Open separate terminals for each app and run:

### API (NestJS)
```bash
npm run --workspace=apps/api start:dev
```

### Web (Next.js)
```bash
npm run --workspace=apps/web dev
```

### Worker (Node/Nest)
```bash
npm run --workspace=apps/worker start:dev
```

> For more scripts and details, check each package's `README.md` or `package.json`.

## Notes
- All commands should be run from the monorepo root.
- Use `npm run --workspace=<package> <command>` to run scripts in a specific package.
- Make sure your `.env` file is properly configured for all services to work.


## How to deploy backend
### Dev
``bash
gcloud config set project nobori-d1
   bash scripts/deploy.sh dev
``   
### Prod (with protected SA & secrets already created)
``bash
gcloud config set project nobori-prod
bash scripts/deploy.sh prod
``
### Canary / gradual rollout on prod (optional)

Deploy a tagged revision then shift traffic:
```
# deploy new image with tag 'candidate' (no traffic yet)
gcloud run deploy nest-api \
  --image "$IMAGE_API" --region "$REGION" --tag candidate --no-traffic

# shift 10% to candidate
gcloud run services update-traffic nest-api --region "$REGION" \
  --to-tags candidate=10,latest=90

# later, shift 100% or roll back
gcloud run services update-traffic nest-api --region "$REGION" --to-tags candidate=100

```
