# Changelog

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
