# Sporty_v2 Frontend

AI 기반 생활체육 매칭 플랫폼 Sporty_v2의 프론트엔드 저장소입니다. 모든 API는 Gateway(`http://localhost:8000`)를 거쳐 호출합니다.

- 비밀값은 `.env`에만 두고 커밋하지 않습니다.

## 배포 이미지

`Dockerfile`이 정적 파일을 빌드해 nginx 이미지로 묶습니다. API는 상대 경로로 호출하고, nginx가 `/<서비스명>-service/**`와 `/prometheus/**`를 경로 그대로 Gateway로 넘깁니다(같은 출처라 CORS가 필요 없습니다).

```bash
docker build -t sporty-frontend .
docker run --rm -p 8089:80 -e GATEWAY_UPSTREAM=host.docker.internal:8000 sporty-frontend
```

- `GATEWAY_UPSTREAM`: 프록시할 Gateway `호스트:포트`. 기본값은 `gateway-service:8000`(Compose·K8s 서비스 이름). nginx 시작 시점에 이 이름이 DNS로 풀려야 합니다.
- main에 머지되면 `.github/workflows/image-push.yml`이 `<DOCKERHUB_NAMESPACE>/sporty-frontend:<sha7>`·`:latest`를 push합니다. secrets `DOCKERHUB_USERNAME`·`DOCKERHUB_TOKEN`, vars `DOCKERHUB_NAMESPACE`가 없으면 건너뜁니다.
