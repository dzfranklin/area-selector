FROM node:21 as build
WORKDIR /build

ARG MAPTILER_API_KEY

ENV VITE_MAPTILER_API_KEY=$MAPTILER_API_KEY

COPY package.json .
RUN npm install
COPY . .
RUN npm run build
