FROM node:lts as build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY patches ./patches
COPY src ./src
COPY .env ./

RUN npm install
RUN npm run build

COPY ./src/oracles/supra/protos ./build/oracles/supra/protos
COPY ./src/oracles/supra/resources ./build/oracles/supra/resources

FROM node:lts

WORKDIR /app

COPY --from=build /app .

CMD ["node", "build/index.js"]