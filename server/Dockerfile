FROM node:18-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY server.js ./
COPY public ./public
EXPOSE 8080
CMD ["node", "server.js"]
