FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY services/news-scraper/package.json ./package.json
RUN npm install --omit=dev

COPY services/news-scraper/src ./src

CMD ["node", "src/index.mjs"]
