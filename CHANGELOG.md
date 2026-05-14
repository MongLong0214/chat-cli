# Changelog

## 1.4.5
- **자동 재연결** (지수 backoff 2s → 4s → 8s → ... → 60s cap):
  - WS 비정상 종료(서버 재시작, 네트워크 단절, sleep 등) 시 본인 chat 종료 안 함
  - 자동으로 새 WS 연결 시도 + 재핸드셰이크 → 메시지 송수신 자동 복구
  - 사용자 /quit 또는 bad token/room full 등 영구 사유는 정상 종료 (재연결 X)
  - 연결 끊김 시 `연결 끊김 (code=X reason="Y"). N초 후 재연결 시도 (N회)...`
  - 재연결 성공 시 `재연결 성공 (N회 시도 끝)` 출력
- error 핸들러 `process.exit(1)` 제거 — close 핸들러가 자동 재연결 처리

## 1.4.4
- 상대가 나가도 본인 chat 종료 안 됨 (자동 재접속 대기):
  - 기존: 상대 /quit → 본인 ws.close(1000) → process.exit(0)
  - 수정: 상대 /quit → "재접속 대기 중..." 표시 + sharedKey 리셋, chat 유지
  - 상대 재접속 시 자동 새 핸드셰이크 (X25519 ECDH 재실행) → "✓ 연결됨" 다시 출력
  - 재접속 대기 중 메시지 입력 시 안내 메시지

## 1.4.3
- 60초 알림 throttle 진짜 fix:
  - 1.3.7부터 `markRead`가 `lastNotifyTime = 0` 리셋해서 throttle 무력화하던 버그
  - 수신자가 chat 창에 어떤 키든 + 엔터 한 번 입력 → markRead → throttle reset → 다음 메시지 즉시 알림 → 매 메시지마다 토스트
  - `/diag` 진단으로 친구 PC에서 `lastNotifyTime: 0` 확인 → markRead가 매번 리셋한다는 결정적 증거
  - **수정**: `markRead`에서 `lastNotifyTime = 0` 줄 제거 → throttle은 시간 기반(60초)으로만 동작
  - 이제 친구가 chat 활동해도 60초 안에는 새 알림 X

## 1.4.2
- `/diag` 명령 추가: 알림 throttle 디버깅용 진단 정보 출력
  - version, pid, script path, node, platform
  - config.notify, bellEnabled, unreadCount
  - lastNotifyTime, now - lastNotifyTime, throttle 적용 여부
  - peerName, peerNameConfirmed, tokenHash16
- `/help`에 `/diag` 등록

## 1.4.1
- Single-instance lock (token별, `lib/lock.js`):
  - 같은 방(token)에 chat-cli가 이미 실행 중이면 두 번째 인스턴스 시작 거부 (PID 안내)
  - **`--force-unlock` 플래그**: PID 잘못 잡힌 false-positive 케이스 강제 해제 (escape hatch)
  - **Lock age 검사**: 1시간 이상 stale lockfile 자동 삭제 (PID 재할당 false-positive 방어)
  - **`wx` flag**: TOCTOU race 차단 (동시 acquire 시 한 쪽만 성공)
  - 이전 인스턴스 비정상 종료 시 stale lockfile 자동 무시 (PID 생존 검사 + EPERM 보수적 처리)
  - 정상 종료(/quit, SIGTERM, SIGHUP)에서 lockfile 자동 정리
  - 다른 token은 영향 없음 (여러 친구와 동시 chat 가능)
- 60초 알림 throttle이 친구 PC에서 깨지던 근본 원인 해결:
  - 친구가 실수로 chat을 두 번 띄우면 server.js 좀비 대체로 새 인스턴스 활성 → lastNotifyTime=0 리셋 → 매 메시지마다 알림 발송 현상 차단
  - server.js 좀비 대체 로직은 보존 (defense in depth: client lock 1차 + server replace 2차 fallback)
