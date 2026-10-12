# 개발·검증 안내

스킬 사용 자체에는 이 문서의 개발 도구 설치 불필요. 아래는 공개 자료와 재사용 코드를 수정하는 기여자용 절차.

## 준비

- Node.js 22 이상과 npm.
- Python 3: 로컬 정적 서버를 사용할 때만 필요.
- Chromium: 자동 설치 또는 기존 Chrome/Chromium 실행 파일 사용.
- FFmpeg: README의 GIF를 다시 만들 때만 필요.

```sh
npm ci
npm run setup:browser
npm test
```

이미 설치된 Chromium 계열 브라우저 사용 시 `setup:browser` 생략 가능. `TUTORIAL_BROWSER`에 해당 실행 파일의 절대 경로를 지정한 뒤 `npm test` 실행. 실행 파일 위치는 운영체제와 설치 방식에 따라 결정.

## 검사 범위

| 명령 | 범위 |
|---|---|
| `npm run check:docs` | 로컬 문서·이미지 링크, 스킬 메타데이터, 개발 환경의 절대 경로 혼입 |
| `npm test` | 문서 검사 + 엄격한 TypeScript 검사 + 브라우저 대상 탐색 23개 검사 + 공개 데모 검사 |
| `npm run test:demo` | 잘못된 입력, 생성 결과, 결과 확인, 종료·재시작, 390px 화면과 폼 제출 |

테스트용 브라우저는 로컬 예시와 코드를 실행하며, 실행기가 만든 로컬 서버와 브라우저는 종료 시 정리. 실제 프로젝트의 서버 연동·업무 규칙·스크린리더·실기기 터치와 가상 키보드는 별도 확인 대상.

## 공개 데모 보기

`docs/demo.html` 파일을 브라우저에서 직접 열거나, 저장소 루트에서 로컬 서버 실행.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:4173/docs/demo.html` 방문. 종료는 서버를 실행한 터미널에서 Ctrl+C.

데모는 설명을 위한 별도 예약 예시. 실제 고객 데이터·서버 호출·영구 저장 없이 브라우저 메모리만 사용. 분석·CSV 카드에는 실행 기능을 제공하지 않으며, 다른 도메인의 학습 목표 소개용으로 표시.

## 이미지와 GIF 다시 만들기

원본은 `docs/visuals/hero.html`과 `docs/demo.html`. FFmpeg 설치 후 실행.

```sh
npm run images
```

결과:

- `docs/images/hero.png`: 프로젝트 소개 이미지.
- `docs/images/walkthrough.gif`: 학습 선택부터 결과 확인까지의 단계별 장면.
- `docs/images/result.png`: 저장 결과를 확인하는 정지 화면.

이미지는 실제 브라우저로 렌더링한 자체 제작 예시. 폰트는 시스템 폰트 사용으로 운영체제에 따라 모양 차이 가능. GIF에는 핵심 장면별 정지 시간이 있으며 README에 동일한 텍스트 설명 제공.

## 스킬만 수정할 때

`skills/oh-my-tutorial`이 배포 원본. 핵심 지침은 `SKILL.md`, 조건별 상세 내용은 `references/`, 실제 출력에 가져갈 선택적 코드는 `assets/`에 배치.

브라우저 유틸리티 검증기는 스킬 폴더에도 포함. 다른 프로젝트에 복사한 후 해당 스킬의 [공개 패턴 문서](../skills/oh-my-tutorial/references/open-source-patterns.md)에 있는 독립 실행 방법 사용 가능.

새 지침은 관찰한 실패나 실제 사용 사례를 근거로 좁게 추가. 특정 도메인의 화면·용어·이벤트를 모든 프로젝트의 필수 전제로 만들지 않는 기준. 출처가 있는 자료의 재사용 시 [기존 고지](../skills/oh-my-tutorial/references/upstream-notices.md)와 해당 라이선스 유지.
