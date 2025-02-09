FROM node:latest
LABEL maintainer="bendik@arbogast.dev"
# Copy package.json and package-lock.json.
COPY package* ./
# Copy the rest of the application code.
COPY . .
# Web server.
EXPOSE 3000

WORKDIR /src/loader
# Install dependencies.
RUN npm install
# Install sqlite3.
RUN npm install -g esbuild
# Install pm2 globally.
RUN npm install -g typescript

WORKDIR /
# Build the project.
RUN ./build-script
# Start the app.
CMD [ "node", "index.js" ]
