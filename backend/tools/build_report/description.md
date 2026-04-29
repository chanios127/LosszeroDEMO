# build_report

DB 조회 결과(`data_results`)를 받아 구조화된 분석 보고서 schema를 생성한다.

**호출 조건**: 사용자 의도에 "분석", "보고서", "요약", "현황 정리", "리포트", "레포트" 같은 키워드가 명시적으로 있을 때만 호출.
단순 질의(예: "어제 출근자 몇 명?")는 `db_query` 후 `final` 답변으로 종료하고 본 도구를 호출하지 말 것.

**호출 순서**: `db_query` (또는 `list_tables`/`sp_call`) → `build_report` → `build_view` → `final`.

**입력**:
- `user_intent`: 원 질의를 그대로 echo (보고서 의도를 명시)
- `data_results`: 직전 도구 출력의 `rows` + `columns` 배열 (1개 이상)

**출력**: ReportSchema JSON. 후속 단계에서 `build_view`가 받아 ViewBundle로 매핑.

도구 실패 시 에러가 표면화됨. LLM은 실패 메시지를 보고 재시도 또는 사용자에게 명시적으로 안내.
