FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --only=production
COPY . .
ENV NODE_ENV=production
CMD ["npm", "start"]
