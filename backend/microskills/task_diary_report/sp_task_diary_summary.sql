-- ============================================================================
-- sp_task_diary_summary — Microskill #2 (task_diary_report) backing SP
-- ============================================================================
-- 사용처: backend/microskills/task_diary_report/skill.py
-- 도메인: groupware
-- 의도: 기간 + 키워드 CSV 입력 → 다중 결과셋 (KPI / 키워드 빈도 / Top 작성자)
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

    -- ========================================================================
    -- 1) KPI: 총건수 / 작성자수 / 일평균 / 최다 키워드
    -- ========================================================================
    DECLARE @total INT = (
        SELECT COUNT(*) FROM dbo.TGW_TaskDailyLog
        WHERE CONVERT(date, td_writeDt) BETWEEN @start AND @end
    );
    DECLARE @writers INT = (
        SELECT COUNT(DISTINCT td_myUid) FROM dbo.TGW_TaskDailyLog
        WHERE CONVERT(date, td_writeDt) BETWEEN @start AND @end
    );
    DECLARE @top_kw NVARCHAR(50) = (
        SELECT TOP 1 k.[keyword]
        FROM @kws k
        OUTER APPLY (
            SELECT COUNT(*) AS [cnt]
            FROM dbo.TGW_TaskDailyLog t
            WHERE CONVERT(date, t.td_writeDt) BETWEEN @start AND @end
              AND t.td_Today LIKE '%' + k.[keyword] + '%'
        ) c
        ORDER BY c.[cnt] DESC
    );

    SELECT
        @total                                AS [총건수],
        @writers                              AS [작성자수],
        CAST(ROUND(CAST(@total AS FLOAT) / NULLIF(@days, 0), 1) AS NVARCHAR(20))
                                              AS [일평균],
        ISNULL(@top_kw, '-')                  AS [최다키워드];

    -- ========================================================================
    -- 2) 키워드 빈도: 키워드 / 빈도 / 작성자수
    -- ========================================================================
    SELECT
        k.[keyword]                           AS [키워드],
        SUM(c.[cnt])                          AS [빈도],
        SUM(c.[writers])                      AS [작성자수]
    FROM @kws k
    OUTER APPLY (
        SELECT
            COUNT(*)                                AS [cnt],
            COUNT(DISTINCT t.td_myUid)              AS [writers]
        FROM dbo.TGW_TaskDailyLog t
        WHERE CONVERT(date, t.td_writeDt) BETWEEN @start AND @end
          AND t.td_Today LIKE '%' + k.[keyword] + '%'
    ) c
    GROUP BY k.[keyword]
    HAVING SUM(c.[cnt]) > 0
    ORDER BY [빈도] DESC;

    -- ========================================================================
    -- 3) Top 작성자: 사용자명 / 작성건수 / 주요 키워드 (해당 기간 동안)
    -- ========================================================================
    ;WITH writer_counts AS (
        SELECT
            t.td_myUid,
            u.uName,
            COUNT(*) AS [작성건수]
        FROM dbo.TGW_TaskDailyLog t
        LEFT JOIN dbo.LZXP310T u ON t.td_myUid = u.Uid
        WHERE CONVERT(date, t.td_writeDt) BETWEEN @start AND @end
        GROUP BY t.td_myUid, u.uName
    ),
    writer_kws AS (
        SELECT
            t.td_myUid,
            STUFF((
                SELECT TOP 3 ', ' + k.[keyword]
                FROM @kws k
                WHERE EXISTS (
                    SELECT 1 FROM dbo.TGW_TaskDailyLog t2
                    WHERE t2.td_myUid = t.td_myUid
                      AND CONVERT(date, t2.td_writeDt) BETWEEN @start AND @end
                      AND t2.td_Today LIKE '%' + k.[keyword] + '%'
                )
                ORDER BY (
                    SELECT COUNT(*) FROM dbo.TGW_TaskDailyLog t3
                    WHERE t3.td_myUid = t.td_myUid
                      AND CONVERT(date, t3.td_writeDt) BETWEEN @start AND @end
                      AND t3.td_Today LIKE '%' + k.[keyword] + '%'
                ) DESC
                FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS [주요키워드]
        FROM (SELECT DISTINCT td_myUid FROM dbo.TGW_TaskDailyLog
              WHERE CONVERT(date, td_writeDt) BETWEEN @start AND @end) t
    )
    SELECT TOP 5
        wc.uName                              AS [사용자명],
        wc.[작성건수]                          AS [작성건수],
        ISNULL(wk.[주요키워드], '-')          AS [주요키워드]
    FROM writer_counts wc
    LEFT JOIN writer_kws wk ON wc.td_myUid = wk.td_myUid
    ORDER BY wc.[작성건수] DESC;
END
GO

-- ============================================================================
-- 등록: domains/groupware.json 의 stored_procedures 화이트리스트에 추가:
-- {
--   "name": "sp_task_diary_summary",
--   "params": [
--     {"name": "@start", "type": "DATE"},
--     {"name": "@end", "type": "DATE"},
--     {"name": "@keywords_csv", "type": "NVARCHAR(MAX)"}
--   ],
--   "description": "기간별 업무일지 KPI + 키워드 빈도 + Top 작성자 (다중 결과셋)"
-- }
-- ============================================================================
