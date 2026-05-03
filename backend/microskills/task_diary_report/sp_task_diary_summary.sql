-- ============================================================================
-- sp_task_diary_summary — Microskill #2 (task_diary_report) backing SP
-- ============================================================================
-- 사용처: backend/microskills/task_diary_report/skill.py
-- 도메인: groupware
-- 의도: 기간 + 키워드 CSV → 다중 결과셋
--
-- v3 (2026-05-03): 실 DB 메타 검증 후 재작성.
--   - TGW_TaskDailyLog: td_TDNo, td_myUid, td_myDept, td_writeDt, td_Title,
--                       td_Today varchar(8000) — 본문 (LIKE 검색 대상),
--                       td_Tomorrow varchar(4000)
--   - LZXP310T        : Uid → uName
--   - TCD_DeptCode    : dc_DeptCd → dc_DeptNm1 (옵션, 부서명 join용)
-- ============================================================================

IF OBJECT_ID('dbo.sp_task_diary_summary', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_task_diary_summary;
GO

CREATE PROCEDURE dbo.sp_task_diary_summary
    @start         DATE,
    @end           DATE,
    @keywords_csv  NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 키워드 split (NULL → preset 7종)
    DECLARE @kws TABLE ([keyword] NVARCHAR(50));
    IF @keywords_csv IS NULL OR LTRIM(RTRIM(@keywords_csv)) = ''
    BEGIN
        INSERT INTO @kws VALUES
            (N'재고'), (N'생산'), (N'키오스크'), (N'BOM'),
            (N'품질'), (N'원가'), (N'급여');
    END
    ELSE
    BEGIN
        INSERT INTO @kws ([keyword])
        SELECT LTRIM(RTRIM(value))
        FROM STRING_SPLIT(@keywords_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> '';
    END;

    DECLARE @days INT = DATEDIFF(DAY, @start, @end) + 1;

    -- 기간 내 일지 모음 (재사용 위해 임시 테이블)
    DECLARE @logs TABLE (
        td_TDNo    VARCHAR(10),
        td_myUid   VARCHAR(20),
        td_writeDt DATE,
        td_Title   NVARCHAR(200),
        td_Today   NVARCHAR(MAX)
    );
    INSERT INTO @logs
    SELECT
        td_TDNo,
        td_myUid,
        CONVERT(date, td_writeDt),
        td_Title,
        CAST(td_Today AS NVARCHAR(MAX))
    FROM dbo.TGW_TaskDailyLog
    WHERE CONVERT(date, td_writeDt) BETWEEN @start AND @end;

    -- ========================================================================
    -- 1) KPI: 총건수 / 작성자수 / 일평균 / 최다 키워드
    -- ========================================================================
    DECLARE @total   INT = (SELECT COUNT(*) FROM @logs);
    DECLARE @writers INT = (SELECT COUNT(DISTINCT td_myUid) FROM @logs);
    DECLARE @top_kw NVARCHAR(50) = (
        SELECT TOP 1 k.[keyword]
        FROM @kws k
        OUTER APPLY (
            SELECT COUNT(*) AS [cnt]
            FROM @logs l
            WHERE l.td_Today LIKE N'%' + k.[keyword] + N'%'
        ) c
        ORDER BY c.[cnt] DESC
    );

    SELECT
        @total                                AS [총건수],
        @writers                              AS [작성자수],
        CAST(ROUND(CAST(@total AS FLOAT) / NULLIF(@days, 0), 1) AS NVARCHAR(20))
                                              AS [일평균],
        ISNULL(@top_kw, N'-')                 AS [최다키워드];

    -- ========================================================================
    -- 2) 키워드 빈도: 키워드 / 빈도 / 작성자수
    -- ========================================================================
    SELECT
        k.[keyword]                           AS [키워드],
        ISNULL(c.[cnt], 0)                    AS [빈도],
        ISNULL(c.[writers], 0)                AS [작성자수]
    FROM @kws k
    OUTER APPLY (
        SELECT
            COUNT(*)                          AS [cnt],
            COUNT(DISTINCT l.td_myUid)        AS [writers]
        FROM @logs l
        WHERE l.td_Today LIKE N'%' + k.[keyword] + N'%'
    ) c
    WHERE ISNULL(c.[cnt], 0) > 0
    ORDER BY [빈도] DESC;

    -- ========================================================================
    -- 3) Top 작성자: 사용자명 / 작성건수 / 주요 키워드
    -- ========================================================================
    ;WITH wc AS (
        SELECT
            l.td_myUid,
            ISNULL(u.uName, l.td_myUid) AS uName,
            COUNT(*)                    AS cnt
        FROM @logs l
        LEFT JOIN dbo.LZXP310T u ON l.td_myUid = u.Uid
        GROUP BY l.td_myUid, u.uName
    ),
    top_writers AS (
        SELECT TOP 5 td_myUid, uName, cnt FROM wc ORDER BY cnt DESC
    ),
    writer_kws AS (
        SELECT
            tw.td_myUid,
            STUFF((
                SELECT TOP 3 N', ' + k.[keyword]
                FROM @kws k
                WHERE EXISTS (
                    SELECT 1 FROM @logs l2
                    WHERE l2.td_myUid = tw.td_myUid
                      AND l2.td_Today LIKE N'%' + k.[keyword] + N'%'
                )
                ORDER BY (
                    SELECT COUNT(*) FROM @logs l3
                    WHERE l3.td_myUid = tw.td_myUid
                      AND l3.td_Today LIKE N'%' + k.[keyword] + N'%'
                ) DESC
                FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')   AS top_kw
        FROM top_writers tw
    )
    SELECT
        tw.uName                              AS [사용자명],
        tw.cnt                                AS [작성건수],
        ISNULL(wk.top_kw, N'-')               AS [주요키워드]
    FROM top_writers tw
    LEFT JOIN writer_kws wk ON tw.td_myUid = wk.td_myUid
    ORDER BY tw.cnt DESC;
END
GO

-- ============================================================================
-- 등록 확인:
--   SELECT name FROM sys.procedures WHERE name = 'sp_task_diary_summary';
--
-- 실행 테스트:
--   EXEC dbo.sp_task_diary_summary @start='2026-04-01', @end='2026-04-30';
--   EXEC dbo.sp_task_diary_summary @start='2026-04-01', @end='2026-04-30',
--                                  @keywords_csv='재고,생산,BOM';
-- ============================================================================
