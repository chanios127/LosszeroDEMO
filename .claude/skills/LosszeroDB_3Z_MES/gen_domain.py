"""WPM 도메인 JSON 생성 스크립트"""
import json, sys
sys.path.insert(0, r"C:\ParkwooDevProjects\LosszeroDEMO\.claude\skills\LosszeroDB_3Z_MES")
from meta import table_list, column_info

DB1_TABLES = {"WPM_DayReport", "WPM_ItemTransMST", "WPM_ItemTransMSTDetail", "WPM_WorkPrdPlanMST"}

GROUPS = {
    "WPM_WorkPrdOrdMST":       "production_order",
    "WPM_WorkPrdMST":          "production_result",
    "WPM_WorkPrdLineMST":      "production_result",
    "WPM_WorkPrdMstBad":       "production_result",
    "WPM_WorkPrdMSTBOMInput":  "production_result",
    "WPM_WorkPrdMSTMatUse":    "production_result",
    "WPM_WorkPrdMSTScanInput": "production_result",
    "WPM_WorkPrdOrdMSTMatUse": "production_order",
    "WPM_WorkPrdPlanMST":      "production_plan",
    "WPM_WorkPrdReqMST":       "production_plan",
    "WPM_ItemTransMST":        "item_transfer",
    "WPM_ItemTransMSTDetail":  "item_transfer",
    "WPM_WorkQcChkList_PET":   "quality",
    "WPM_WorkQcChkList_PS":    "quality",
    "WPM_ItemRepairMST":       "repair",
    "WPM_ItemRepairMSTDetail": "repair",
    "WPM_MoldRepairReqMST":    "repair",
    "WPM_MachStopMST":         "facility",
    "WPM_InjectionReqMST":     "facility",
    "WPM_TryOutMST":           "facility",
    "WPM_CombinMST_DSC":       "facility",
    "WPM_DayReport":           "report",
    "WPM_AlarmCall":           "report",
    "WPM_BadAmtCalcMST":       "quality",
    "WPM_BadAmtCalcDetail":    "quality",
    "WPM_PlatMakeUse":         "material",
    "WPM_ReCycleLog":          "material",
}

JOINS = {
    "WPM_WorkPrdMST": [
        {"target": "dbo.WPM_WorkPrdOrdMST",      "on": "WPM_WorkPrdMST.woID = WPM_WorkPrdOrdMST.woID",            "type": "many_to_one", "description": "작업실적 → 작업지시"},
        {"target": "dbo.WPM_WorkPrdLineMST",      "on": "WPM_WorkPrdMST.workID = WPM_WorkPrdLineMST.workID",        "type": "one_to_many", "description": "작업실적 헤더 → 라인별 실적"},
        {"target": "dbo.WPM_WorkPrdMstBad",       "on": "WPM_WorkPrdMST.workID = WPM_WorkPrdMstBad.workID",         "type": "one_to_many", "description": "작업실적 → 불량 내역"},
        {"target": "dbo.WPM_WorkPrdMSTBOMInput",  "on": "WPM_WorkPrdMST.workID = WPM_WorkPrdMSTBOMInput.workID",    "type": "one_to_many", "description": "작업실적 → BOM 투입 내역"},
        {"target": "dbo.WPM_WorkPrdMSTMatUse",    "on": "WPM_WorkPrdMST.workID = WPM_WorkPrdMSTMatUse.workID",      "type": "one_to_many", "description": "작업실적 → 자재 사용 내역"},
        {"target": "dbo.WPM_WorkPrdMSTScanInput", "on": "WPM_WorkPrdMST.workID = WPM_WorkPrdMSTScanInput.workID",   "type": "one_to_many", "description": "작업실적 → 스캔 투입 내역"},
    ],
    "WPM_WorkPrdOrdMST": [
        {"target": "dbo.WPM_WorkPrdMST",          "on": "WPM_WorkPrdOrdMST.woID = WPM_WorkPrdMST.woID",            "type": "one_to_many", "description": "작업지시 → 작업실적"},
        {"target": "dbo.WPM_WorkPrdOrdMSTMatUse", "on": "WPM_WorkPrdOrdMST.woID = WPM_WorkPrdOrdMSTMatUse.woID",   "type": "one_to_many", "description": "작업지시 → 자재소요"},
    ],
    "WPM_WorkPrdLineMST": [
        {"target": "dbo.WPM_WorkPrdMST", "on": "WPM_WorkPrdLineMST.workID = WPM_WorkPrdMST.workID", "type": "many_to_one", "description": "라인실적 → 작업실적 헤더"},
    ],
    "WPM_WorkPrdMstBad": [
        {"target": "dbo.WPM_WorkPrdMST", "on": "WPM_WorkPrdMstBad.workID = WPM_WorkPrdMST.workID", "type": "many_to_one", "description": "불량 내역 → 작업실적"},
    ],
    "WPM_WorkPrdMSTBOMInput": [
        {"target": "dbo.WPM_WorkPrdMST", "on": "WPM_WorkPrdMSTBOMInput.workID = WPM_WorkPrdMST.workID", "type": "many_to_one", "description": "BOM 투입 → 작업실적"},
    ],
    "WPM_WorkPrdMSTMatUse": [
        {"target": "dbo.WPM_WorkPrdMST", "on": "WPM_WorkPrdMSTMatUse.workID = WPM_WorkPrdMST.workID", "type": "many_to_one", "description": "자재 사용 → 작업실적"},
    ],
    "WPM_WorkPrdMSTScanInput": [
        {"target": "dbo.WPM_WorkPrdMST", "on": "WPM_WorkPrdMSTScanInput.workID = WPM_WorkPrdMST.workID", "type": "many_to_one", "description": "스캔 투입 → 작업실적"},
    ],
    "WPM_ItemTransMST": [
        {"target": "dbo.WPM_ItemTransMSTDetail", "on": "WPM_ItemTransMST.ITID = WPM_ItemTransMSTDetail.ITID", "type": "one_to_many", "description": "이동 헤더 → 상세 품목 행"},
    ],
    "WPM_ItemTransMSTDetail": [
        {"target": "dbo.WPM_ItemTransMST", "on": "WPM_ItemTransMSTDetail.ITID = WPM_ItemTransMST.ITID", "type": "many_to_one", "description": "상세 행 → 이동 헤더"},
    ],
    "WPM_ItemRepairMST": [
        {"target": "dbo.WPM_ItemRepairMSTDetail", "on": "WPM_ItemRepairMST.IRID = WPM_ItemRepairMSTDetail.IRID", "type": "one_to_many", "description": "수리 헤더 → 수리 상세"},
    ],
    "WPM_ItemRepairMSTDetail": [
        {"target": "dbo.WPM_ItemRepairMST", "on": "WPM_ItemRepairMSTDetail.IRID = WPM_ItemRepairMST.IRID", "type": "many_to_one", "description": "수리 상세 → 수리 헤더"},
    ],
    "WPM_WorkPrdPlanMST": [
        {"target": "dbo.WPM_WorkPrdReqMST",  "on": "WPM_WorkPrdPlanMST.PReqID = WPM_WorkPrdReqMST.PReqID", "type": "many_to_one", "description": "생산계획 → 생산요청"},
        {"target": "dbo.WPM_WorkPrdOrdMST",  "on": "WPM_WorkPrdPlanMST.OrdID = WPM_WorkPrdOrdMST.OrdID",   "type": "many_to_one", "description": "생산계획 → 작업지시"},
    ],
    "WPM_WorkPrdReqMST": [
        {"target": "dbo.WPM_WorkPrdPlanMST", "on": "WPM_WorkPrdReqMST.PReqID = WPM_WorkPrdPlanMST.PReqID", "type": "one_to_many", "description": "생산요청 → 생산계획"},
    ],
    "WPM_BadAmtCalcMST": [
        {"target": "dbo.WPM_BadAmtCalcDetail", "on": "WPM_BadAmtCalcMST.calcID = WPM_BadAmtCalcDetail.calcID", "type": "one_to_many", "description": "불량금액 헤더 → 상세"},
    ],
}

