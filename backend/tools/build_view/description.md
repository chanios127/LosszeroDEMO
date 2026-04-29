# build_view

ReportSchema(build_report 출력)를 받아 ViewBundle을 생성한다. 각 block을 프론트엔드 컴포넌트에 매핑하고, chart block의 x/y/group_by가 누락된 경우 데이터 컬럼에서 추론한다.

**호출 조건**: `build_report` 출력 직후에만 호출. `build_report`를 먼저 호출하지 않은 상태에서 호출 금지.

**호출 순서**: `db_query` → `build_report` → `build_view` → final.

**입력**:
- `report_schema`: build_report가 반환한 ReportSchema JSON object

**출력**: ViewBundle JSON — enriched ReportSchema(chart 축 채워짐) + 컴포넌트 라우팅 힌트.
