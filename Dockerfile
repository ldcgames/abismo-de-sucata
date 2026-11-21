# Imagem do servidor (serve o jogo + WebSocket). Funciona em Fly.io, Railway, VPS etc.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server ./server
COPY shared ./shared
COPY client ./client
ENV PORT=8080 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server/server.js"]
