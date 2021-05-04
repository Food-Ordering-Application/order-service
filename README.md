## Installation

```bash
$ npm install
```

## Running app in container for development

```bash
$ docker-compose up --build -V   
```

## Running seed database again
- Create new .env copy content from .development.env to .env

```bash
$ npm run db:setup
```