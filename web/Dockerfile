# AgriLink web app. Debian-based Node (glibc) because onnxruntime-node ships native binaries,
# and Node 24 so the MongoDB seed script can import the TypeScript embedding module directly.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Download the embedding model once at build time so containers start offline.
RUN node --input-type=module -e "const { embed } = await import('./src/lib/embed.ts'); await embed('warm up');"

# The Mongo client is created at import time; it connects lazily, so a placeholder URI is enough to build.
RUN MONGODB_URI=mongodb://build-placeholder:27017 npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
