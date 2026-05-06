# Tickets: 이미지 미리보기 (1.4.0)

PRD: `docs/PRD-image-preview.md`

## 의존성 그래프

```
T1 (image.js) ─┐
T2 (render.js) ┼─→ T4 (/img 명령) ─→ T5 (self-preview + sanitize)
T3 (bootstrap) ┘                    ↓
                                  T6 (docs + VERSION)
```

T1, T2, T3는 병렬 가능 (서로 독립). T4부터 직렬.

## STATUS

| Ticket | Status | Test |
|--------|--------|------|
| T1 | Pending | - |
| T2 | Pending | - |
| T3 | Pending | - |
| T4 | Pending | - |
| T5 | Pending | - |
| T6 | Pending | - |

---

## T1 — `lib/image.js`: 디코드 + 리사이즈 + RGB 추출

**Size**: M (~2h)
**Dependencies**: 없음 (의존성 추가 직후 시작 가능)

### 목적
임의 PNG/JPEG 파일을 64×64 RGB raw Buffer로 변환하는 순수 함수 제공.

### 인터페이스
```js
// lib/image.js
export const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg'];
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const TARGET_SIZE = 64;

// path → { width: 64, height: 64, rgb: Buffer(12288) }
// throws Error with classified message
export const decodeAndResize = async (filePath) => { ... };
```

### TDD Spec (Red Phase)

`test/image.test.js`:

1. **PNG 디코드**: 64×64 PNG fixture → `{ width: 64, height: 64, rgb: Buffer.length === 12288 }`
2. **JPEG 디코드**: 800×600 JPEG fixture → 64×64로 다운샘플 + 길이 12288
3. **소형 이미지 업샘플 안 함**: 32×32 PNG → ❌ throw "이미지 너무 작음" (또는 nearest로 64×64? 결정 필요)
   - **결정**: 32×32 미만은 거부 ("이미지가 너무 작음 — 최소 64×64 필요"). 다운샘플 전제이므로
3-1. 32×32 정확히는 OK (최소 경계)
4. **미지원 포맷**: `.bmp` 확장자 → throw "PNG/JPEG만 지원"
5. **존재 안 함**: 없는 경로 → throw "파일을 찾을 수 없음"
6. **20MB 초과**: 21MB fixture → throw "원본 파일 크기 20MB 초과"
7. **손상된 PNG**: 잘린 buffer → throw "디코드 실패"
8. **RGB 픽셀 검증**: 빨강 PNG (R=255, G=0, B=0) → 모든 픽셀이 정확히 (255, 0, 0)

### Green
- `pngjs.PNG.sync.read` / `jpeg-js.decode`
- Nearest-neighbor 리사이즈 직접 구현 (한 번의 루프)
- RGBA → RGB 변환 (alpha 채널 drop)

### Refactor
- 에러 분류 enum 정리
- 픽셀 변환 헬퍼 분리 (가독성)

---

## T2 — `lib/render.js`: RGB → ANSI 반각블록

**Size**: S (~1h)
**Dependencies**: 없음

### 목적
RGB raw Buffer → 터미널에 출력 가능한 ANSI escape 문자열.

### 인터페이스
```js
// lib/render.js
export const HALF_BLOCK = '▀'; // ▀
export const RESET = '\x1b[0m';

// rgb buffer + width + height → ANSI 멀티라인 문자열 (height/2 줄)
export const renderImage = (rgb, width, height) => { ... };
```

### TDD Spec (Red Phase)

`test/render.test.js`:

1. **출력 줄 수**: 64×64 → 32 줄 (`\n` 개수 31 또는 32)
2. **각 줄 width**: 1줄당 ▀ 64개 + escape sequence
3. **24bit truecolor escape**: 출력에 `\x1b[38;2;R;G;Bm` (fg) + `\x1b[48;2;R;G;Bm` (bg) 포함
4. **상하 픽셀 매핑**: 상단 빨강(255,0,0), 하단 파랑(0,0,255) → `\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀`
5. **홀수 height 처리**: 65 줄 이미지 → 마지막 줄은 fg만 (bg 검정 또는 없음)
   - **결정**: 입력 height는 항상 짝수만 허용 (T1이 64×64로 보장). 홀수 → throw
6. **buffer 길이 검증**: rgb.length !== width × height × 3 → throw "RGB buffer 길이 불일치"
7. **RESET 종결**: 마지막에 `\x1b[0m` 포함
8. **연속 동일 색 최적화** (선택): 직전 셀과 fg/bg 둘 다 같으면 escape 생략 — **스코프 외, 미구현**

