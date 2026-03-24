FROM python:3.13-slim

WORKDIR /app

# Install mcp-agent-mail
RUN pip install --no-cache-dir mcp-agent-mail

# Create data directory
RUN mkdir -p /app/data/archive

EXPOSE 8765

CMD ["python", "-m", "mcp_agent_mail.cli", "serve-http", "--host", "0.0.0.0", "--port", "8765"]
