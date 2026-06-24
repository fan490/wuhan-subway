FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源码和数据
COPY src/ ./src/
COPY data/ ./data/

EXPOSE 5000

CMD ["node", "src/index.js"]
