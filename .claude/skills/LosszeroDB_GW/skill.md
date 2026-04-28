---
name: _base
description: LossZero GW 프로젝트 DB 컨텍스트. 모든 세션에 자동 로드.
user-invocable: false
---

## DB 구조

단일 DB. `.env`의 `MSSQL_*` 변수로 연결.

## DB 접근

```python
from connect import get_connection
conn = get_connection()
```

```bash
python Query.py "SELECT TOP 10 * FROM SomeTable"
python Query.py "SELECT TOP 10 * FROM SomeTable" --format csv
```

## 메타데이터 힌트

스키마 파악이 필요할 때 사용.

```bash
python meta.py table_list [--pattern FOO]   # TXP_TableInfo 기반 테이블 목록
python meta.py column_info TableName        # TXP_ColumnInfo + SYSCOLUMNS 기반 컬럼 구조
python meta.py find_object keyword          # 테이블·프로시저·함수·뷰 탐색
```

### 메타 테이블 구조
- `TXP_TableInfo` — 테이블 레지스트리 (ti_TableNm, ti_Module, ti_RowCnt, ti_UseFg)
- `TXP_ColumnInfo` — 컬럼 보충 정보 (ci_TableNm, ci_ColumnNm, ci_Comment, ci_Combo, ci_Rmk1~5)
- `column_info()` 는 `XP_TableUsedInfo` SP의 SYSCOLUMNS 조회 로직을 파라미터화하여 재현

## 공통 규칙
- 에러 발생 시 연결 정보 노출 금지
- 모든 연결은 읽기 전용 (`readonly=True`)
