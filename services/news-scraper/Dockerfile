FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY services/news-scraper/package.json services/news-scraper/package-lock.json ./
RUN npm ci --omit=dev

COPY services/news-scraper/src ./src

CMD ["node", "src/index.mjs"]
