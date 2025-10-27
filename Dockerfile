# syntax=docker/dockerfile:1

# 1. Base image
FROM node:20-alpine AS base

# 2. Set working directory
WORKDIR /app

# 3. Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 4. Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Python para los scripts que invoca Express
RUN apk add --no-cache python3 \
 && ln -sf /usr/bin/python3 /usr/bin/python

# 5. Copy application files
COPY . .

# 6. Set ownership
RUN chown -R appuser:appgroup /app

# 7. Switch to non-root user
USER appuser

# 8. Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# 9. Expose port
EXPOSE 8080

# 10. Start command
CMD ["npm", "start"]
