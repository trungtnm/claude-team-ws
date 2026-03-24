FROM oven/bun:latest

WORKDIR /app

# Install cm globally
RUN bun install -g cass-memory

# Create directories
RUN mkdir -p /root/.cass-memory /workspace/.cass

EXPOSE 9900

CMD ["cm", "serve", "--port", "9900", "--host", "0.0.0.0"]
