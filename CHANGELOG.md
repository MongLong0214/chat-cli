# Changelog

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
