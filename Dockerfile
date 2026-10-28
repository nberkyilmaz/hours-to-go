# The API, as Render runs it. The page is not in here: GitHub Pages serves it.
#
# The server runs the TypeScript sources with tsx, as it does on a laptop, so there is no build
# step. It needs only server/ and the logbook model it shares with the page.

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src/model ./src/model

# Run as the unprivileged user the base image provides. Nothing is written to disk: the
# database is Postgres, named by DATABASE_URL.
USER node

# The host sets PORT; this is the default for running the image yourself.
ENV PORT=8787
EXPOSE 8787

# One process, so the host's stop signal reaches the server (npx would sit in between).
CMD ["node", "--import", "tsx", "server/main.ts"]
