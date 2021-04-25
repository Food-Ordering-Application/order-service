FROM node

WORKDIR /app

COPY package.json /app

RUN npm install

COPY . .

CMD npm run db:setup && npm run start:dev