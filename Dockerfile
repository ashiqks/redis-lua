FROM node:alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose API port
EXPOSE 3000

# Use a simplified startup command
CMD ["node", "src/index.js"]
