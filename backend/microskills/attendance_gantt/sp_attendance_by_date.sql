-- ============================================================================
-- sp_attendance_by_date — Microskill #1 (attendance_gantt) backing SP
-- ============================================================================
-- 사용처: backend/microskills/attendance_gantt/skill.py
-- 도메인: groupware
-- 의도: 특정 일자의 출근 기록을 직원명/부서명/출근시각/퇴근시각으로 반환
--
-- IMPORTANT: 부서명 컬럼은 사용자 환경의 부서 마스터 테이블에서 join 해 와야 함.
-- 본 SP 본문은 환경별 schema에 맞게 수정 필요. 아래는 reference shell.
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
        ISNULL(d.dName, CONVERT(NVARCHAR(50), a.at_DeptCd))
                                               AS [부서명],
        -- HH:MM 5자리 string으로 반환 (frontend GanttBlock parseT 정합)
        STUFF(STUFF(RIGHT('000000' + a.at_AttTm, 6), 5, 0, ':'), 3, 0, ':')
                                               AS [출근시각],
        CASE WHEN a.at_LeavTm IS NULL OR a.at_LeavTm = '' THEN NULL
             ELSE STUFF(STUFF(RIGHT('000000' + a.at_LeavTm, 6), 5, 0, ':'), 3, 0, ':')
        END                                    AS [퇴근시각]
    FROM dbo.TGW_AttendList a
    LEFT JOIN dbo.LZXP310T  u  ON a.at_UserID = u.Uid
    -- 부서 마스터: 환경에 맞게 교체 (예: dbo.TGW_Department / dbo.LZDept 등)
    LEFT JOIN dbo.TGW_Department d ON a.at_DeptCd = d.dCode
    WHERE CONVERT(date, a.at_AttDt) = @date
    ORDER BY [부서명], [출근시각];
END
GO

-- ============================================================================
-- 실 환경 적용 후, domains/groupware.json 의 stored_procedures 화이트리스트에 등록:
-- {
--   "name": "sp_attendance_by_date",
--   "params": [{"name": "@date", "type": "DATE"}],
--   "description": "일자별 직원 출근 기록"
-- }
-- ============================================================================
