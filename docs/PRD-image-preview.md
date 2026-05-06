# PRD: 이미지 미리보기 (반각블록 모자이크)

- Status: Draft
- Version: 0.1
- Owner: Isaac
- Date: 2026-05-06
- Target Version: chat-cli 1.4.0

## 1. 목적

채팅 도중 이미지(스크린샷, 사진)를 **터미널 안에서** 양측이 동시에 볼 수 있게 한다. 외부 이미지 호스팅/링크 없이 E2E 암호화 채널로 직접 전송한다.

## 2. 동기

- 코드 스크린샷, 짤, 영수증 등 텍스트로 옮기기 어려운 정보를 빠르게 공유
- 외부 서비스(이메일/카톡/iMessage)로 컨텍스트 스위치하지 않음
- E2E 암호화 보장 유지 (서버는 여전히 암호문만 봄)

## 3. 스코프

### In Scope

- `/img <path>` 명령어로 로컬 이미지 파일 송신
- PNG / JPEG 디코드
- 64×64 픽셀로 nearest-neighbor 다운샘플
- RGB raw 버퍼를 양측에 평문 전송 (E2E 암호화는 자동 적용)
- 양측 터미널에 반각블록 `▀` + 24bit truecolor로 출력 (32줄 차지)
- 송신자 화면에도 즉시 미리보기 표시
- `/del`로 송신한 이미지 삭제 가능 (id 부여, 텍스트와 동일 매커니즘)
- 알림(`/notify`)은 텍스트 메시지와 동일 처리 (Outlook 위장 유지, 본문 노출 X)

### Out of Scope

- WebP / GIF / HEIC / BMP / SVG 디코드
- 클립보드 직접 붙여넣기 (path 입력만)
- 원본 해상도 유지 (항상 64×64 다운샘플)
- 애니메이션 GIF 프레임
- 이미지 편집/크롭/회전
- 64KB WS 메시지 한계 초과 처리 (raw RGB 12KB이므로 이론상 항상 통과)

## 4. UX

### 송신

```
> /img ~/Pictures/screenshot.png
[12:34:56] 나
  ▀▀▀▀▀▀▀▀▀▀▀▀ ... (32줄 모자이크)
  ▀▀▀▀▀▀▀▀▀▀▀▀ ...
```

### 수신

```
[12:34:57] 짓뚜
  ▀▀▀▀▀▀▀▀▀▀▀▀ ...
  ▀▀▀▀▀▀▀▀▀▀▀▀ ...
```

### 에러

- 파일 없음: `❌ /img: 파일을 찾을 수 없음 (경로 확인)`
- 미지원 포맷: `❌ /img: PNG/JPEG만 지원 (.png, .jpg, .jpeg)`
- 디코드 실패: `❌ /img: 디코드 실패 (손상된 이미지)`
- 너무 큰 원본 (>20MB): `❌ /img: 원본 파일 크기 20MB 초과 (메모리 보호)`

## 5. 기술 결정

### 의존성 추가

- `pngjs` (^7.0.0) — PNG decoder, pure JS, ~150KB
- `jpeg-js` (^0.4.4) — JPEG decoder, pure JS, ~100KB
- 기존 `ws`는 server-only → 클라이언트는 처음으로 의존성 추가됨

### 자동 의존성 부트스트랩 + `/update` 자동 npm install

**핵심**: 친구는 `/update` 한 번으로 완전 업데이트. 수동 작업 0회.

**문제**: 1.3.7의 `/update`는 chat.js만 교체. 새 chat.js가 pngjs/jpeg-js require 실패하면 즉시 crash. 새 update 로직이 작동할 기회 없음.

**해결**: 1.4.0 chat.js 자체에 `ensureDependencies()` 부트스트랩 내장.

#### A. 부트스트랩 (chat.js 시작 시 — 1.4.0 신규)

```
1. dynamic require('pngjs'), require('jpeg-js') 시도 (~1ms)
2. 둘 다 OK → 즉시 return (정상 시작)
3. 하나라도 실패:
   a. dirname(chat.js)/package.json 읽음
      → 없으면: 원격에서 fetch + 쓰기
      → 있으면: dependencies에 pngjs/jpeg-js 누락 시 추가 + 쓰기
   b. spawn `npm install` (cwd = chat.js dirname)
      - timeout 90s
      - stdout/stderr 라이브 표시 ("npm install 진행 중...")
   c. 성공 → dynamic import 재시도 → 정상 시작
   d. 실패 → 명확한 에러 + 수동 가이드 후 exit
```

