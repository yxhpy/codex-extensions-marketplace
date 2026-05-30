FROM node:25-slim

WORKDIR /work/codex-augment-dispatcher
COPY . /work/codex-augment-dispatcher

CMD ["node", "--experimental-strip-types", "scripts/clean_test.ts"]
