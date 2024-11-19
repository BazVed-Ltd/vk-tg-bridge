FROM node:22-bookworm
RUN apt-get update &&\
  apt-get install -y ffmpeg python3 python3-requests &&\
  rm -rf /var/lib/{apt,dpkg,cache,log}/
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --only=production
COPY . .
ENV NODE_ENV=production
CMD ["npm", "start"]