### Green
- 2픽셀씩 묶어서 한 줄 생성
- 각 셀: fg + bg + ▀
- 줄 끝 reset

### Refactor
- escape sequence 헬퍼 (`fg(r,g,b)`, `bg(r,g,b)`) 추출

---

## T3 — `ensureDependencies()`: 부트스트랩 + npm install

**Size**: M (~2h)
**Dependencies**: 없음 (chat.js 시작 부분에 삽입)

### 목적
chat.js 시작 시 pngjs/jpeg-js 자동 설치 보장. `/update` 명령에서도 재사용.

### 인터페이스
```js
// chat.js 내부 (또는 lib/bootstrap.js 분리)
const ensureDependencies = async () => { ... };
// throws on fatal failure (caller가 process.exit)
```

### 동작 흐름

1. `require.resolve('pngjs')` + `require.resolve('jpeg-js')` 시도
2. 둘 다 OK → 즉시 return
3. 하나라도 실패:
   a. dirname(realpathSync(process.argv[1]))/package.json 존재 여부
      - 없음: 원격 fetch (UPDATE_URL_PACKAGE) → 쓰기
      - 있음: deps에 pngjs/jpeg-js 누락 시 추가 + 쓰기
   b. spawn `npm install` (cwd = chat.js dirname, timeout 90s)
   c. spawn 이벤트:
      - `error.code === 'ENOENT'` → npm 미설치 안내 (PRD §5 공통 폴백 1)
      - `EACCES` → 권한 안내 (PRD §5 공통 폴백 4)
      - timeout → 안내 + abort
   d. install 성공 → 다시 require.resolve 시도 → 여전히 실패면 throw

### TDD Spec (Red Phase)

테스트 가능 단위만 분리해서 테스트:

`test/bootstrap.test.js`:

1. **ensureDeps 분기 결정** (mock require.resolve):
   - 양쪽 다 resolve OK → install 호출 안 함
   - 한쪽 실패 → install 호출 1회
2. **package.json 병합 로직** (순수 함수): `mergeDeps(local, required)` → 누락된 키만 추가
   - 빈 deps → pngjs/jpeg-js 추가
   - pngjs만 있음 → jpeg-js만 추가 (pngjs 버전 유지)
   - 둘 다 있음 → 변경 없음 (idempotent)
3. **에러 메시지 분류** (순수 함수): `classifyNpmError(err)` → 'ENOENT' | 'EACCES' | 'TIMEOUT' | 'UNKNOWN'

spawn / fs는 단위 테스트 어려움 → **수동 검증 단계** (T6에서 시나리오 테스트):
- 깨끗한 디렉토리에서 chat.js만 두고 실행 → install 자동
- 가상으로 PATH에서 npm 빼고 실행 → 명확한 안내 출력

### Green
- `import.meta.resolve` 또는 `createRequire(import.meta.url).resolve` (ESM 환경 require.resolve)
- spawn `npm install` with `stdio: ['ignore', 'inherit', 'inherit']` (라이브 표시)

### Refactor
- 메시지 상수 분리 (NPM_NOT_FOUND_MSG 등)

---

## T4 — `chat.js`: `/img` 명령어 + `kind=img` 프로토콜

**Size**: M (~2h)
**Dependencies**: T1, T2, T3

### 목적
`/img <path>` 명령어로 송수신 라운드트립 완성.

### 변경 파일
- `chat.js` (commands 객체에 `img` 추가, `handleEncrypted`에 `kind=img` 분기)

### 인터페이스 (chat.js 내부)
```js
// commands.img(arg) — arg = path
img: async (pathArg) => { ... }

// handleEncrypted 분기
case 'img': {
  // payload: { kind: 'img', id, w, h, rgb: base64, t }
  // → render → above.print
}
```

### 메시지 구조
```json
{ "kind": "img", "id": "<8 hex>", "w": 64, "h": 64, "rgb": "<base64 12288 bytes>", "t": <epoch ms>, "n": "<sender name>" }
```

### TDD Spec (Red Phase)

`test/protocol.test.js` (mock socket 통합 테스트):

