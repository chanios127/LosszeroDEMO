-- ============================================================================
-- sp_attendance_by_date — Microskill #1 (attendance_gantt) backing SP
-- ============================================================================
-- 사용처: backend/microskills/attendance_gantt/skill.py
-- 도메인: groupware
-- 의도: 특정 일자의 출근 기록을 직원명/부서명/출근시각/퇴근시각으로 반환
--
-- v2 (2026-05-03): TGW_Department 의존 제거. 부서코드 그대로 [부서명] 컬럼에
-- 노출 (예: '0800', '0300'). 환경에 부서 마스터 테이블이 있다면 아래 주석의
-- LEFT JOIN 라인을 활성화하고 컬럼명만 맞춰 사용.
-- ============================================================================

IF OBJECT_ID('dbo.sp_attendance_by_date', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_attendance_by_date;
GO

CREATE PROCEDURE dbo.sp_attendance_by_date
    @date DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.uName                                AS [사용자명],
        -- 부서명 — 마스터 테이블이 있는 환경에서는 ISNULL(d.dName, ...) 형태로 교체
        CONVERT(NVARCHAR(50), a.at_DeptCd)     AS [부서명],
        -- HH:MM:SS 5~8자리 string으로 반환 (frontend GanttBlock parseT 정합)
        CASE
            WHEN a.at_AttTm IS NULL OR a.at_AttTm = '' THEN NULL
            WHEN LEN(a.at_AttTm) >= 6 THEN
                STUFF(STUFF(RIGHT('000000' + a.at_AttTm, 6), 5, 0, ':'), 3, 0, ':')
            WHEN LEN(a.at_AttTm) >= 4 THEN
                STUFF(RIGHT('0000' + a.at_AttTm, 4), 3, 0, ':')
            ELSE a.at_AttTm
        END                                    AS [출근시각],
        CASE
            WHEN a.at_LeavTm IS NULL OR a.at_LeavTm = '' THEN NULL
            WHEN LEN(a.at_LeavTm) >= 6 THEN
                STUFF(STUFF(RIGHT('000000' + a.at_LeavTm, 6), 5, 0, ':'), 3, 0, ':')
            WHEN LEN(a.at_LeavTm) >= 4 THEN
                STUFF(RIGHT('0000' + a.at_LeavTm, 4), 3, 0, ':')
            ELSE a.at_LeavTm
        END                                    AS [퇴근시각]
    FROM dbo.TGW_AttendList a
    LEFT JOIN dbo.LZXP310T  u  ON a.at_UserID = u.Uid
    -- ▼ 부서 마스터 join (환경에 있을 때만 활성화 + 컬럼명 교체)
    -- LEFT JOIN dbo.<DEPT_MASTER> d ON a.at_DeptCd = d.<CODE_COL>
    WHERE CONVERT(date, a.at_AttDt) = @date
    ORDER BY [부서명], [출근시각];
END
GO

-- ============================================================================
-- 등록 확인:
--   SELECT name FROM sys.procedures WHERE name = 'sp_attendance_by_date';
--
-- 실행 테스트:
--   EXEC dbo.sp_attendance_by_date @date = '2026-04-30';
-- ============================================================================
