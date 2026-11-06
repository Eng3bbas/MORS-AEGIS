FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY ms02-connectors ./ms02-connectors
COPY ms05-analysis ./ms05-analysis
COPY ms09-agents ./ms09-agents
COPY public ./public
ENV HOST=0.0.0.0 PORT=4173 MORS_ALLOW_NETWORK_BIND=1
USER node
EXPOSE 4173
CMD ["node", "server.mjs"]
