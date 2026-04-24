# 1:1 E2E CLI Chat

터미널에서 동작하는 경량 1:1 프라이빗 채팅.

- **End-to-End 암호화**: X25519 ECDH + AES-256-GCM. 서버는 암호문만 중계
- **세이프티 코드**: 공유키 fingerprint를 양측에 표시 → 별도 채널로 대조해 MITM 감지
- **고정 방 또는 1회성 초대링크** 자유 선택
- **이름 / 컬러 / 시간표시 / URL 하이라이트** 내장
- **크로스 플랫폼**: Mac / Windows / Linux (Node 22+)
- **클라이언트 제로 의존성**: Node 22 내장 WebSocket 사용 → `npm install` 불필요
- **무(거의)료 호스팅**: Render Free Tier

## 구성

```
chat-cli/
├── server.js       # WebSocket 중계 서버 (Render에 배포됨)
├── chat.js         # CLI 클라이언트
├── Dockerfile      # Render 빌드용
├── render.yaml     # Render Blueprint (옵션)
├── package.json
├── GUIDE.md        # Windows 초보자용 한국어 사용법 (상대방 전달용)
└── README.md
```

## 사용법

### 방법 A. 고정 방 이름 (추천 — 매번 링크 전달 불필요)

둘이 미리 방 이름을 정해서 **양쪽이 같은 명령**만 치면 됨:

```bash
# 나 (Mac/Linux)
node chat.js myroom-abc123

# 친구 (Windows PowerShell)
node chat.js myroom-abc123
```

또는 환경변수:

```bash
CHAT_ROOM=myroom-abc123 node chat.js
```

**쉘 alias로 한 단어 접속:**

```bash
# ~/.zshrc 또는 ~/.bashrc
alias chat="node ~/chat-cli/chat.js myroom-abc123"
```

```powershell
# PowerShell $PROFILE
function chat { node $HOME\Desktop\chat-cli\chat.js myroom-abc123 }
```

> 방 이름은 타인이 추측하기 어려운 조합 권장 (예: `isaac-jun-x9k4`). 혹시 충돌 시 세이프티 코드가 즉시 감지.

### 방법 B. 1회성 초대링크

```bash
# A (방 만들기)
node chat.js
# → "초대링크: wss://chat-cli-7woy.onrender.com#abc..." 출력

# B (참여, 따옴표 필수)
node chat.js "wss://chat-cli-7woy.onrender.com#abc..."
```

### 최초 실행

처음 실행 시 이름을 묻고 `~/.chat-cli/name`에 저장. 이후 실행부터 자동 로드.

### 연결 후

양쪽에 `✓ 연결됨: 상대이름` + `세이프티 코드: xxxxxxxx` 표시 → **친구와 전화/얼굴로 코드 대조**(같으면 안전).

> 첫 연결 시 30~60초 지연 가능 (Render Free 15분 유휴 sleep). 접속되면 10분마다 자동 핑으로 방지.

## 명령어

| 명령 | 설명 |
|------|------|
| `/help` | 도움말 |
| `/quit` | 종료 |
| `/clear` | 화면 + 스크롤백 비우기 |
| `/name <새이름>` | 이름 변경 (다음 메시지부터 상대에게 반영) |
| `/color me` / `/color peer` | 내 / 상대 메시지 색 선택 (빨·주·노·초·파·남·보·흰·레인보우) |
| `/bell` | 상대 메시지 알림음 토글 |
| `/update` | GitHub에서 최신 chat.js 받아 자동 교체 (시작 시 새 버전 있으면 배너로 알림) |

- URL은 받은 메시지에서 자동 하이라이트 (밑줄 + 파랑)
- 메시지 전송 시간 우측 정렬 표시
- 내 메시지 초록, 상대 메시지 시안
- 옛날 터미널이면 `NO_COLOR=1` 로 컬러 비활성화

## 아키텍처

```
Client A ──wss──┐
                ├─ Render Server (relay only)
Client B ──wss──┘

1. A, B 각자 X25519 keypair 생성
2. 서버에 token + public key + name 전송
3. 2명 페어링되면 서버가 서로의 public key + name 교환
4. 각자 ECDH로 shared secret 계산 → SHA-256 → AES-256 키
5. 이후 모든 메시지는 AES-256-GCM 암호화. 서버는 암호문 pass-through
6. 양측이 세이프티 코드(shared key의 SHA-256 앞 8자) 표시 → 수동 대조
```

서버는 공개키 / 암호문 / 이름만 관찰. 평문 복호화 불가능.

## 자체 배포 (옵션)

### Render.com (무료)

1. 이 저장소 fork
2. Render 대시보드 → **New Web Service** → GitHub 연결 → fork한 저장소 선택
3. `Docker` 자동 감지, Instance Type `Free` 선택 → `Create Web Service`
4. 배포된 URL의 `https://`를 `wss://`로 바꿔 `chat.js`의 `SERVER` 상수 수정 (또는 `CHAT_SERVER` 환경변수로 주입)

### 로컬

```bash
npm install
node server.js                                      # 서버 (기본 포트 8080)
CHAT_SERVER=ws://localhost:8080 node chat.js        # 클라이언트
```

## 보안 노트

- **Forward secrecy**: 세션마다 새 keypair. 과거 세션 키 유출돼도 이전 대화 복호화 불가
- **서버 신뢰 불필요**: 서버가 악의적이어도 메시지 내용 못 봄. 트래픽 메타데이터(누가 언제 접속, 이름, 시점)는 서버가 봄
- **MITM 방지**: 세이프티 코드 수동 대조. 상대와 코드가 같으면 중간자 없음. 다르면 즉시 연결 끊고 재시도.
- **WebSocket 메시지 크기 64KB 제한**. 입력은 4096자로 제한.
- **친구 1명용 수준**: 리플레이 방지 카운터, 방향 분리 키 등 고급 보안은 미적용 (스코프 외)

## 라이선스

MIT
