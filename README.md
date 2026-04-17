# 1:1 E2E CLI Chat

터미널에서 동작하는 초경량 1:1 프라이빗 채팅.

- **End-to-End 암호화**: X25519 ECDH 키 교환 + AES-256-GCM. 서버는 암호문만 중계
- **초대링크 기반**: 1회성 토큰으로 방 생성, 2명 초과 자동 차단
- **컴팩트**: 서버 40줄, 클라이언트 75줄. 외부 의존 `ws` 하나
- **크로스 플랫폼**: Mac / Windows / Linux (Node 20+)
- **무(거의)료 호스팅**: Render Free Tier 에서 동작

## 구성

```
chat-cli/
├── server.js       # WebSocket 중계 서버 (Render 에 배포됨)
├── chat.js         # CLI 클라이언트
├── Dockerfile      # Render 빌드용
├── render.yaml     # Render Blueprint (옵션)
├── package.json
├── GUIDE.md        # 초보자용 한국어 사용법 (상대방 전달용)
└── README.md
```

## 사용법

### 이미 배포된 서버로 바로 사용

**방 만들기**:
```bash
node chat.js
# → "초대링크: wss://chat-cli-7woy.onrender.com#abc123..." 출력
# → 링크를 상대에게 전달
```

**방 참여**:
```bash
node chat.js "wss://chat-cli-7woy.onrender.com#abc123..."
```

양쪽에 `✓ 연결됨` 뜨면 메시지 입력 가능. `Ctrl+C` 종료.

> 첫 연결 시 30~60초 지연 가능 (Render Free 의 15분 유휴 sleep).

### 상대방이 Windows 초보자일 때

`GUIDE.md` 를 따라하면 됩니다. `chat.js` + `package.json` + `GUIDE.md` 3개 파일만 zip 으로 전달.

## 아키텍처

```
Client A ──wss──┐
                ├─ Render Server (relay only)
Client B ──wss──┘

1. A, B 가 각자 X25519 keypair 생성
2. 서버에 접속하며 token + public key 전송
3. 서버가 2명 페어링되면 서로의 public key 교환
4. 각자 ECDH 로 shared secret 계산 → SHA-256 해시 → AES-256 키
5. 이후 모든 메시지는 AES-256-GCM 암호화. 서버는 암호문 pass-through
```

서버는 공개키/암호문만 보며 평문 복호화 불가능.

## 자체 배포 (옵션)

자신의 서버를 쓰려면:

### Render.com (무료)

1. 이 저장소 fork
2. Render 대시보드 → **New Web Service** → GitHub 연결 → fork 한 저장소 선택
3. `Docker` 자동 감지, Instance Type `Free` 선택 → `Create Web Service`
4. 배포된 URL 의 `https://` 를 `wss://` 로 바꿔서 `chat.js` 의 `SERVER` 상수 수정

### 로컬

```bash
npm install
node server.js          # 서버 (기본 포트 8080)
CHAT_SERVER=ws://localhost:8080 node chat.js   # 클라이언트
```

## 보안 노트

- **Forward secrecy**: 세션마다 새 keypair 생성. 과거 세션 키 유출돼도 이전 대화 복호화 불가
- **서버 신뢰 불필요**: 서버가 악의적이어도 메시지 내용 못 봄. 단, 트래픽 메타데이터(누가 언제 접속)는 서버가 봄
- **MITM 방지**: 없음 (초대링크 공유 채널을 신뢰). 더 필요하면 링크에 public key fingerprint 포함 권장

## 라이선스

MIT
