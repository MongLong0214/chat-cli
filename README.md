# 1:1 E2E CLI Chat

- WebSocket 중계 서버 + Node CLI
- X25519 ECDH + AES-256-GCM (서버는 암호문만 봄)
- 방 인원 2명 초과 차단, 종료 시 휘발

## 1. 서버 배포 (최초 1회)

Fly.io 계정 + `flyctl` 설치 필요.

```bash
cd ~/chat-cli
fly launch --copy-config --no-deploy   # 앱 이름 생성 (예: chat-cli-isaac)
fly deploy
```

배포 완료 후 URL 확인:
```bash
fly status
# Hostname: chat-cli-isaac.fly.dev → wss://chat-cli-isaac.fly.dev
```

## 2. 양쪽 PC 세팅 (Mac / Windows 공통)

`chat.js` + `package.json` 2개만 공유. Node 20+ 설치 후:

```bash
npm install
```

환경변수 설정:

Mac/Linux:
```bash
export CHAT_SERVER=wss://chat-cli-isaac.fly.dev
```

Windows (PowerShell):
```powershell
$env:CHAT_SERVER="wss://chat-cli-isaac.fly.dev"
```

## 3. 대화

**방 생성 (A)**:
```bash
node chat.js
# → 초대링크 출력 → B에게 전달
```

**방 참여 (B)**:
```bash
node chat.js "wss://chat-cli-isaac.fly.dev#<token>"
```

양쪽에 `✓ 연결됨` 뜨면 입력 시작. Ctrl+C 로 종료.
