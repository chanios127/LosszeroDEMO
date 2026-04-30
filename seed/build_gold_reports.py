"""Build 5 gold seed reports for PT demos.

Run from repo root::

    python seed/build_gold_reports.py

Writes 5 JSON files into seed/reports/, ready for:

    python seed/load_reports.py --reset

Each report is a hand-crafted, realistic dataset that exercises every new
block type (kpi_grid / chart{gantt|radar|pie|line} / bubble_breakdown /
ranked_list × N / markdown / highlight). Data shapes match the frontend
component expectations exactly — no LLM mapping errors.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = REPO_ROOT / "seed" / "reports"


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# ---------------------------------------------------------------------------
# 1. 금월 직원 업무 현황 (groupware) — KPI + Gantt + Bubble + Ranked × 2
# ---------------------------------------------------------------------------

def build_monthly_work_status() -> dict:
    return {
        "id": "gold-monthly-work",
        "title": "금월 직원 업무 현황 보고서",
        "created_at": _iso_now(),
        "domain": "groupware",
        "tags": ["근태", "업무현황", "금월", "KPI", "직원"],
        "summary": "금월 처리건수 1,247건 (전월 대비 +8.3%). 정시 출근율 94.1% 유지, 미처리 잔여 12건 (관리 가능 수준). 우수 사원 Top 3은 김나혁/조명국/변주영, 요주의 고객사는 옥스머티리얼즈·성수기전·동광전자.",
        "meta": {"blocks": 5, "dataRefs": 5, "schemaVersion": "2"},
        "schema": {
            "title": "금월 직원 업무 현황 보고서",
            "generated_from": "groupware: TGW_TaskDailyLog + TGW_AttendList + LZXP310T (금월)",
            "summary": {
                "headline": "금월 처리건수 1,247건 (+8.3% MoM), 정시 출근율 94.1% 유지. 미처리 12건은 관리 가능 수준.",
                "insights": [
                    "처리건수 전월 대비 +8.3%, 평균 응답시간 1h 18m (-12m)",
                    "정시 출근율 94.1%로 안정적이나 박창권/이재형 출근 지연 빈발",
                    "옥스머티리얼즈가 거래처 요청 28%로 단일 최대",
                    "우수 사원 Top 3 (김나혁/조명국/변주영) 평균 출근 08:35, 일지 작성량 평균 28% 상회",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "📊 금월 운영 KPI",
                    "columns": 4,
                    "metrics": [
                        {"label": "처리 건수", "value": 1247, "unit": "건", "delta": "+96 vs 전월", "trend": "up", "severity": "good"},
                        {"label": "평균 응답시간", "value": "1h 18m", "delta": "-12m", "trend": "down", "severity": "good"},
                        {"label": "미처리 잔여", "value": 12, "unit": "건", "delta": "+1", "trend": "up", "severity": "warning"},
                        {"label": "정시 출근율", "value": "94.1", "unit": "%", "delta": "+0.6pp", "trend": "up", "severity": "good"},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "gantt",
                    "data_ref": 0,
                    "x": "사용자명",
                    "y": ["출근시각", "퇴근시각"],
                    "group_by": "팀",
                    "title": "오늘 직원별 근태 (출근~퇴근)",
                },
                {
                    "type": "bubble_breakdown",
                    "title": "오늘 요청 처리 유형별 규모",
                    "data_ref": 1,
                    "bubble": {"label": "유형명", "size": "건수", "x": "평균응답분"},
                    "cards": [
                        {"title": "오류대응", "primary": "42건", "secondary": "평균 응답 38분", "tags": ["시스템오류", "데이터", "로그인"]},
                        {"title": "기능개선", "primary": "31건", "secondary": "평균 응답 92분", "tags": ["UI", "리포트", "권한"]},
                        {"title": "데이터문의", "primary": "24건", "secondary": "평균 응답 45분", "tags": ["수치불일치", "조회"]},
                        {"title": "환경설정", "primary": "9건", "secondary": "평균 응답 55분", "tags": ["설치", "네트워크"]},
                    ],
                    "layout": "row",
                },
                {
                    "type": "ranked_list",
                    "title": "오늘 우수 사원 Top 5",
                    "data_ref": 2,
                    "fields": {"name": "사용자명", "primary": "처리건수", "secondary": "출근시각_표시", "tags": "태그", "color_dot": "팀색상"},
                    "limit": 5,
                    "highlight_top": 3,
                    "subtitle": "출근 시각 + 일지 작성량 종합",
                },
                {
                    "type": "ranked_list",
                    "title": "오늘 요주의 고객사 Top 5",
                    "data_ref": 3,
                    "fields": {"name": "거래처명", "primary": "요청건수", "secondary": "재발률표시", "tags": "유형태그"},
                    "limit": 5,
                    "highlight_top": 3,
                    "subtitle": "업무일지 본문 등장 빈도 + 재발률",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "출근시각", "type": "string"},
                        {"name": "퇴근시각", "type": "string"},
                        {"name": "팀", "type": "string"},
                    ],
                    "rows": [
                        {"사용자명": "김나혁", "출근시각": "08:25", "퇴근시각": "18:45", "팀": "개발"},
                        {"사용자명": "정예지", "출근시각": "08:28", "퇴근시각": "18:30", "팀": "개발"},
                        {"사용자명": "조명국", "출근시각": "08:27", "퇴근시각": "18:01", "팀": "개발"},
                        {"사용자명": "변주영", "출근시각": "08:54", "퇴근시각": "18:01", "팀": "디자인"},
                        {"사용자명": "박민서", "출근시각": "08:58", "퇴근시각": "18:09", "팀": "디자인"},
                        {"사용자명": "박정우", "출근시각": "08:58", "퇴근시각": "19:30", "팀": "개발"},
                        {"사용자명": "조수진", "출근시각": "08:51", "퇴근시각": "18:00", "팀": "기획"},
                        {"사용자명": "차주명", "출근시각": "08:35", "퇴근시각": "18:20", "팀": "개발"},
                        {"사용자명": "박창권", "출근시각": "09:50", "퇴근시각": "19:10", "팀": "개발"},
                        {"사용자명": "이재형", "출근시각": "09:02", "퇴근시각": "19:00", "팀": "기획"},
                        {"사용자명": "서지민", "출근시각": "09:08", "퇴근시각": "18:00", "팀": "디자인"},
                        {"사용자명": "한지민", "출근시각": "08:00", "퇴근시각": "17:30", "팀": "디자인"},
                    ],
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "유형명", "type": "string"},
                        {"name": "건수", "type": "int"},
                        {"name": "평균응답분", "type": "int"},
                    ],
                    "rows": [
                        {"유형명": "오류대응", "건수": 42, "평균응답분": 38},
                        {"유형명": "기능개선", "건수": 31, "평균응답분": 92},
                        {"유형명": "데이터문의", "건수": 24, "평균응답분": 45},
                        {"유형명": "환경설정", "건수": 9, "평균응답분": 55},
                        {"유형명": "교육요청", "건수": 6, "평균응답분": 28},
                    ],
                },
                {
                    "id": 2,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "처리건수", "type": "string"},
                        {"name": "출근시각_표시", "type": "string"},
                        {"name": "태그", "type": "string"},
                        {"name": "팀색상", "type": "string"},
                    ],
                    "rows": [
                        {"사용자명": "김나혁", "처리건수": "23건", "출근시각_표시": "출근 08:25 · 일지 1.2k자", "태그": "개발,VIP대응", "팀색상": "oklch(0.72 0.13 230)"},
                        {"사용자명": "조명국", "처리건수": "21건", "출근시각_표시": "출근 08:27 · 일지 1.0k자", "태그": "개발", "팀색상": "oklch(0.72 0.13 230)"},
                        {"사용자명": "변주영", "처리건수": "18건", "출근시각_표시": "출근 08:54 · 일지 920자", "태그": "디자인,신규고객", "팀색상": "oklch(0.74 0.14 150)"},
                        {"사용자명": "박정우", "처리건수": "16건", "출근시각_표시": "출근 08:58 · 일지 870자", "태그": "개발,LosszeroDEMO", "팀색상": "oklch(0.72 0.13 230)"},
                        {"사용자명": "차주명", "처리건수": "15건", "출근시각_표시": "출근 08:35 · 일지 760자", "태그": "개발", "팀색상": "oklch(0.72 0.13 230)"},
                    ],
                },
                {
                    "id": 3,
                    "mode": "embed",
                    "columns": [
                        {"name": "거래처명", "type": "string"},
                        {"name": "요청건수", "type": "string"},
                        {"name": "재발률표시", "type": "string"},
                        {"name": "유형태그", "type": "string"},
                    ],
                    "rows": [
                        {"거래처명": "(주)옥스머티리얼즈", "요청건수": "12건", "재발률표시": "재발률 33%", "유형태그": "재고,오류,키오스크"},
                        {"거래처명": "(주)성수기전", "요청건수": "8건", "재발률표시": "재발률 25%", "유형태그": "품질,LOT,완료보고"},
                        {"거래처명": "동광전자(주)", "요청건수": "6건", "재발률표시": "재발률 17%", "유형태그": "전표,휴가,컬럼"},
                        {"거래처명": "에이유(넥스텍)", "요청건수": "5건", "재발률표시": "재발률 20%", "유형태그": "재고,LOG"},
                        {"거래처명": "아이탑스오토모티브", "요청건수": "4건", "재발률표시": "재발률 0%", "유형태그": "생산지그,바코드"},
                    ],
                },
                {
                    "id": 4,
                    "mode": "embed",
                    "columns": [
                        {"name": "기간", "type": "string"},
                        {"name": "처리건수", "type": "int"},
                    ],
                    "rows": [
                        {"기간": "전월", "처리건수": 1151},
                        {"기간": "금월", "처리건수": 1247},
                    ],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# 2. 거래처 AS 패턴 90일 (3z) — KPI(severity) + Pie + Ranked + Bubble + Radar
# ---------------------------------------------------------------------------

def build_customer_as_90d() -> dict:
    return {
        "id": "gold-customer-as-90d",
        "title": "거래처별 AS 요청 패턴 분석 (최근 90일)",
        "created_at": _iso_now(),
        "domain": "3z",
        "tags": ["AS", "거래처", "패턴", "90일", "alert"],
        "summary": "총 156건 / 24개 거래처. (주)옥스머티리얼즈 28% 단일 최대, 재발률 33%로 품질 이슈 패턴 감지. SLA 위반 4건 발생 — 근본 원인 분석 권장.",
        "meta": {"blocks": 7, "dataRefs": 5, "schemaVersion": "2"},
        "schema": {
            "title": "거래처별 AS 요청 패턴 분석 (최근 90일)",
            "generated_from": "3z MES: WB_IssueMaster + 거래처 mapping (90일 window)",
            "summary": {
                "headline": "총 156건 / 24개 거래처. 옥스머티리얼즈 28% 단일 최대, 재발률 33% 품질 이슈 감지. SLA 위반 4건.",
                "insights": [
                    "기능요청이 96% 비중 — 시스템 개선 수요 집중",
                    "옥스머티리얼즈는 재고/오류 카테고리 재발 패턴 (4/12 재발)",
                    "성수기전·옥스머티리얼즈는 방사형 분포에서 평균과 뚜렷한 편차",
                    "SLA 위반 4건 모두 작업유형='기능개선' + 처리상태='9'(대기) 조합",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "🚨 거래처 위험도 KPI",
                    "columns": 4,
                    "metrics": [
                        {"label": "총 요청", "value": 156, "unit": "건", "severity": "neutral"},
                        {"label": "최다 거래처 비중", "value": "28", "unit": "%", "delta": "옥스머티리얼즈", "severity": "warning"},
                        {"label": "재발률 (Top 1)", "value": "33", "unit": "%", "severity": "alert"},
                        {"label": "SLA 위반", "value": 4, "unit": "건", "delta": "기능개선 카테고리", "severity": "alert"},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "pie_chart",
                    "data_ref": 0,
                    "x": "작업유형명",
                    "y": "건수",
                    "title": "작업유형 분포",
                },
                {
                    "type": "ranked_list",
                    "title": "거래처별 요청 건수 Top 5",
                    "data_ref": 1,
                    "fields": {"name": "거래처명", "primary": "요청건수표시", "secondary": "재발률표시", "tags": "주요유형"},
                    "limit": 5,
                    "highlight_top": 3,
                },
                {
                    "type": "bubble_breakdown",
                    "title": "키워드 클러스터 (현안 제목 기반)",
                    "data_ref": 2,
                    "bubble": {"label": "키워드", "size": "등장횟수", "x": "거래처다양성"},
                    "cards": [
                        {"title": "재고", "primary": "32건 등장", "secondary": "8개 거래처", "tags": ["재고생성", "수불", "재고량"]},
                        {"title": "오류", "primary": "28건 등장", "secondary": "11개 거래처", "tags": ["프로그램", "팝업", "확인"]},
                        {"title": "기능", "primary": "24건 등장", "secondary": "15개 거래처", "tags": ["변경", "추가", "개선"]},
                    ],
                    "layout": "row",
                },
                {
                    "type": "chart",
                    "viz_hint": "radar",
                    "data_ref": 3,
                    "x": "category",
                    "y": "value",
                    "group_by": "series",
                    "title": "Top 3 거래처 vs 전사 평균 (카테고리별 분포)",
                },
                {
                    "type": "highlight",
                    "level": "alert",
                    "message": "옥스머티리얼즈 재발률 33%(4/12) — 재고 관리 로직 + 키오스크 자재 투입 패턴이 반복 발생. 근본 원인 워크숍 권장.",
                    "related_data": 1,
                },
                {
                    "type": "highlight",
                    "level": "warning",
                    "message": "SLA 위반 4건 모두 작업유형='2'(기능개선) + 처리상태='9'(대기). 기능 요청 SLA 정책 재검토 필요.",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "작업유형명", "type": "string"},
                        {"name": "건수", "type": "int"},
                    ],
                    "rows": [
                        {"작업유형명": "기능개선", "건수": 150},
                        {"작업유형명": "오류대응", "건수": 6},
                    ],
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "거래처명", "type": "string"},
                        {"name": "요청건수표시", "type": "string"},
                        {"name": "재발률표시", "type": "string"},
                        {"name": "주요유형", "type": "string"},
                    ],
                    "rows": [
                        {"거래처명": "(주)옥스머티리얼즈", "요청건수표시": "44건", "재발률표시": "재발률 33%", "주요유형": "재고,오류,키오스크"},
                        {"거래처명": "(주)성수기전", "요청건수표시": "31건", "재발률표시": "재발률 19%", "주요유형": "품질,LOT,완료보고"},
                        {"거래처명": "동광전자(주)", "요청건수표시": "18건", "재발률표시": "재발률 11%", "주요유형": "전표,컬럼,휴가"},
                        {"거래처명": "에이유(넥스텍)", "요청건수표시": "14건", "재발률표시": "재발률 14%", "주요유형": "재고,LOG"},
                        {"거래처명": "쓰리젯", "요청건수표시": "12건", "재발률표시": "재발률 8%", "주요유형": "검사성적서,부서"},
                    ],
                },
                {
                    "id": 2,
                    "mode": "embed",
                    "columns": [
                        {"name": "키워드", "type": "string"},
                        {"name": "등장횟수", "type": "int"},
                        {"name": "거래처다양성", "type": "int"},
                    ],
                    "rows": [
                        {"키워드": "재고", "등장횟수": 32, "거래처다양성": 8},
                        {"키워드": "오류", "등장횟수": 28, "거래처다양성": 11},
                        {"키워드": "기능변경", "등장횟수": 24, "거래처다양성": 15},
                        {"키워드": "BOM", "등장횟수": 9, "거래처다양성": 4},
                        {"키워드": "전표", "등장횟수": 8, "거래처다양성": 5},
                        {"키워드": "키오스크", "등장횟수": 6, "거래처다양성": 2},
                        {"키워드": "검사", "등장횟수": 5, "거래처다양성": 3},
                    ],
                },
                {
                    "id": 3,
                    "mode": "embed",
                    "columns": [
                        {"name": "category", "type": "string"},
                        {"name": "value", "type": "int"},
                        {"name": "series", "type": "string"},
                    ],
                    "rows": [
                        {"category": "재고", "value": 14, "series": "옥스머티리얼즈"},
                        {"category": "오류", "value": 9, "series": "옥스머티리얼즈"},
                        {"category": "기능", "value": 12, "series": "옥스머티리얼즈"},
                        {"category": "BOM", "value": 5, "series": "옥스머티리얼즈"},
                        {"category": "전표", "value": 1, "series": "옥스머티리얼즈"},
                        {"category": "검사", "value": 3, "series": "옥스머티리얼즈"},
                        {"category": "재고", "value": 4, "series": "성수기전"},
                        {"category": "오류", "value": 6, "series": "성수기전"},
                        {"category": "기능", "value": 11, "series": "성수기전"},
                        {"category": "BOM", "value": 2, "series": "성수기전"},
                        {"category": "전표", "value": 4, "series": "성수기전"},
                        {"category": "검사", "value": 4, "series": "성수기전"},
                        {"category": "재고", "value": 6, "series": "전사평균"},
                        {"category": "오류", "value": 7, "series": "전사평균"},
                        {"category": "기능", "value": 10, "series": "전사평균"},
                        {"category": "BOM", "value": 3, "series": "전사평균"},
                        {"category": "전표", "value": 3, "series": "전사평균"},
                        {"category": "검사", "value": 3, "series": "전사평균"},
                    ],
                },
                {
                    "id": 4,
                    "mode": "embed",
                    "columns": [
                        {"name": "처리상태명", "type": "string"},
                        {"name": "건수", "type": "int"},
                    ],
                    "rows": [
                        {"처리상태명": "완료", "건수": 142},
                        {"처리상태명": "대기", "건수": 12},
                        {"처리상태명": "취소", "건수": 2},
                    ],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# 3. 출근 정시율 추이 30일 (groupware) — KPI + Line + Ranked × 2
# ---------------------------------------------------------------------------

def build_attendance_trend_30d() -> dict:
    rows_trend = [
        {"날짜": f"04-{d:02d}", "정시율": v}
        for d, v in zip(
            range(1, 31),
            [92.1, 93.4, 94.5, 91.8, 88.2, 90.5, 92.7, 94.1, 95.0, 93.8,
             92.3, 91.0, 89.5, 93.6, 94.8, 95.2, 96.0, 94.3, 92.7, 91.5,
             93.8, 94.6, 95.1, 96.3, 94.7, 93.0, 90.8, 92.5, 94.0, 94.1],
        )
    ]
    return {
        "id": "gold-attendance-trend-30d",
        "title": "출근 정시율 추이 (최근 30일)",
        "created_at": _iso_now(),
        "domain": "groupware",
        "tags": ["근태", "정시율", "30일", "추이"],
        "summary": "30일 평균 정시율 93.2%. 4/15~17 피크(96%) 후 4/20~21 일시 하락(-3.4pp). 최우수 한지민 100%, 최저 박창권 76%.",
        "meta": {"blocks": 4, "dataRefs": 3, "schemaVersion": "2"},
        "schema": {
            "title": "출근 정시율 추이 (최근 30일)",
            "generated_from": "groupware: TGW_AttendList (최근 30일)",
            "summary": {
                "headline": "30일 평균 정시율 93.2%, 변동폭 ±3.5pp. 4/20~21 일시 하락 후 회복.",
                "insights": [
                    "4/15~17 피크 96%대 — 월중 안정 구간",
                    "4/20~21 -3.4pp 하락 (회의 중복 + 외근 일정과 상관)",
                    "한지민 30일 100% 정시 / 박창권 76%로 격차 큼",
                    "지각 평균 분: 22m → 17m (전주 대비 -5m)",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "📈 정시율 KPI (30일)",
                    "columns": 4,
                    "metrics": [
                        {"label": "평균 정시율", "value": "93.2", "unit": "%", "delta": "+1.4pp", "trend": "up", "severity": "good"},
                        {"label": "지각 평균", "value": 17, "unit": "분", "delta": "-5m", "trend": "down", "severity": "good"},
                        {"label": "조퇴 횟수", "value": 8, "unit": "건", "delta": "+2", "trend": "up", "severity": "neutral"},
                        {"label": "무단 결근", "value": 0, "unit": "건", "severity": "good"},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "line_chart",
                    "data_ref": 0,
                    "x": "날짜",
                    "y": "정시율",
                    "title": "일자별 정시 출근율 (%)",
                },
                {
                    "type": "ranked_list",
                    "title": "정시율 우수 Top 5",
                    "data_ref": 1,
                    "fields": {"name": "사용자명", "primary": "정시율표시", "secondary": "평균출근시각", "tags": "팀"},
                    "limit": 5,
                    "highlight_top": 3,
                },
                {
                    "type": "ranked_list",
                    "title": "정시율 개선 필요 Bottom 5",
                    "data_ref": 2,
                    "fields": {"name": "사용자명", "primary": "정시율표시", "secondary": "지각횟수", "tags": "팀"},
                    "limit": 5,
                    "highlight_top": 0,
                    "subtitle": "조치 필요 — 코칭/일정 조율 권장",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "날짜", "type": "string"},
                        {"name": "정시율", "type": "float"},
                    ],
                    "rows": rows_trend,
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "정시율표시", "type": "string"},
                        {"name": "평균출근시각", "type": "string"},
                        {"name": "팀", "type": "string"},
                    ],
                    "rows": [
                        {"사용자명": "한지민", "정시율표시": "100%", "평균출근시각": "08:02", "팀": "디자인"},
                        {"사용자명": "조명국", "정시율표시": "98%", "평균출근시각": "08:24", "팀": "개발"},
                        {"사용자명": "정예지", "정시율표시": "97%", "평균출근시각": "08:30", "팀": "개발"},
                        {"사용자명": "김나혁", "정시율표시": "97%", "평균출근시각": "08:31", "팀": "개발"},
                        {"사용자명": "차주명", "정시율표시": "96%", "평균출근시각": "08:35", "팀": "개발"},
                    ],
                },
                {
                    "id": 2,
                    "mode": "embed",
                    "columns": [
                        {"name": "사용자명", "type": "string"},
                        {"name": "정시율표시", "type": "string"},
                        {"name": "지각횟수", "type": "string"},
                        {"name": "팀", "type": "string"},
                    ],
                    "rows": [
                        {"사용자명": "박창권", "정시율표시": "76%", "지각횟수": "지각 7회", "팀": "개발"},
                        {"사용자명": "이재형", "정시율표시": "82%", "지각횟수": "지각 5회", "팀": "기획"},
                        {"사용자명": "박정우", "정시율표시": "85%", "지각횟수": "지각 4회", "팀": "개발"},
                        {"사용자명": "서지민", "정시율표시": "87%", "지각횟수": "지각 4회", "팀": "디자인"},
                        {"사용자명": "조수진", "정시율표시": "89%", "지각횟수": "지각 3회", "팀": "기획"},
                    ],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# 4. 업무 키워드 클러스터 (groupware) — Bubble + Ranked + Markdown
# ---------------------------------------------------------------------------

def build_task_keyword_cluster() -> dict:
    return {
        "id": "gold-task-keyword-cluster",
        "title": "최근 한달 업무일지 키워드 클러스터 분석",
        "created_at": _iso_now(),
        "domain": "groupware",
        "tags": ["업무일지", "키워드", "클러스터", "한달"],
        "summary": "30일 업무일지 본문 토큰 기반 클러스터링. 최다 키워드 '재고'(187회/9명), 가장 다양한 '문의'(124회/14명). 개발팀 집중 키워드는 'BOM' / 'LOT', 디자인팀은 '레이아웃' / '컬러'.",
        "meta": {"blocks": 3, "dataRefs": 2, "schemaVersion": "2"},
        "schema": {
            "title": "업무일지 키워드 클러스터 (최근 30일)",
            "generated_from": "groupware: TGW_TaskDailyLog 본문 토큰화 + 작성자 다양성 집계",
            "summary": {
                "headline": "30일 업무일지 키워드 분석. 재고(187회/9명) 최다, 문의(124회/14명) 가장 다양.",
                "insights": [
                    "재고 / BOM / LOT는 개발팀에 집중 (작성자 4명 이내) — MES 도메인 작업 비중 ↑",
                    "문의 / 확인 / 요청은 작성자 14명 이상 — 일상 운영 키워드",
                    "키오스크 / 퍼블리싱은 디자인팀 전용 keyword (작성자 2명 이내)",
                    "오류 / 수정 / 변경은 모든 팀에 공통 — 일관된 운영 부담",
                ],
            },
            "blocks": [
                {
                    "type": "bubble_breakdown",
                    "title": "키워드 클러스터 (size=빈도, x=작성자 수)",
                    "data_ref": 0,
                    "bubble": {"label": "키워드", "size": "빈도", "x": "작성자수"},
                    "cards": [
                        {"title": "재고", "primary": "187회 / 9명", "secondary": "MES 운영 핵심", "tags": ["BOM", "LOT", "수불"]},
                        {"title": "문의", "primary": "124회 / 14명", "secondary": "일상 운영 keyword", "tags": ["확인", "안내", "요청"]},
                        {"title": "오류", "primary": "98회 / 12명", "secondary": "전 팀 공통 부담", "tags": ["수정", "확인", "재현"]},
                        {"title": "기능", "primary": "76회 / 11명", "secondary": "개선 요청 흐름", "tags": ["추가", "변경", "개선"]},
                    ],
                    "layout": "row",
                },
                {
                    "type": "ranked_list",
                    "title": "Top 10 키워드 (빈도순)",
                    "data_ref": 1,
                    "fields": {"name": "키워드", "primary": "빈도표시", "secondary": "작성자수표시", "tags": "주요팀"},
                    "limit": 10,
                    "highlight_top": 3,
                },
                {
                    "type": "markdown",
                    "content": "## 결론 — 업무 흐름 패턴\n\n키워드 분포는 우리 조직의 일상 운영 4축을 명확히 드러냄:\n\n1. **MES 운영축** (재고 / BOM / LOT) — 개발팀 4명 이내 집중. 도메인 깊이 있으나 인적 의존성 ↑.\n2. **고객 응대축** (문의 / 확인 / 안내) — 작성자 14명 이상. 부담 분산 양호.\n3. **오류 처리축** (오류 / 수정 / 재현) — 전 팀 공통. 표준 프로세스 정의 시 효율 ↑.\n4. **개선 요청축** (기능 / 추가 / 변경) — 11명. 분류·우선순위화 자동화 검토 권장.\n\n**제언**: MES 운영축의 작성자 다양성을 8명 이상으로 확대하기 위한 크로스 트레이닝 프로그램 검토.",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "키워드", "type": "string"},
                        {"name": "빈도", "type": "int"},
                        {"name": "작성자수", "type": "int"},
                    ],
                    "rows": [
                        {"키워드": "재고", "빈도": 187, "작성자수": 9},
                        {"키워드": "문의", "빈도": 124, "작성자수": 14},
                        {"키워드": "오류", "빈도": 98, "작성자수": 12},
                        {"키워드": "기능", "빈도": 76, "작성자수": 11},
                        {"키워드": "BOM", "빈도": 64, "작성자수": 4},
                        {"키워드": "LOT", "빈도": 52, "작성자수": 3},
                        {"키워드": "전표", "빈도": 41, "작성자수": 7},
                        {"키워드": "키오스크", "빈도": 28, "작성자수": 2},
                        {"키워드": "퍼블리싱", "빈도": 22, "작성자수": 2},
                        {"키워드": "테스트", "빈도": 18, "작성자수": 9},
                    ],
                },
                {
                    "id": 1,
                    "mode": "embed",
                    "columns": [
                        {"name": "키워드", "type": "string"},
                        {"name": "빈도표시", "type": "string"},
                        {"name": "작성자수표시", "type": "string"},
                        {"name": "주요팀", "type": "string"},
                    ],
                    "rows": [
                        {"키워드": "재고", "빈도표시": "187회", "작성자수표시": "9명 작성", "주요팀": "개발"},
                        {"키워드": "문의", "빈도표시": "124회", "작성자수표시": "14명 작성", "주요팀": "전체"},
                        {"키워드": "오류", "빈도표시": "98회", "작성자수표시": "12명 작성", "주요팀": "전체"},
                        {"키워드": "기능", "빈도표시": "76회", "작성자수표시": "11명 작성", "주요팀": "전체"},
                        {"키워드": "BOM", "빈도표시": "64회", "작성자수표시": "4명 작성", "주요팀": "개발"},
                        {"키워드": "LOT", "빈도표시": "52회", "작성자수표시": "3명 작성", "주요팀": "개발"},
                        {"키워드": "전표", "빈도표시": "41회", "작성자수표시": "7명 작성", "주요팀": "개발,기획"},
                        {"키워드": "키오스크", "빈도표시": "28회", "작성자수표시": "2명 작성", "주요팀": "디자인"},
                        {"키워드": "퍼블리싱", "빈도표시": "22회", "작성자수표시": "2명 작성", "주요팀": "디자인"},
                        {"키워드": "테스트", "빈도표시": "18회", "작성자수표시": "9명 작성", "주요팀": "전체"},
                    ],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# 5. AS 처리 SLA 모니터 7일 (3z) — KPI(severity) + Gantt + Highlight × 2
# ---------------------------------------------------------------------------

def build_sla_monitor_7d() -> dict:
    return {
        "id": "gold-sla-monitor-7d",
        "title": "AS 처리 SLA 모니터링 (최근 7일)",
        "created_at": _iso_now(),
        "domain": "3z",
        "tags": ["AS", "SLA", "7일", "alert", "운영"],
        "summary": "7일 신규 38건 / 처리 33건 / 미처리 5건. SLA 위반 2건 (옥스머티리얼즈 1, 성수기전 1) — 모두 24h 초과. 평균 처리 시간 8.2h.",
        "meta": {"blocks": 4, "dataRefs": 1, "schemaVersion": "2"},
        "schema": {
            "title": "AS 처리 SLA 모니터링 (최근 7일)",
            "generated_from": "3z MES: WB_IssueMaster 접수~완료 timestamp (최근 7일)",
            "summary": {
                "headline": "7일 신규 38건 / 처리 33건 / 미처리 5건. SLA 위반 2건. 평균 처리 8.2h.",
                "insights": [
                    "SLA 정책 = 일반 24h / VIP 8h. 위반 2건 모두 일반 24h 카테고리",
                    "옥스머티리얼즈 #26-00146 / 성수기전 #26-00153 = 모두 기능개선 + 다부서 협의 필요 케이스",
                    "처리 시간 분포: 30%가 4h 이내, 60%가 16h 이내, 10%가 24h 초과",
                    "VIP 트랙은 SLA 100% 준수 — 일반 트랙 처리 우선순위 재조정 필요",
                ],
            },
            "blocks": [
                {
                    "type": "kpi_grid",
                    "title": "🚨 SLA KPI (최근 7일)",
                    "columns": 4,
                    "metrics": [
                        {"label": "신규 접수", "value": 38, "unit": "건", "severity": "neutral"},
                        {"label": "처리 완료", "value": 33, "unit": "건", "delta": "처리율 87%", "severity": "good"},
                        {"label": "미처리 잔여", "value": 5, "unit": "건", "severity": "warning"},
                        {"label": "SLA 위반", "value": 2, "unit": "건", "delta": "일반 24h 초과", "severity": "alert"},
                    ],
                },
                {
                    "type": "chart",
                    "viz_hint": "gantt",
                    "data_ref": 0,
                    "x": "현안번호",
                    "y": ["접수시각", "완료시각"],
                    "group_by": "거래처명",
                    "title": "현안별 접수~완료 흐름",
                },
                {
                    "type": "highlight",
                    "level": "alert",
                    "message": "SLA 위반 2건 발견. 옥스머티리얼즈 #26-00146 (28h)과 성수기전 #26-00153 (31h) — 모두 기능개선 카테고리에서 다부서 협의로 인한 지연.",
                    "related_data": 0,
                },
                {
                    "type": "highlight",
                    "level": "warning",
                    "message": "미처리 잔여 5건 중 3건이 접수 후 18h 경과 — 추가 SLA 위반 위험. 우선순위 검토 권장.",
                },
            ],
            "data_refs": [
                {
                    "id": 0,
                    "mode": "embed",
                    "columns": [
                        {"name": "현안번호", "type": "string"},
                        {"name": "접수시각", "type": "string"},
                        {"name": "완료시각", "type": "string"},
                        {"name": "거래처명", "type": "string"},
                    ],
                    "rows": [
                        {"현안번호": "26-00146", "접수시각": "08:30", "완료시각": "12:30", "거래처명": "옥스머티리얼즈"},
                        {"현안번호": "26-00147", "접수시각": "09:15", "완료시각": "11:45", "거래처명": "쓰리젯"},
                        {"현안번호": "26-00148", "접수시각": "10:00", "완료시각": "14:20", "거래처명": "아이탑스"},
                        {"현안번호": "26-00149", "접수시각": "11:30", "완료시각": "13:00", "거래처명": "동광전자"},
                        {"현안번호": "26-00150", "접수시각": "13:00", "완료시각": "17:15", "거래처명": "에스티씨"},
                        {"현안번호": "26-00151", "접수시각": "14:20", "완료시각": "16:45", "거래처명": "연희화학"},
                        {"현안번호": "26-00152", "접수시각": "15:00", "완료시각": "18:30", "거래처명": "에이유"},
                        {"현안번호": "26-00153", "접수시각": "16:10", "완료시각": "19:50", "거래처명": "성수기전"},
                    ],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

BUILDERS = [
    build_monthly_work_status,
    build_customer_as_90d,
    build_attendance_trend_30d,
    build_task_keyword_cluster,
    build_sla_monitor_7d,
]


def main() -> int:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for fn in BUILDERS:
        report = fn()
        target = SEED_DIR / f"{report['id']}.json"
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        written += 1
        print(f"  wrote  {target.name}  blocks={len(report['schema']['blocks'])}  data_refs={len(report['schema']['data_refs'])}")
    print(f"built {written} gold reports → {SEED_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
