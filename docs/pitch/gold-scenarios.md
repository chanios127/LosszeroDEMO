# PT 골드 시나리오 — 회귀 매뉴얼

이번주 PT용 골드 보고서 5종 추출 매뉴얼. 사용자 환경에서 backend + frontend 가동 후 매뉴얼대로 회귀 → 결과 만족 시 보관 → supervisor가 `storage/reports/` → `seed/reports/`로 git mv.

## 사전 준비

- 모델: **Claude Sonnet 권장** (LM Studio 경량/Gemma는 D11/A5로 chain fail 위험). LM Studio 사용 시 Qwen 2.5 32B+ 또는 추론 모델.
- TweaksPanel: `max_tokens=12000` / `thinking ON` (Claude 시) / `max_turns=15` 권장.
- 도메인 셀렉터: 시나리오별 도메인 사전 전환.
- 백엔드 reload 후 `storage/reports/` 비우고 시작 권장 (`python seed/load_reports.py --reset` after first seed batch).

## 시나리오 카탈로그 (5종)

| # | 제목 | 도메인 | 의도 신블록 | 가치 |
|---|---|---|---|---|
| 1 | 금월 직원 업무 현황 | groupware | kpi_grid · gantt · bubble_breakdown · ranked_list ×2 | 인사/조직 운영 KPI |
| 2 | 거래처 AS 패턴 90일 | 3z | kpi_grid(severity) · pie · ranked_list · bubble_breakdown · radar | 고객사 위험 관리 |
| 3 | 출근 정시율 추이 | groupware | kpi_grid · line_chart · ranked_list | 근태 trend |
| 4 | 업무 키워드 클러스터 | groupware | bubble_breakdown · ranked_list · markdown | 업무 흐름 인사이트 |
| 5 | AS 처리 SLA 모니터 | 3z | kpi_grid(severity) · gantt · highlight | 운영 알람 데모 |

---

## 1. 금월 직원 업무 현황 보고서

**도메인**: groupware

**프롬프트**:
```
이번달 직원 업무 현황 보고서를 만들어줘.
KPI 지표 (처리 건수 / 평균 응답시간 / 미처리 잔여 / 정시 출근율) 를 금일/금주/금월 비교로 보여주고,
부가자료로:
1) 금일 근태 현황 간트차트 (직원별 출근/퇴근 시각, 팀별 색상 — 시작/종료 시각 둘 다 SELECT 필수),
2) 금일 요청 처리 유형별 규모 버블차트,
3) 금일 우수 사원 Top 5 (출근 일찍 + 업무일지 작성량 많은 직원),
4) 금일 요주의 고객사 Top 5.
보관해줘.
```

**검수 체크리스트**:
- [ ] kpi_grid 4 metric 등장 + severity 라인
- [ ] gantt 블록의 `chart.y = ["clock_in", "clock_out"]` 같은 배열 (둘 다 존재)
- [ ] bubble_breakdown.bubble의 size/x 컬럼이 실제 data_ref에 존재
- [ ] ranked_list × 2 (사원 + 거래처)
- [ ] `domain: "groupware"` 정확 분류

---

## 2. 거래처별 AS 요청 패턴 분석 (90일)

**도메인**: 3z

**프롬프트**:
```
최근 90일 거래처별 AS 요청 패턴 분석 보고서 만들어줘.
1) 요청 건수 Top 3 거래처 ranked_list (재발률 secondary),
2) 거래처별 위험도 KPI (재발률 / 처리 지연 / VIP 여부 severity 표시),
3) 자주 등장하는 키워드 → 거래처별 집중도 분석 (markdown 결론 포함),
4) 주요 요청 유형 분포는 파이차트와 방사형 차트로 시각화.
   방사형 차트는 long format으로 — 각 행이 (category, value, series) 형태가 되도록 SQL을 짜줘.
보관해줘.
```

**검수 체크리스트**:
- [ ] kpi_grid의 severity가 alert/warning/neutral 다양하게 사용됨
- [ ] radar의 `data_ref`가 long format (wide → 빈 폴리곤 위험)
- [ ] ranked_list Top 3 highlight + secondary metric 표시
- [ ] `domain: "3z"` 정확 분류 (sticky 도메인 확인 필수)

---

## 3. 출근 정시율 추이 (최근 30일)

**도메인**: groupware

**프롬프트**:
```
최근 30일 출근 정시율 추이 보고서 만들어줘.
KPI: 평균 정시율 / 지각 평균 분 / 조퇴 횟수 / 무단결근 (severity 컬러).
일자별 정시율 line_chart로 추이 시각화.
정시율 가장 높은/낮은 직원 ranked_list Top 5.
보관해줘.
```

**검수 체크리스트**:
- [ ] line_chart x=날짜, y=정시율(%)
- [ ] kpi_grid 4 metric, severity 토큰 활용
- [ ] ranked_list 두 개 (best/worst) 또는 단일 highlight_top 활용

---

## 4. 직원 업무 키워드 클러스터

**도메인**: groupware

**프롬프트**:
```
최근 한달 업무일지 본문에서 자주 등장한 업무 키워드를 클러스터로 분석해줘.
키워드별 등장 빈도 + 작성자 다양성을 버블차트로 (size=빈도, x=작성자 수).
Top 10 키워드 ranked_list (작성자 수 secondary).
패턴 분석 결론은 markdown으로 정리.
보관해줘.
```

**검수 체크리스트**:
- [ ] bubble_breakdown.bubble.{size, x} 컬럼이 실제 data_ref에 존재
- [ ] ranked_list 10건 (limit=10)
- [ ] markdown 결론 본문 길이 적절

---

## 5. AS 처리 SLA 모니터 (최근 7일)

**도메인**: 3z

**프롬프트**:
```
최근 7일 AS 요청 처리 SLA 모니터링 보고서를 만들어줘.
KPI: 신규 접수 / 처리 완료 / 미처리 / SLA 위반 (severity alert).
일자별 처리 흐름을 간트차트로 (요청별 접수~완료 span).
SLA 위반 건은 highlight 블록으로 별도 표시.
보관해줘.
```

**검수 체크리스트**:
- [ ] kpi_grid 4 metric, "SLA 위반" severity=alert
- [ ] gantt 의 `chart.y = ["접수일시", "완료일시"]` 둘 다 SELECT 됨
- [ ] highlight level=alert/warning 1+ 등장
- [ ] `domain: "3z"`

---

## 회귀 후 supervisor에게 paste할 보고

```
## 골드 시나리오 회귀 결과

| # | 시나리오 | 모델 | chain | 신블록 등장 | 매핑 정합 | 보관 ID |
|---|---|---|---|---|---|---|
| 1 | 금월 업무 현황 | (모델명) | ✅/❌ | (5종 중 N) | (이슈 있는 블록) | <uuid> |
| 2 | 거래처 AS 90일 | ... | | | | |
| ... |

## 시드로 채택할 보고서 (사용자 결정)
- <uuid>.json — 채택 / 보류

## 발견된 결함 (있다면)
- ...
```

supervisor는 회신 받으면 `git mv storage/reports/<id>.json seed/reports/<id>.json` + 커밋.
