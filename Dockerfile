FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.html styles.css server.js ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["npm", "start"]