- 단위 테스트 16개 추가 (`test/lock.test.js`): tokenLockPath, isProcessAlive, acquireLock 정상/에러 경로, releaseLock PID 보호, stale 처리, force-unlock

## 1.4.0
- `/img <경로>` 명령어: PNG/JPEG 이미지 64×64 모자이크 미리보기 송신
  - X25519 ECDH + AES-256-GCM 채널로 암호화 (서버는 RGB 원본 못 봄)
  - 반각블록 ▀ + 24bit truecolor → 32줄 출력, 모든 모던 터미널 호환
  - WS 메시지 크기 ~17KB (64KB 한계 안전)
  - `/del`로 송신 이미지도 양쪽에서 삭제 가능
  - 알림(`/notify`) 호환: 이미지 수신해도 Outlook 위장 본문 유지 (내용 노출 X)
- 의존성 자동 부트스트랩:
  - 첫 실행 시 `pngjs` + `jpeg-js` 자동 설치 (npm install 자동 spawn)
  - `lib/*` 파일 누락 시 GitHub에서 자동 다운로드 (1.3.7 → 1.4.0 마이그레이션 보장)
  - `/update` 강화: chat.js + package.json + lib/* 일괄 동기화 + 의존성 재설치
  - npm 미설치 시 OS별 상세 안내 (Windows/macOS/Linux 인스톨러 가이드)
- 모듈 분리: `lib/image.js` `lib/render.js` `lib/protocol.js` `lib/bootstrap.js`
- 단위 테스트 43건 추가 (`node --test test/*.test.js`)

## 1.3.7
- 알림 완전 Outlook 위장 + 60초 throttle:
  - AppId DisplayName 매번 'Microsoft Outlook'로 강제 설정 (이전 등록 덮어쓰기)
  - 토스트 제목: 'Microsoft Outlook' (보낸이 미노출)
  - 토스트 본문: '새 메일이 도착했습니다' (메시지 내용 미노출)
  - 터미널 탭 제목: 'Microsoft Outlook (N)' — 미읽음 카운터만
  - markRead 시 제목 완전 클리어 (default 빈 문자열)
- 같은 알림 60초 내 중복 발생 시 추가 토스트 발송 차단
  - 미읽음 카운터/탭 제목은 매 메시지마다 즉시 갱신
  - 알림 토스트만 60초 throttle (배지 폭주 방지, 개인정보 누수 방지)
  - markRead 시 throttle 리셋 → 다음 메시지 즉시 알림

## 1.3.6
- 알림 본문에서 메시지 내용 제거 → "새 메시지" 고정 (프라이버시).
  제목은 상대 이름만, 본문은 "새 메시지". 누가 보냈는지만 보이고
  내용은 채팅창 직접 확인.

## 1.3.5
- Windows 알림이 테스트는 되는데 실제 메시지에선 안 뜨던 문제 fix:
  실제 알림 spawn이 `detached + stdio:ignore` → 테스트와 같은
  `stdio:["ignore","pipe","pipe"] + windowsHide:true`로 통일.
  Windows의 detached PowerShell이 WinRT UI subsystem 접근에 실패하던 케이스 우회.

## 1.3.4
- `/notify` ON 시 PowerShell 진단 출력을 채팅창에 직접 표시
  (silent fail 종식, 정확한 실패 원인 노출)
- 10초 타임아웃, spawn ENOENT 캐치 ("powershell PATH에 없음" 등)
- `buildNotifyArgs` 헬퍼로 OS별 명령 분리, 동일 PS 스크립트로 진단/실제 알림 모두 사용

## 1.3.3
- Windows 알림 진짜 fix:
  1. HKCU 레지스트리에 AppId('chat-cli') **자동 등록** (관리자 권한 불필요, 1회만)
  2. 등록된 AppId로 WinRT Toast 표시
  3. WinRT 실패 시 NotifyIcon BalloonTip fallback
  4. 항상 시스템 소리 재생 (보장)
- `-ExecutionPolicy Bypass` 추가 (그룹 정책 회피)
- 이전 버전이 silent fail한 진짜 원인: AppId 등록 안 됨

## 1.3.2
- Windows 알림 fix: WinRT Toast (AppId 등록 필요로 silent fail) → NotifyIcon BalloonTip 방식 교체
  - Windows 10/11이 자동으로 toast로 렌더링, 등록 절차 불필요
- `/notify` 토글 ON 시 즉시 테스트 알림 발송 (검증 용이)
- 안 보이면 Windows 설정/Focus assist 안내

## 1.3.1
- WS error 이벤트 진단 강화: `error.cause` 체인 walk (최대 5depth), node 버전·플랫폼·URL 표시
- "알 수 없는 오류" fallback 시 디버그 정보 자동 노출

## 1.3.0
- `/notify` 명령어: OS 데스크톱 알림 + 터미널 탭 제목 unread 카운터
  - macOS: `osascript`로 시스템 알림 팝업 (권한 자동)
  - Linux: `notify-send`
  - Windows: WinRT 토스트 알림 팝업 (Windows 10+, 무모듈 PowerShell) + 시스템 소리
  - 풀스크린 IDE/브라우저 사용 중에도 메시지 도착 인지 가능
  - config.json에 영속 (다음 실행 자동 ON)
  - 내가 입력하면 unread 0으로 리셋, 종료 시 제목 원복
- `/help`에서 /bell vs /notify 차이 명시 (BEL vs OS 알림)

## 1.2.1
- 레인보우(비비드)와 파스텔을 별도 색 옵션으로 분리
- `/color` 목록에 9. 레인보우 + 10. 파스텔 둘 다 선택 가능
- 파스텔 팔레트 강화: cotton 핑크/피치/바나나/민트/터쿼이즈/하늘/라벤더 (211/215/228/120/87/117/177)
- 애니메이션 로직을 `isAnimatedColor()`로 일반화 — 추후 새 그라데이션 옵션 추가 쉬워짐

## 1.2.0
- `/del` 명령어: 내가 보낸 최근 10개 메시지 번호 선택 삭제
  - 양쪽 화면 + 스크롤백 클리어 후 비삭제 메시지만 다시 출력
  - 메시지 ID 부착 (8자 hex), kind 필드 도입 (msg/del)
  - 옛 클라이언트와 backward compat (kind 없으면 msg로 처리)
- `/clear` 시 메시지 히스토리도 비움 (이후 /del 대상 사라짐)
- 레인보우 색을 파스텔 톤으로 변경 (핑크→피치→크림→민트→시안→하늘→라벤더)

## 1.1.0
- `/update` 명령어: 원격 최신 버전 자동 다운로드
- 시작 시 새 버전 배너 + CHANGELOG 발췌 표시
- 버전 정보 (`VERSION` 상수) 도입

## 1.0.0
- Node 22 내장 WebSocket 사용 → 클라이언트 zero-dep (`npm install` 불필요)
- `/color me` / `/color peer`: 빨·주·노·초·파·남·보·흰·레인보우 선택
- 레인보우 애니메이션 (프롬프트 200ms hue 순환, 입력 중 자동 pause)
- `/clear`: 화면 + 스크롤백 완전 비우기 (`\x1b[2J\x1b[3J\x1b[H`)
- `/name`, `/bell`, `/help`, `/quit` 명령어
- 이름 + 색 설정 `~/.chat-cli/config.json` 영속화
- 세이프티 코드 (공유키 fingerprint) MITM 감지
- 메시지 시간 우측 정렬, URL 자동 하이라이트
- 고정 방 지원: `node chat.js <방이름>` 또는 `CHAT_ROOM` 환경변수
- Render Free Tier 10분 HTTP keepalive
- 서버 heartbeat, graceful shutdown, 입력 크기 제한 등 프로덕션 하드닝