EXCLUDE = {"WPM_WorkPrdMST_Bak_250227", "WPM_WorkPrdReqMST_20250930171759"}

tables = [t for t in table_list(0, "WPM") if t not in EXCLUDE]

result_tables = []
for tname in tables:
    cols_raw = column_info(tname)
    db_ch = 1 if tname in DB1_TABLES else 0

    columns = []
    for c in cols_raw:
        col = {
            "name":     c["ColumnNm"],
            "type":     c["DataType"] or "",
            "pk":       c.get("PK") == "Y",
            "nullable": c.get("AllowNULL") == "Y",
            "idx":      c.get("IDX") == "Y",
        }
        parts = []
        title = c.get("ColumnTitle")
        combo = c.get("ComboCd")
        if title: parts.append(title)
        if combo: parts.append(f"[콤보:{combo}]")
        if col["pk"]: parts.append("(PK)")
        col["description"] = " ".join(parts)
        columns.append(col)

    entry = {
        "name":        f"dbo.{tname}",
        "table_group": GROUPS.get(tname, "etc"),
        "db_channel":  db_ch,
        "description": "",
        "columns":     columns,
        "joins":       JOINS.get(tname, []),
    }
    result_tables.append(entry)

output = {
    "domain":       "production",
    "display_name": "생산실적",
    "keywords":     ["생산","실적","생산량","작업","공정","WPM","일보","작업계획","생산계획","투입","불량","수량","로트","이송","수리","금형","설비","QC","검사"],
    "table_groups": {
        "production_order":  "작업지시 — 생산 오더 및 자재 소요",
        "production_plan":   "생산계획 — 생산 요청/계획",
        "production_result": "생산실적 — 실적 헤더 및 상세(불량/BOM/자재/스캔)",
        "item_transfer":     "품목이송 — 생산 투입/산출 이동 트랜잭션",
        "quality":           "품질 — QC 체크리스트, 불량금액",
        "repair":            "수리보수 — 품목/금형 수리 및 의뢰",
        "facility":          "설비공정 — 기계정지, 사출의뢰, 트라이아웃",
        "report":            "보고 — 일보, 알람",
        "material":          "자재 — 플랫제작, 재활용",
    },
    "tables": result_tables,
}

out_path = r"C:\ParkwooDevProjects\LosszeroDEMO\backend\schema_registry\domains\production.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"[OK] {len(result_tables)}개 테이블 → {out_path}")
for t in result_tables:
    pks = [c["name"] for c in t["columns"] if c["pk"]]
    print(f"  {t['name']} ({len(t['columns'])}cols) pk={pks} group={t['table_group']} ch={t['db_channel']}")