이로 인해 친구 1.3.7 → 1.4.0 흐름:
```
> /update          (1.3.7의 update가 chat.js만 교체)
✓ 업데이트 완료. /quit 후 재실행
> /quit
$ node chat.js <room>
[chat-cli 1.4.0]
의존성 자동 설치 중... (pngjs, jpeg-js)
> npm install 진행 중...
> added 2 packages in 8s
✓ 의존성 설치 완료
✓ 연결됨: 짓뚜
```

#### B. `/update` 명령 강화 (1.4.0+ 사용자 대상)

1. 원격에서 chat.js + package.json 동시 fetch
2. 로컬 chat.js 백업 + 교체
3. 로컬 package.json 백업 + 교체
4. `ensureDependencies()` 재호출 → 변경된 deps 자동 install
5. 완료 메시지

#### 공통 폴백 (실패 케이스)

**1. `npm` 명령 없음 (PATH 누락 / Node 미설치)**

`spawn ENOENT npm` 또는 `'npm' is not recognized` 감지 시 OS별 안내 출력:

```
❌ npm을 찾을 수 없음

Node.js가 설치되어 있지 않거나 PATH에 등록되지 않았습니다.

[Windows]
1. https://nodejs.org/ko/download 접속
2. "Windows Installer (.msi)" 64-bit 다운로드 (LTS 권장)
3. 설치 시 "Add to PATH" 옵션 체크 (기본값)
4. 설치 완료 후 PowerShell 완전히 닫고 새로 열기
5. node -v && npm -v 입력해 버전 확인
6. 다시 chat.js 실행

[macOS]
방법 A — Homebrew (권장):
  brew install node
방법 B — 공식 인스톨러:
  https://nodejs.org/ko/download → "macOS Installer (.pkg)"

[Linux]
sudo apt install nodejs npm        # Ubuntu/Debian
sudo dnf install nodejs npm        # Fedora
sudo pacman -S nodejs npm          # Arch

설치 후 안 되면: which npm (mac/linux) 또는 where npm (windows)으로 PATH 확인.
```

**2. 네트워크 실패** → 안내:
```
❌ npm install 실패 — 네트워크 확인 후 수동 실행

[수동 실행]
cd <chat.js 폴더>
npm install
```

**3. 타임아웃(90s)** → 자동 abort + 위와 동일한 수동 가이드.

**4. 권한 오류 (EACCES)** → 안내:
```
❌ 권한 부족
Mac/Linux: sudo chown -R $(whoami) <chat.js 폴더>
Windows: 폴더 우클릭 → 속성 → 보안 → 사용자 권한 확인
```

#### 의존성 비교 로직

`require.resolve('pngjs')` + `require.resolve('jpeg-js')` 모두 성공이면 skip. 하나라도 실패면 install 트리거. node_modules 존재 여부는 require가 알아서 판단 (별도 fs check 불필요).

### 메시지 프로토콜

기존 평문 JSON에 `kind=img` 추가. 암호화 후 송신.

```json
{
  "kind": "img",
  "id": "<8자 hex>",
  "w": 64,
  "h": 64,
  "rgb": "<base64 encoded RGB raw 12288 bytes>",
  "t": <epoch ms>
}
```

- raw 12,288 bytes → base64 16,384 chars → JSON wrapper 포함 ~17KB
- AES-GCM IV(12B) + tag(16B) 추가 → 64KB WebSocket 한계 안전
- 백워드 호환: 옛 클라이언트는 `kind=img` 인식 못 하면 무시 (기존 unknown kind fallback 패턴 적용)

### 리사이즈 알고리즘

- nearest-neighbor 직접 구현 (외부 라이브러리 불필요)
- 64×64는 모자이크. 보간 알고리즘(bilinear/bicubic) 추가해도 시각 차이 미미
- 종횡비 무시하고 강제 64×64 (정사각형 모자이크). 채팅 흐름 일관성 우선

### 셀 매핑

- 1셀 = 세로 픽셀 2개. 64×64 픽셀 → 64×32 셀
- 상단 픽셀 = ANSI fg color, 하단 픽셀 = ANSI bg color
- 셀 문자 = `▀` (U+2580)
- 한 줄 = 64셀 + reset escape. 가로폭이 좁은 터미널에서 wrap 발생 가능 (받는 측 책임)

