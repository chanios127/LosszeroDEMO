---
name: _base
description: LossZero 프로젝트 기반 컨텍스트. 모든 세션에 자동 로드.
user-invocable: false
---

## 채널 구조

| 채널 | 역할 | 별칭 |
|------|------|------|
| DB0  | Base DB — 표준 테이블/메타데이터/표준 프로시저 원본 보유 | `base`, `standard`, `meta` |
| DB1  | Logic DB — 실제 비즈니스 DB (기본값) | `logic`, `biz` |
| DB2  | Logic DB2 — (optional) 상호참조용 추가 비즈니스 DB | `logic2`, `cross` |

**기본 채널은 DB1.**

---

## 채널 선택 판단 기준

### 쿼리 실행 (`Query.py`)

| 상황 | 채널 |
|------|------|
| 일반 업무 데이터 조회 | DB1 (기본값) |
| DB2가 명시적으로 언급된 경우 | DB2 |
| 표준 테이블 직접 조회 (`LzDxp*`, `Ac*` 계열) | DB0 |
| 표준 + 전용 JOIN이 필요한 경우 | 표준 컬럼 정의는 DB0 참조 후, 실데이터는 DB1 |

### 표준 vs 전용 판별 (`meta.py`)

- **표준 테이블**: `LzDxpColumnLayoutInfo`(DB0)에 등재된 테이블 → DB0 소속
- **전용 테이블**: 미등재 → DB1 또는 DB2 소속
- **표준 프로시저**: DB0, DB1 모두 보유
- **전용 프로시저**: 해당 DB에만 존재

테이블 소속이 불명확하면 `find_object(name)`으로 전 채널 탐색 후 판단.

---

## 메타데이터 조회 함수 (`meta.py`)

쿼리 전에 스키마 파악이 필요할 때 아래 함수를 사용.  
**import 또는 CLI 두 방식 모두 가능.**

### `column_info(table_name)` — 컬럼 정의 조회
```bash
python meta.py column_info LzDxp140T
```
- 표준 테이블 → DB0 `LzDxpColumnLayoutInfo` 기준 반환 (ColumnTitle, SeqNo, ComboCd 포함)
- 전용 테이블 → DB1 `sys.columns` 물리 스키마 반환

### `standard_tables()` — 표준 테이블 목록
```bash
python meta.py standard_tables
```
- DB0 `LzDxpColumnLayoutInfo`에 등재된 테이블 전체 목록

### `table_list(db, pattern)` — 채널별 테이블 목록
```bash
python meta.py table_list --db 1 --pattern LzDxp
```
- `*` 표시 = DB0 표준 테이블에도 등재된 테이블

### `proc_list(db, type, pattern)` — 프로시저/함수/트리거 목록
```bash
python meta.py proc_list --db 1 --type procedure --pattern LzDxp
python meta.py proc_list --db 0 --type function
```
- type: `procedure` | `function` | `trigger`

### `find_object(name)` — 전 채널 객체 탐색
```bash
python meta.py find_object LzDxp140T
```
- 테이블명/프로시저명으로 어느 채널에 존재하는지 한번에 파악

---

## 공통 규칙
- 에러 발생 시 연결 정보 노출 금지
- 모든 연결은 읽기 전용 (`readonly=True`)
- DB2는 optional — `.env`에 `DB2_*` 미설정 시 `--channels`에 표시 안 됨
