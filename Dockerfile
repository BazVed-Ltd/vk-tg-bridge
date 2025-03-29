FROM node:22-bookworm

# Define PhantomJS version variable
ARG PHANTOMJS_VERSION=2.1.1

# Install required packages including wget and bzip2 for PhantomJS
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-requests libaom3 wget bzip2 && \
    rm -rf /var/lib/{apt,dpkg,cache,log}/

# Download and install PhantomJS using the variable for the version
RUN wget https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-${PHANTOMJS_VERSION}-linux-x86_64.tar.bz2 && \
    tar xvjf phantomjs-${PHANTOMJS_VERSION}-linux-x86_64.tar.bz2 && \
    mv phantomjs-${PHANTOMJS_VERSION}-linux-x86_64/bin/phantomjs /usr/local/bin/phantomjs && \
    chmod +x /usr/local/bin/phantomjs && \
    rm -rf phantomjs-${PHANTOMJS_VERSION}-linux-x86_64 phantomjs-${PHANTOMJS_VERSION}-linux-x86_64.tar.bz2

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --only=production
COPY . .
ENV NODE_ENV=production
CMD ["npm", "start"]
