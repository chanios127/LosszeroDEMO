# LossZero LLM Harness — 컨셉 개요 (PT용)

> Claude Design 또는 외부 디자이너 위임 시 본 문서를 1차 입력으로 사용. 사이클 2 design intake처럼 무거운 패키지 X — 1페이지 컨셉 + 핵심 메시지 + 시각화 hint.

## 한 줄 정의

자연어로 묻는 사내 데이터, 디자인된 보고서로 응답하는 AI 분석 어시스턴트.

## 문제

사내 PM / 임원 / 영업이 데이터에 접근하려면 SQL 또는 BI 도구 학습 곡선을 넘어야 함. 분석 부서 의존 → 의사결정 지연.

## 솔루션

자연어 질의 → 도구 chain (`db_query → build_schema → build_view`) → 디자인된 인터랙티브 보고서 + HITL 보관 게이트.

## 4 Pillars (철학)

1. **자연어 → 의사결정 가능한 보고서** — SQL 격차 해소. 8 블록 카탈로그(KPI · Gantt · Bubble · Radar · Ranked · Markdown · Metric · Highlight)로 의도에 맞는 시각화 자동 선택.
2. **Sub-agent chain + HITL** — LLM이 직접 결과 출력 X. ReportSchema → ViewBundle → 사용자 보관 결정 단계로 환각을 게이트. 보관된 보고서만 archive에 영속.
3. **도메인 격리 + 디자인 잠금** — JSON schema_registry로 다중 도메인(현재 그룹웨어 + 3z MES) 격리. OKLCH 디자인 토큰 + severity 4단계 + dark/light 테마.
4. **Provider Agnostic** — Claude API와 LM Studio 둘 다 지원. 모델 교체 시 코드 무변경. 환경변수 / TweaksPanel 슬라이더로 런타임 조절.

## 사용자 흐름 (3 step)

```
1. 자연어 질의                    "거래처별 AS 패턴 90일 분석해줘"
        ↓
2. AI가 8 블록으로 보고서 작성    KPI / Radar / Ranked / Bubble / Markdown
        ↓
3. 사용자 보관 결정 (HITL)         📥 보관 / ✎ 수정 후 보관 / 🗑 버리기
```

## 차별점 (vs 일반 BI / 일반 LLM 챗봇)

| 항목 | 일반 BI | 일반 LLM 챗봇 | LossZero Harness |
|---|---|---|---|
| 자연어 질의 | ❌ | ✅ | ✅ |
| 사내 DB 직접 접근 | ✅ | ❌ | ✅ (도메인 격리) |
| 디자인된 시각화 | ⚠️ 정해진 dashboard | ⚠️ 텍스트 위주 | ✅ 8 블록 카탈로그 + 토큰 시스템 |
| 환각 게이트 (HITL) | N/A | ❌ | ✅ |
| 영속/검색 가능 archive | ✅ | ❌ | ✅ |
| 모델 교체 비용 | N/A | ⚠️ Vendor lock | ✅ Provider agnostic |

## 시스템 구조 (1 줄 다이어그램용)

```
[User] → [AgentLoop] → [Tools: db_query / list_tables / sp_call]
                    ↘ [Sub-agents: build_schema → build_view → report_generate]
                    ↘ [HITL Gate: ReportProposalCard]
                    ↘ [Archive: ReportArchivePage]
```

## 시각 키 (스크린샷 캡처 대상)

| # | 화면 | 의도 |
|---|---|---|
| 1 | AgentChatPage 시나리오 1 결과 (인라인 ReportContainer) | 자연어→보고서 한 컷 |
| 2 | AgentChatPage 시나리오 2 결과 (Radar/Bubble) | 시각 임팩트 |
| 3 | ReportProposalCard sticky bar | HITL 게이트 |
| 4 | ReportArchivePage list + detail | 영속/검색/Drilldown |
| 5 | TweaksPanel LLM 섹션 (slider 4종) | 운영 컨트롤 노출 |
| 6 | DataTable Drilldown 모달 | 원본 데이터 검증 가능 |
| 7 | 다크/라이트 테마 토글 비교 | 디자인 시스템 강도 |

## 로드맵 (PT 슬라이드용)

- **현재 (Cycle 2 종료)**: 8 블록 카탈로그 + Archive + HITL + Tweaks
- **Phase 12**: backend 코드 분리 (확장 비용 ↓) + LLM helper 추출
- **다음 사이클**:
  - 도메인 추가 (MES production, 회계, HR 등)
  - Export (PDF / PPT / 공유 링크)
  - Sub-agent 카탈로그 (anomaly_detector, comparison_agent)
  - 세션 영속화 (in-memory → SQLite/Redis)

## 기술 stack (1 슬라이드용)

| 영역 | 기술 |
|---|---|
| LLM Provider | Claude API (Sonnet/Opus) + LM Studio (Qwen/Llama) |
| Backend | FastAPI + Pydantic + asyncio + SSE |
| DB | pyodbc + SQL Server (사내 환경) |
| Frontend | React 18 + Vite + TypeScript |
| 시각화 | Recharts (인라인) + 커스텀 SVG (Gantt/Radar/Bubble) |
| 디자인 토큰 | OKLCH + CSS variables + 다크/라이트 + severity (4) |
| 영속화 | JSON 파일 (현재) → SQLite/Redis (예정) |

## Claude Design 위임 명세 (간략)

본 문서를 외부 Claude Design 도구에 1차 입력으로 줄 때:

- **만들어 줄 것**: PT 슬라이드 표지 1장 + "4 Pillars" 인포그래픽 1장 + "사용자 흐름 3 step" 다이어그램 1장 + 결론 슬라이드 1장
- **사용할 색**: 우리 codebase의 OKLCH 토큰 (브랜드 cyan `oklch(0.70 0.15 185)` 메인). 다크 테마 기본.
- **타이포**: Pretendard Variable / Inter / JetBrains Mono (코드).
- **참조**: `frontend/src/design/index.css` 토큰 + `design-export/cycle2-output/losszerodemo-2/project/tokens.css` (사이클 2 산출물)
- **무거운 추가 산출물 X** — 표지/인포 4장만. 나머지는 supervisor가 reveal.js/markdown으로 직접 작성.
