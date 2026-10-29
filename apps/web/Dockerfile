FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web

ARG VITE_API_URL=https://studio.api.bincrydev.id.vn
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_SOCIAL_FACEBOOK_URL=
ENV VITE_SOCIAL_FACEBOOK_URL=$VITE_SOCIAL_FACEBOOK_URL
ARG VITE_SOCIAL_INSTAGRAM_URL=
ENV VITE_SOCIAL_INSTAGRAM_URL=$VITE_SOCIAL_INSTAGRAM_URL
ARG VITE_SOCIAL_TIKTOK_URL=
ENV VITE_SOCIAL_TIKTOK_URL=$VITE_SOCIAL_TIKTOK_URL
ARG VITE_SOCIAL_ZALO_URL=
ENV VITE_SOCIAL_ZALO_URL=$VITE_SOCIAL_ZALO_URL

RUN pnpm --filter @costume/web build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
