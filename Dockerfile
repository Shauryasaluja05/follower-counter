FROM ghcr.io/puppeteer/puppeteer:21.6.1

USER root

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN chown -R pptruser:pptruser /app

USER pptruser

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000
CMD ["node", "server.js"]