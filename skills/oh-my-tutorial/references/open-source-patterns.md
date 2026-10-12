# 공개 프로젝트에서 가져온 구현 패턴

웹 안내 도구를 고르거나 대상 탐색·표현을 구현할 때만 읽는다. 아래 프로젝트의 장점을 이 스킬의 직접 수행·결과 검증 방식에 맞게 각색했다. 다른 도메인·네이티브 앱에 웹 도구를 강제로 적용하지 않는다.

## 도구 선택

| 후보 | 적용하기 좋은 조건 | 가져올 부분 | 적용 전 확인 |
|---|---|---|---|
| 프로젝트의 기존 안내·팝오버 | 필요한 표현과 상호작용을 이미 지원 | 기존 테마·접근성·배치 처리 | 실제 수행과 종료까지 연결 가능한가 |
| [Driver.js](https://driverjs.com/) | DOM 요소 중심의 강조와 팝오버가 필요 | 강조·배치·갱신·표시 수명주기 | 포커스 제한, 여러 조작 영역, 설치 버전의 API |
| [Onborda](https://github.com/uixmat/onborda) | 기존 React/Next 환경과 의존성이 맞음 | 진행 정보와 교체 가능한 카드의 분리 | 카드만 예쁘게 바꿔도 업무 완료 검증은 별도 |
| [Usertour](https://github.com/usertour/skills) | 이미 운영하거나 사용자가 서비스 기반 저작·배포를 원함 | 목표별 안내 유형, 맥락 조건, 작성·검증·진단 흐름 | 계정·SDK·MCP·배포 환경이 실제 요구인가 |
| [embedded-uiux-walkthrough](https://github.com/Tanwyhang/embedded-uiux-walkthrough) | 실제 컴포넌트를 사용한 격리 체험이 필요 | 데모 공급자, 같은 document에서 측정, 반응형 대상 탐색 | 자동 재생과 입력 차단은 직접 연습의 기본값이 아님 |

라이브러리를 정한 뒤에는 프로젝트의 lockfile·설치된 타입·공식 문서를 확인한다. 저장소 최신 소스와 배포된 패키지의 API가 같다고 가정하지 않는다. Usertour를 실제 선택한 경우에만 해당 도구의 현재 authoring guide·schema를 조회한다. 이 스킬만 사용하려고 외부 서비스를 연결할 필요는 없다.

원본 전체를 복제하는 대신 이미 있는 모듈을 사용하거나 필요한 표현 계층만 연결한다. 라이브러리의 다음 단계, 마지막 단계, 닫힘 상태를 학습 성공의 원본 상태로 사용하지 않는다.

## Driver.js를 표현 계층으로 연결

`highlight(step)`로 현재 승인된 단계를 표시하는 방식은 진행을 프로젝트가 소유할 때 적합하다. 단순 설명 투어에는 `drive()`도 가능하지만, 직접 수행 단계의 모든 진행 경로를 같은 완료 조건으로 통과시킨다.

| 기능 | 연결 방법 |
|---|---|
| 현재 단계 표시 | 준비된 실제 `Element`를 `highlight({ element, popover })`에 전달 |
| 다음·이전 | `popover.onNextClick`·`onPrevClick`에서 진행 관리자에 요청; 표현 계층이 자체 성공 판정하지 않음 |
| 동적 화면 | 앱의 화면 준비를 기다린 뒤 대상을 찾아 표시; 고정 시간 지연으로 성공 판정하지 않음 |
| 사용자 종료 | `onCloseClick`·`onDestroyStarted`를 같은 종료 처리로 연결; 종료 처리가 대기 취소·정리 후 `destroy()` 호출 |
| 위치 변화 | 필요한 스크롤·레이아웃 변화에서 `refresh()`; 대상 노드 교체는 새로 찾아 다시 표시 |
| 테마 | `popoverClass` 또는 `onPopoverRender`로 기존 제품의 토큰과 컴포넌트 적용 |
| 정리 | 완료·중단·언마운트에서 `destroy()`; `onDestroyed` 자체를 학습 완료 이벤트로 쓰지 않음 |

`onNextClick`을 재정의하면 자동 다음 이동을 대신하게 된다. `drive()` 방식에서는 조건이 충족된 뒤에만 `moveNext()`를 호출한다. `highlight()` 방식에서는 진행 관리자가 새 단계를 정하고 다시 표시한다. 두 진행 방식을 섞어 중복 전환하지 않는다.

확인한 1.9.0 소스에서 주의할 실제 동작:

- `waitForElement`는 대상 존재 대기다. 목표 수행·입력 가능·올바른 목록 행까지 보장하지 않는다.
- `advanceOnClick`은 클릭을 다음 요청으로 연결한다. 저장·결제·서버 처리 성공의 근거가 아니다.
- `skipMissingElement`는 누락 단계를 건너뛸 수 있다. 필수 과제를 성공으로 처리하려고 켜지 않는다.
- `allowKeyboardControl: false`는 방향키·Escape 제어를 끄지만 **Tab 포커스 제한은 별도**다. 강조 요소의 자손 밖에 있는 포털 메뉴, 별도 드래그 목적지, 복수 입력 영역은 실제 키보드·포인터로 검증한다. 안 맞으면 해당 단계에 기존 패널이나 다른 표현 방식을 사용한다. 전역 키 이벤트를 억지로 가로채는 보정부터 넣지 않는다.
- Escape 제어를 끈 경우에도 보이는 종료 버튼을 유지하고 기존 제품의 Escape 동작과 충돌하지 않게 한다.
- 문자열 제목·설명은 HTML로 처리된다. 사용자 입력을 그대로 전달하지 말고 프로젝트의 안전한 텍스트 렌더링 또는 정제 방식을 따른다.

브라우저 요소를 얻는 작은 시작점:

```ts
import { waitForTutorialTarget } from './browser-target'

// entry.signal은 이 단계의 이탈·종료 때 abort되는 기존 수명주기 신호다.
const element = await waitForTutorialTarget({
  selector: '[data-tutorial="create-item"]',
  root: activePageRoot,
  signal: entry.signal,
  timeoutMs: 5000,
})
// 대기 직후 종료된 경우도 표시하지 않는다.
if (!entry.signal.aborted) {
  guide.highlight({
    element,
    popover: {
      title: '첫 항목 만들기',
      description: '필수 정보를 입력하고 저장한 결과를 확인하세요.',
      showButtons: ['close'],
      onCloseClick: () => runtime.exit(),
    },
  })
}
```

`activePageRoot`, `entry`, `guide`, `runtime`은 연결 위치를 보여주는 예시 이름이다. 실제 프로젝트의 화면·세션·진행 API에 매핑하고, 거절된 대기는 아래 오류 정책으로 처리한다. 이 예시는 생성 성공 판정을 구현한 전체 튜토리얼이 아니다.

## 재사용 코드: 표시 대상 탐색

[browser-target.ts](../assets/browser-target.ts)는 외부 패키지 없는 선택적 TypeScript 자산이다. 필요한 프로젝트의 공용 UI 유틸리티에 복사·변형한다. 기존 도구가 같은 일을 하면 중복 도입하지 않는다.

- `inspectTutorialTarget(selector, root)`: `missing`, `hidden`, `ambiguous`, `invalid-selector`, `ready`를 구분한다. 실제 표시 후보가 하나일 때만 반환한다.
- `waitForTutorialTarget({ selector, root, signal, timeoutMs })`: 유효한 대상이 생길 때까지 제한된 시간 동안 기다린다. 단계의 `AbortSignal`을 필수로 받으며 성공·실패·취소 시 프레임과 타이머를 정리한다.
- 기본 제한은 예시값이다. 앱의 로딩 특성에 맞춰 정하고 무한 대기로 바꾸지 않는다. 잘못된 선택자는 즉시 실패하며, 일시적인 중복은 준비 시간 안에서 해소될 수 있다.
- `timeoutMs`는 1 이상 2,147,483,647 이하의 유한한 밀리초 값이다. 이 범위를 벗어나면 `RangeError`로 거절한다. 브라우저 타이머 범위를 넘는 값이 즉시 시간 초과로 바뀌는 것을 방지한다.
- 탐색 중에만 animation frame마다 검사한다. 스타일 전환·반응형 교체가 DOM mutation 없이 일어나는 경우도 관찰하려는 선택이다. 앱에 신뢰할 수 있는 준비 이벤트가 있으면 먼저 사용하고, 장기적인 감시나 모든 요소의 추적에 이 함수를 쓰지 않는다.

| 결과 | 호출자의 처리 |
|---|---|
| `AbortError` | 이탈한 단계의 결과를 무시; 튜토리얼을 다시 열지 않음 |
| `TutorialTargetError` / `invalid-selector` | 연결 오류를 고침; 사용자에게는 종료 가능한 안내 제공 |
| `TutorialTargetError` / `timeout` | `inspection.status`로 부재·숨김·중복을 구분; 재시도 또는 종료; 과제 완료로 처리하지 않음 |
| 정상 반환 | 필요한 스크롤·입력 준비·가림 여부를 확인한 후 표시 |

반환값은 **DOM에 연결되고 레이아웃 박스가 있으며 CSS상 숨김·완전 투명이 아닌 유일한 요소**다. 화면 밖 요소는 스크롤로 접근할 수 있으므로 제외하지 않는다. viewport 안 후보를 임의 우선해 다른 업무 행을 선택하지 않는다. 중복이면 페이지·업무 ID로 선택자 범위를 좁힌다.

이 함수는 겹침·clip-path·overflow 잘림·비활성 입력·포털의 포커스 경로·성공 조건을 판정하지 않는다. 스크롤·가상 목록 준비와 좌표 측정도 호출자의 책임이다. 일반 DOM 또는 명시적으로 전달한 같은 origin의 Document/ShadowRoot만 탐색하며 iframe·shadow root를 자동 순회하지 않는다. 접근 가능한 슬롯의 표시 조상은 추적하지만, 닫힌 shadow root가 감춘 슬롯 관계는 컴포넌트의 준비 상태로 보완한다. iframe의 부모 자체가 숨겨졌는지는 외부 호스트가 확인한다. 문서·iframe이 제거되거나 이동할 때도 소유한 단계의 signal을 abort한다. 네이티브 앱에는 해당 플랫폼의 준비·대상 API를 쓴다.

### 코드 변경 후 재검증

[verify-browser-target.mjs](../scripts/verify-browser-target.mjs)는 현재 자산을 엄격한 TypeScript 설정으로 검사하고 실제 Chromium에서 실행한다. 숨김·중복·지연·취소·타이머 정리·슬롯·iframe·반응형 대상 선택을 검증한다. 스킬 사용 때마다 실행할 필요는 없고, 자산을 수정했거나 대상 환경에 맞게 변형할 때 사용한다.

테스트 전용 디렉터리에 `typescript`와 `playwright-core`가 필요하다. 기존 도구 경로를 사용할 수 있으며 제품 의존성에 추가할 필요는 없다. 다음은 스킬 디렉터리에서 실행하는 POSIX 셸 예시다. `TUTORIAL_BROWSER`에는 사용 가능한 Chrome/Chromium 실행 파일의 절대 경로를 먼저 지정한다. 두 번째 인자를 생략하려면 해당 Playwright 버전에 맞는 브라우저가 이미 설치돼 있어야 한다.

```sh
tutorial_tools="$(mktemp -d)"
npm install --prefix "$tutorial_tools" --no-save --ignore-scripts --package-lock=false typescript@5.6.3 playwright-core@1.64.0
node scripts/verify-browser-target.mjs "$tutorial_tools" "$TUTORIAL_BROWSER"
```

버전은 검증에 사용한 조합이며 제품에 강제되는 의존성이 아니다. 실행기는 패키지·브라우저를 설치하거나 외부 서비스에 접속하지 않고, 로컬 임시 서버와 새 headless 브라우저를 종료 시 정리한다. 도구 디렉터리는 재검증할 동안 보관하고 더 필요 없으면 생성한 그 디렉터리만 정리한다. 이 검증은 전체 튜토리얼·Driver.js 연결·접근성·모바일 터치를 보증하지 않는다.

## 출처와 차용 범위

아래 revision은 조사한 소스를 재현하기 위한 값이며 앞으로 설치할 버전의 고정 요구가 아니다. 문서와 코드를 재배포할 때 각색에 사용한 [저작권·라이선스 고지](upstream-notices.md)도 보존한다.

| 원본 | 확인한 revision | 반영한 내용 | 가져오지 않은 전제 |
|---|---|---|---|
| [Usertour skills](https://github.com/usertour/skills/tree/a6f41de1e69bb3bb3a25c29314e64e33d48eacf6) | `a6f41de` · MIT | 독립 과제/순차 흐름 구분, 맥락별 노출, 실제 조작을 따라가는 진행, 조건별 진단 | 서비스 필수 연결, 모든 요청의 게시, 고정 단계 수 |
| [Driver.js](https://github.com/nilbuild/driver.js/tree/cc398049bde916d7e256f72a3f84e5eb4ba14506/packages/driver) | `cc39804` · package 1.9.0 · MIT | 표현과 진행 분리, 비동기 연결, 실제 API·포커스 제약 확인 | 클릭·누락·닫힘을 학습 성공으로 간주 |
| [embedded-uiux-walkthrough](https://github.com/Tanwyhang/embedded-uiux-walkthrough/tree/15086255d0c5dfa52fcc8c6f6ca6b177a1154423) | `1508625` · MIT | 실제 컴포넌트의 데모 경로, 같은 document의 좌표, 숨겨진 반응형 대상 제외 | 자동 재생 필수, 사용자 입력 전면 차단, 전역 자동 클릭 플래그 |
| [Onborda](https://github.com/uixmat/onborda/tree/e865eb4089fb86b58ed75ca0e4742bcc59f81b31) | `e865eb4` · package 1.2.5의 MIT 표기 | 교체 가능한 카드 인터페이스를 설계 참고 | React/Next 의존성 강제, 구현 코드 복사 |

Usertour의 진단 접근은 [공식 MCP 문서](https://docs.usertour.io/api-reference-v2/mcp)의 `diagnose_content`를 참고했다. 단계 수, 마케팅 분석, 세그먼트 관리 등은 이 스킬의 필수 산출물로 확장하지 않았다.

`browser-target.ts`는 embedded-uiux-walkthrough의 표시 대상 필터링 아이디어를 바탕으로 새로 작성했다. 원본에 없는 중복 진단, 취소 가능한 제한 대기, document별 탐색을 추가했다. 상위 프로젝트의 런타임이나 전체 스킬을 그대로 포함하지 않는다.
