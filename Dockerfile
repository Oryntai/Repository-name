FROM node:20-slim

WORKDIR /app

# Install frontend dependencies and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --production

COPY server/ ./server/

# Copy static assets (sound effects etc.)
COPY ceeday-huh-sound-effect.mp3 ./ceeday-huh-sound-effect.mp3

EXPOSE 8080

ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "server/src/index.js"]