1. **kind=img 직렬화**: payload 객체 → JSON → 파싱 후 모든 필드 보존
2. **rgb base64 라운드트립**: 12288 bytes Buffer → base64 → Buffer → 동일성 (byte-by-byte)
3. **id 유니크**: 100회 생성 → 충돌 0
4. **kind=img + /del 호환**: id 부여 → del 메시지로 ids 포함 시 정상 매칭
5. **옛 클라이언트 호환** (시뮬레이션): kind 없는 메시지 → 정상 msg 처리 (regression)
6. **payload 크기**: rgb 12288 base64 + 메타 → < 30KB

### Green
- 명령어 파서: `/img <path>`
- `decodeAndResize(path)` 호출 → `renderImage(rgb, 64, 64)` → 화면 출력
- payload 구성 → `sendEncrypted({ kind: 'img', id, w, h, rgb: rgb.toString('base64'), t, n })`
- 수신 측: `case 'img':` → base64 → Buffer → `renderImage` → `above.print`

### Refactor
- payload builder 헬퍼

---

## T5 — 자기 화면 미리보기 + sanitize 우회 + 알림 호환

**Size**: S (~1h)
**Dependencies**: T4

### 변경 파일
- `chat.js` (sanitizeDisplay 호출 위치 조정, /notify 통합)

### 변경 사항

1. **자기 화면 미리보기**: `/img` 송신 후 자기 화면에도 동일 ANSI 출력
2. **sanitize 우회**: `kind=img` 메시지는 우리가 생성한 ANSI만 → sanitize 적용 안 함
3. **`/notify` 통합**:
   - 이미지 수신 시에도 unread counter 증가
   - 알림 본문은 기존 "새 메일이 도착했습니다" 그대로 (이미지 내용 노출 X)
   - markRead 동일 동작
4. **`/del` 통합**: 이미지 메시지도 messageLog에 기록, 자기 보낸 것 삭제 가능

### TDD Spec (Red Phase)

`test/integrate.test.js`:

1. **messageLog 항목**: img 송신 후 log에 `{ id, kind: 'img', sender: 'me' }` 추가
2. **/del 후보 포함**: 최근 10개 송신 메시지 목록에 img 포함
3. **redrawScreen에서 img 보존**: clear 후 재출력 시 img가 ANSI 형태로 다시 나옴
4. **알림 호출 인자**: img 수신 시 `spawnOSNotification(NOTIFY_TITLE, NOTIFY_BODY)` 호출 (peer name X, content X)

### Green
- 자기 send 직후 동일 페이로드를 본인 above.print
- handleEncrypted img 분기에서 sanitize 호출 안 하기
- onPeerActivity 호출 (알림 throttle 통합)
- messageLog.push({ id, kind: 'img', sender: 'me'/'peer', rendered: <ansi string>, deleted: false })
- redrawScreen에서 kind에 따라 분기 출력

### Refactor
- 메시지 렌더 함수 통합 (text/img 모두 redrawScreen에서 처리)

---

## T6 — 문서화 + VERSION 1.4.0 + CHANGELOG

**Size**: S (~30min)
**Dependencies**: T1-T5 완료

### 변경 파일
- `package.json` (version 1.4.0, dependencies pngjs/jpeg-js 추가)
- `CHANGELOG.md` (1.4.0 섹션)
- `README.md` (`/img` 명령어 추가, 자동 의존성 부트스트랩 안내)
- `GUIDE.md` (친구용 — 1.4.0 업데이트 시 자동 npm install 설명, npm 미설치 시 가이드)
- `chat.js` `VERSION = "1.4.0"`, `/help` 메시지에 `/img` 추가

### TDD Spec
없음 (문서/메타데이터)

### 검증
- `node chat.js --version` (또는 시작 배너)에서 1.4.0 표시
- README/GUIDE 한국어 자연스러움
- CHANGELOG에 부트스트랩 동작 명시

---

## 빌드 검증 (T1-T6 완료 후)

본 프로젝트는 TypeScript/ESLint 미사용. 검증은:

1. **테스트**: `node --test test/*.test.js` 또는 모든 단위 테스트 수동 실행
2. **lint 대용**: `node -c chat.js`, `node -c lib/image.js`, `node -c lib/render.js` (syntax check)
3. **E2E 라운드트립**: 두 인스턴스 띄우고 `/img` 송수신 (수동)
4. **부트스트랩 시나리오**:
   - node_modules 삭제 후 첫 실행 → 자동 install
   - PATH에서 npm 임시 제거 후 실행 → 명확한 안내
5. **마이그레이션 시나리오**: 1.3.7 환경에서 `/update` → 1.4.0 부팅 → 자동 install
