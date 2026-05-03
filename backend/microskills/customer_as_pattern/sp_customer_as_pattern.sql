-- ============================================================================
-- sp_customer_as_pattern — Microskill #3 (customer_as_pattern) backing SP
-- ============================================================================
-- 사용처: backend/microskills/customer_as_pattern/skill.py
-- 도메인: 3z
-- 의도: 기간 + 거래처 필터(옵션) + 키워드 CSV 입력 → 다중 결과셋
--   1) KPI: 총건수 / 거래처수 / 최다거래처 / 재발률
--   2) 작업유형 분포: 작업유형명 / 건수
--   3) Top 거래처: 거래처명 / 요청건수 / 재발률 / 주요유형
--   4) 키워드 클러스터: 키워드 / 등장횟수 / 거래처다양성
--   5) Radar long format: category / value / series  (거래처 Top 3 + '전사평균' × 키워드)
--
-- IMPORTANT: 본 SP는 사용자 환경의 실제 AS/현안 테이블 schema 에 맞춰 본문 교체 필수.
-- 아래는 reference shell — 컬럼명/테이블명은 조정 필요.
-- ============================================================================

IF OBJECT_ID('dbo.sp_customer_as_pattern', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_customer_as_pattern;
GO

CREATE PROCEDURE dbo.sp_customer_as_pattern
    @days          INT = 90,
    @vendor        NVARCHAR(200) = NULL,
    @keywords_csv  NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @start DATE = DATEADD(DAY, -@days + 1, CAST(GETDATE() AS DATE));
    DECLARE @end   DATE = CAST(GETDATE() AS DATE);

    -- 키워드 CSV split (NULL → preset 7종)
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
        SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@keywords_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> '';
    END;

    -- 환경 적합 schema에 맞게 source view 또는 temp table 구성.
    -- 여기서는 dbo.WB_IssueMaster (현안 마스터) + dbo.WB_CustomerMaster 가정.
    DECLARE @issues TABLE (
        wb_IssueNo NVARCHAR(50),
        wb_CustNm  NVARCHAR(200),
        wb_Title   NVARCHAR(500),
        wb_TypeCd  NVARCHAR(10),
        wb_TypeNm  NVARCHAR(50),
        wb_StatCd  NVARCHAR(10),
        wb_ReqDt   DATE
    );
    INSERT INTO @issues
    SELECT
        i.wb_IssueNo,
        c.wb_CustNm,
        i.wb_Title,
        i.wb_TypeCd,
        t.wb_TypeNm,
        i.wb_StatCd,
        CONVERT(date, i.wb_ReqDt)
    FROM dbo.WB_IssueMaster i
    LEFT JOIN dbo.WB_CustomerMaster c ON i.wb_CustCd = c.wb_CustCd
    LEFT JOIN dbo.WB_TypeMaster     t ON i.wb_TypeCd = t.wb_TypeCd
    WHERE CONVERT(date, i.wb_ReqDt) BETWEEN @start AND @end
      AND (@vendor IS NULL OR c.wb_CustNm LIKE '%' + @vendor + '%');

    -- ========================================================================
    -- 1) KPI
    -- ========================================================================
    DECLARE @total INT = (SELECT COUNT(*) FROM @issues);
    DECLARE @vendors INT = (SELECT COUNT(DISTINCT wb_CustNm) FROM @issues);
    DECLARE @top_vendor NVARCHAR(200) = (
        SELECT TOP 1 wb_CustNm FROM @issues
        WHERE wb_CustNm IS NOT NULL
        GROUP BY wb_CustNm ORDER BY COUNT(*) DESC
    );
    -- 재발률 = 동일 거래처에서 같은 키워드가 2회 이상 등장한 케이스 비율
    DECLARE @recur INT = (
        SELECT COUNT(*) FROM (
            SELECT i.wb_CustNm, k.[keyword], COUNT(*) AS cnt
            FROM @issues i CROSS JOIN @kws k
            WHERE i.wb_Title LIKE '%' + k.[keyword] + '%'
            GROUP BY i.wb_CustNm, k.[keyword]
            HAVING COUNT(*) >= 2
        ) x
    );
    DECLARE @recur_pct NVARCHAR(20) =
        CAST(CAST(ROUND(100.0 * @recur / NULLIF(@total, 0), 1) AS DECIMAL(5,1))
             AS NVARCHAR(20)) + '%';

    SELECT
        @total                                AS [총건수],
        @vendors                              AS [거래처수],
        ISNULL(@top_vendor, '-')              AS [최다거래처],
        ISNULL(@recur_pct, '0%')              AS [재발률];

    -- ========================================================================
    -- 2) 작업유형 분포
    -- ========================================================================
    SELECT
        ISNULL(wb_TypeNm, '(기타)')           AS [작업유형명],
        COUNT(*)                              AS [건수]
    FROM @issues
    GROUP BY wb_TypeNm
    ORDER BY [건수] DESC;

    -- ========================================================================
    -- 3) Top 거래처
    -- ========================================================================
    ;WITH vc AS (
        SELECT
            wb_CustNm,
            COUNT(*) AS req_cnt,
            STUFF((
                SELECT TOP 3 ', ' + k.[keyword]
                FROM @kws k
                WHERE EXISTS (
                    SELECT 1 FROM @issues i2
                    WHERE i2.wb_CustNm = ii.wb_CustNm
                      AND i2.wb_Title LIKE '%' + k.[keyword] + '%'
                )
                ORDER BY (
                    SELECT COUNT(*) FROM @issues i3
                    WHERE i3.wb_CustNm = ii.wb_CustNm
                      AND i3.wb_Title LIKE '%' + k.[keyword] + '%'
                ) DESC
                FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS top_kw
        FROM @issues ii
        WHERE wb_CustNm IS NOT NULL
        GROUP BY wb_CustNm
    )
    SELECT TOP 5
        vc.wb_CustNm                          AS [거래처명],
        vc.req_cnt                            AS [요청건수],
        ISNULL(
            CAST(CAST(ROUND(100.0 * (
                SELECT COUNT(*) FROM @issues i CROSS JOIN @kws k
                WHERE i.wb_CustNm = vc.wb_CustNm
                  AND i.wb_Title LIKE '%' + k.[keyword] + '%'
                GROUP BY i.wb_CustNm, k.[keyword]
                HAVING COUNT(*) >= 2
            ) / NULLIF(vc.req_cnt, 0), 1) AS DECIMAL(5,1)) AS NVARCHAR(20)) + '%',
            '0%'
        )                                     AS [재발률],
        ISNULL(vc.top_kw, '-')                AS [주요유형]
    FROM vc
    ORDER BY vc.req_cnt DESC;

    -- ========================================================================
    -- 4) 키워드 클러스터
    -- ========================================================================
    SELECT
        k.[keyword]                           AS [키워드],
        SUM(c.cnt)                            AS [등장횟수],
        SUM(c.diversity)                      AS [거래처다양성]
    FROM @kws k
    OUTER APPLY (
        SELECT
            COUNT(*) AS cnt,
            COUNT(DISTINCT i.wb_CustNm) AS diversity
        FROM @issues i
        WHERE i.wb_Title LIKE '%' + k.[keyword] + '%'
    ) c
    GROUP BY k.[keyword]
    HAVING SUM(c.cnt) > 0
    ORDER BY [등장횟수] DESC;

    -- ========================================================================
    -- 5) Radar long format: Top 3 거래처 + '전사평균' × keyword
    -- ========================================================================
    ;WITH top3 AS (
        SELECT TOP 3 wb_CustNm
        FROM @issues
        WHERE wb_CustNm IS NOT NULL
        GROUP BY wb_CustNm
        ORDER BY COUNT(*) DESC
    )
    -- 거래처별 series
    SELECT
        k.[keyword]                           AS [category],
        ISNULL(SUM(CASE WHEN i.wb_Title LIKE '%' + k.[keyword] + '%' THEN 1 ELSE 0 END), 0)
                                              AS [value],
        i.wb_CustNm                           AS [series]
    FROM @issues i
    INNER JOIN top3 ON i.wb_CustNm = top3.wb_CustNm
    CROSS JOIN @kws k
    GROUP BY k.[keyword], i.wb_CustNm

    UNION ALL

    -- 전사 평균
    SELECT
        k.[keyword]                           AS [category],
        ROUND(CAST(SUM(CASE WHEN i.wb_Title LIKE '%' + k.[keyword] + '%' THEN 1 ELSE 0 END) AS FLOAT)
              / NULLIF(@vendors, 0), 0)       AS [value],
        N'전사평균'                            AS [series]
    FROM @issues i CROSS JOIN @kws k
    GROUP BY k.[keyword]

    ORDER BY [series], [category];
END
GO

-- ============================================================================
-- 등록: domains/3z.json 의 stored_procedures 화이트리스트에 추가:
-- {
--   "name": "sp_customer_as_pattern",
--   "params": [
--     {"name": "@days", "type": "INT"},
--     {"name": "@vendor", "type": "NVARCHAR(200)"},
--     {"name": "@keywords_csv", "type": "NVARCHAR(MAX)"}
--   ],
--   "description": "기간 + 거래처 + 키워드 기반 AS 요청 패턴 분석 (다중 결과셋)"
-- }
-- ============================================================================
