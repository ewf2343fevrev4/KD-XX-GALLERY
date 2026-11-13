FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p storage/tryon/private

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
