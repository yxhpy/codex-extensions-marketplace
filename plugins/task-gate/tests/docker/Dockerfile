FROM node:25-slim

WORKDIR /work/task-gate
COPY . /work/task-gate

CMD ["node", "--experimental-strip-types", "scripts/clean_test.ts"]
