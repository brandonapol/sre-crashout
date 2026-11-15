FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src src
USER 1000:1000
CMD ["node", "src/server.js"]
