-- ============================================================================
-- sp_attendance_by_date — Microskill #1 (attendance_gantt) backing SP
-- ============================================================================
-- 사용처: backend/microskills/attendance_gantt/skill.py
-- 도메인: groupware
-- 의도: 특정 일자의 직원 출근/퇴근 기록을 부서명/사용자명과 함께 반환
--
-- v3 (2026-05-03): 실 DB 메타 검증 후 재작성 (LosszeroDB_GW skill).
--   - TGW_AttendList: at_AttDt(datetime), at_UserID, at_DeptCd, at_AttTm(varchar(10)), at_LeavTm(varchar(10))
--   - TCD_DeptCode  : dc_DeptCd PK, dc_DeptNm1 부서명(한글)
--   - LZXP310T      : Uid PK, uName 사용자명
--
-- 사용자 지정: LEFT JOIN TCD_DeptCode d ON a.at_DeptCd = d.dc_DeptCd
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
        ISNULL(u.uName, a.at_UserID)             AS [사용자명],
        ISNULL(d.dc_DeptNm1, a.at_DeptCd)        AS [부서명],
        -- HH:MM:SS 변환 (varchar(10) — '075528' 6자리 또는 '08:33:18' 8자리 모두 처리)
        CASE
            WHEN a.at_AttTm IS NULL OR a.at_AttTm = '' THEN NULL
            WHEN CHARINDEX(':', a.at_AttTm) > 0 THEN a.at_AttTm
            WHEN LEN(a.at_AttTm) >= 6 THEN
                STUFF(STUFF(RIGHT('000000' + a.at_AttTm, 6), 5, 0, ':'), 3, 0, ':')
            WHEN LEN(a.at_AttTm) >= 4 THEN
                STUFF(RIGHT('0000' + a.at_AttTm, 4), 3, 0, ':')
            ELSE a.at_AttTm
        END                                      AS [출근시각],
        CASE
            WHEN a.at_LeavTm IS NULL OR a.at_LeavTm = '' THEN NULL
            WHEN CHARINDEX(':', a.at_LeavTm) > 0 THEN a.at_LeavTm
            WHEN LEN(a.at_LeavTm) >= 6 THEN
                STUFF(STUFF(RIGHT('000000' + a.at_LeavTm, 6), 5, 0, ':'), 3, 0, ':')
            WHEN LEN(a.at_LeavTm) >= 4 THEN
                STUFF(RIGHT('0000' + a.at_LeavTm, 4), 3, 0, ':')
            ELSE a.at_LeavTm
        END                                      AS [퇴근시각]
    FROM dbo.TGW_AttendList a
    LEFT JOIN dbo.LZXP310T    u ON a.at_UserID = u.Uid
    LEFT JOIN dbo.TCD_DeptCode d ON a.at_DeptCd = d.dc_DeptCd
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
