# 1단계: 정적 파일 빌드
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# API는 같은 출처의 상대 경로로 호출하고 nginx가 Gateway로 넘긴다.
ENV REACT_APP_BACKEND_ENDPOINT=""
RUN npm run build

# 2단계: nginx로 정적 파일 제공 + Gateway 프록시
FROM nginx:1.27-alpine
ENV GATEWAY_UPSTREAM=gateway-service:8000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