### 보안 / sanitize

- 기존 `sanitizeDisplay`는 평문 메시지에 적용 (CSI/OSC 스트립)
- `kind=img`는 우리가 직접 생성한 ANSI만 사용 → sanitize 우회
- 단, RGB 값은 0-255 범위 검증 (Buffer.from 후 length === w*h*3 검증)

### 메모리 / DoS

- 원본 파일 20MB 상한 (디코더 메모리 폭발 방지)
- pngjs/jpeg-js는 디코드 시 width × height × 4 (RGBA) 메모리 할당. 4K 사진(3840×2160)은 33MB로 위험할 수 있으나 20MB 파일 상한으로 1차 가드
- 64×64 다운샘플 후 메모리는 12KB 수준 (안전)

## 6. Acceptance Criteria

### 기능

- [ ] `/img <path>` 명령어가 chat.js에 등록되어 있다
- [ ] PNG, JPEG 양쪽 디코드 가능
- [ ] 64×64 nearest-neighbor 다운샘플 동작
- [ ] 양측 터미널에 32줄 모자이크 출력
- [ ] 송신자 자기 화면에도 즉시 표시
- [ ] `/del`로 이미지 메시지 삭제 가능 (텍스트와 동일 UI)
- [ ] 미지원 포맷/없는 파일/디코드 실패 에러 메시지 출력 (chat 종료 X)
- [ ] 옛 클라이언트(1.3.x)와 통신 시 `kind=img` 무시되어 채팅 정상 동작

### 비기능

- [ ] WS 메시지 크기 < 30KB (안전 마진)
- [ ] 송신 latency < 1초 (PNG 1MB 기준)
- [ ] 알림(/notify ON 시) 이미지 수신해도 Outlook 위장 메시지만 발생, 이미지 내용 노출 0

### 테스트

- [ ] `lib/image.js` 단위 테스트: 디코드, 리사이즈, RGB 추출 (PNG/JPEG 각 fixture)
- [ ] `lib/render.js` 단위 테스트: RGB → ANSI 문자열 길이/이스케이프 검증
- [ ] E2E 통합: 송수신 라운드트립 (mock socket)

## 7. 비스코프 명시

- 이미지 캐시/저장 기능 없음. 받은 이미지를 파일로 저장하려면 직접 스크린샷 권장
- 이미지 갤러리/히스토리 없음. `/del`로 사라지면 복구 불가
- iTerm2 OSC1337 inline image 미지원 (모자이크만)
- 친구 측 Windows Terminal에서 셀 종횡비/폰트에 따라 모자이크 비율 약간 늘어질 수 있음 (수용)

## 8. 위험 / 미티게이션

| 위험 | 미티게이션 |
|------|------------|
| 친구 `npm install` 실패 (방화벽/네트워크) | pure JS 라이브러리 선택 → native binding 빌드 실패 없음 |
| 64KB WS 한계 초과 | 64×64 raw RGB는 12KB로 절반 이하. 안전 |
| 모자이크 품질 기대치 미스매치 | README에 "모자이크 미리보기" 명시. 정밀 이미지는 외부 채널 권장 |
| 받는 측 터미널 truecolor 미지원 | 거의 없는 케이스. 256-color fallback 미구현 (스코프 외) |
| 이미지로 위장한 ANSI 인젝션 | RGB raw 바이트만 전송 → 수신측이 직접 ANSI escape 생성. 페이로드에 escape 없음 |

## 9. 마이그레이션

- 기존 `kind=msg` / `kind=del` 외 `kind=img` 추가
- 옛 클라이언트는 unknown kind를 ignore하므로 채팅 끊기지 않음 (verified in 1.3.x)
- 양쪽 모두 1.4.0 업그레이드 필요. `/update` 명령으로 **chat.js + package.json + npm install 일괄 자동화**
- 친구 측 수동 작업: 0회 (`/update` 입력만, 90초 내 완료 예상)
- 1.3.7 → 1.4.0 업그레이드 시 `/update` 흐름:
  ```
  > /update
  업데이트 확인 중...
  v1.3.7 → v1.4.0
  의존성 변경 감지: pngjs, jpeg-js 추가
  npm install 실행 중... (최대 90초)
  ✓ 의존성 설치 완료
  ✓ 업데이트 완료
  /quit 후 다시 실행하세요
  ```
