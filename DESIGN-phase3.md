# DESIGN-phase3.md — 대화형 챗봇 UI + 쿼리 결과 시각화
> 작성: 2026-04-10 | 상태: 🔄 진행 중
> 전체 로드맵은 DESIGN.md 참조

---

## Phase 목표

사용자가 자연어로 질문하고 SQL 결과를 즉시 확인할 수 있는 UI를 완성한다.
좌측 챗 패널에서 대화하고, 우측 패널에서 생성된 SQL과 결과 테이블을 확인한다.
Schema 탭에서 @xyflow/react 기반 ER 다이어그램으로 테이블 구조를 탐색할 수 있다.

## 레이아웃 구조

```
┌─────────────────┬───────────────────────────────┐
│   Chat Panel    │   Results Panel               │
│                 │   ┌──────────────────────────┐│
│  [질문 버블]    │   │ SQL Block (생성된 SQL)   ││
│  [답변 버블]    │   ├──────────────────────────┤│
│  ...            │   │ Result Table             ││
│                 │   └──────────────────────────┘│
│  [입력창]       │   [Schema Graph 탭]           │
└─────────────────┴───────────────────────────────┘
```

## 디렉토리 구조 (추가분)

```
frontend/src/
├── types/index.ts              # QueryResponse, Message, TableInfo 타입
├── api/query.ts                # postQuery(), getSchema() API 함수
├── components/
│   ├── Chat/
│   │   ├── ChatPanel.tsx       # 대화 목록 + 입력창
│   │   ├── MessageBubble.tsx   # user/assistant 말풍선
│   │   └── QueryInput.tsx      # 텍스트 입력 + 전송 버튼
│   ├── Results/
│   │   ├── ResultsPanel.tsx    # SQL블록 + 테이블 탭 전환
│   │   ├── SqlBlock.tsx        # SQL 코드 블록 (복사 버튼 포함)
│   │   └── ResultTable.tsx     # 동적 컬럼 테이블
│   └── Schema/
│       └── SchemaGraph.tsx     # @xyflow/react + dagre ER 다이어그램
└── App.tsx                     # 2패널 레이아웃
```

## 세부 작업 목록

### 완료
_(없음)_

### 진행 중
- 🔄 DESIGN-phase3.md 작성 ← 현재 여기

### 대기
- 🔲 types/index.ts — 공유 타입 정의
- 🔲 api/query.ts — postQuery, getSchema
- 🔲 ChatPanel + MessageBubble + QueryInput
- 🔲 ResultsPanel + SqlBlock + ResultTable
- 🔲 SchemaGraph (@xyflow/react + dagre 레이아웃)
- 🔲 App.tsx 2패널 레이아웃 조립
- 🔲 dagre 패키지 추가 (package.json)

## 미해결 이슈

| 이슈 | 현황 |
|---|---|
| 없음 | - |

## 완료 기준

- [ ] 자연어 질문 입력 → 챗 버블로 표시
- [ ] 생성된 SQL이 우측 패널에 코드 블록으로 표시
- [ ] 쿼리 결과가 테이블로 표시
- [ ] Schema 탭에서 ER 다이어그램 렌더링

## 완료 시 처리

- [ ] 이 파일 상태를 ✅ 완료로 변경
- [ ] DESIGN.md 로드맵 Phase 3 → ✅ 완료 갱신
- [ ] 이 파일을 `_archive/` 로 이동
- [ ] `DESIGN-phase4.md` 생성
