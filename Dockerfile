FROM node:20-alpine

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости (используем install вместо ci для совместимости)
RUN npm install --omit=dev --legacy-peer-deps

# Копируем исходный код
COPY . .

# Используем non-root пользователь
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]

