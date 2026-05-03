-- ============================================================================
-- sp_customer_as_pattern — Microskill #3 (customer_as_pattern) backing SP
-- ============================================================================
-- 사용처: backend/microskills/customer_as_pattern/skill.py
-- 도메인: groupware (TGW_WorkBoard 기반)
-- 의도: 기간 + 거래처(옵션) + 키워드 CSV → 다중 결과셋
--   1) KPI: 총건수 / 거래처수 / 최다거래처 / 재발률
--   2) 작업유형 분포: wb_workTy → 분포
--   3) Top 거래처: 거래처명 / 요청건수 / 재발률 / 주요 키워드
--   4) 키워드 클러스터: 키워드 / 등장횟수 / 거래처다양성
--   5) Radar long format: category / value / series  (Top 3 거래처 + 전사평균 × 키워드)
--
-- v2 (2026-05-03): 실 DB 메타 검증 후 재작성.
--   - TGW_WorkBoard: wb_revNo+wb_WBNO PK, wb_curFg(최신여부), wb_CustCD(거래처ID),
--                    wb_workTy(현안유형 — 1~5 string), wb_reqDt(의뢰일자 datetime),
--                    wb_Title(제목), wb_recvText(접수내용 text), wb_fixFg(처리상태)
--   - TCD_Customer : cu_custCd PK → cu_custNm 거래처명
--
-- 작업유형 코드 매핑은 1~5 enum (실제 마스터 테이블 미확인 — 매핑 dict로 처리)
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
        SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@keywords_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> '';
    END;

    -- 기간 내 현안 (최신 revision만 — wb_curFg='Y')
    -- + 거래처 필터 (옵션)
    -- + 거래처명 join + Title text 결합 (recvText 포함 검색)
    DECLARE @issues TABLE (
        wb_WBNO    VARCHAR(12),
        cu_custCd  VARCHAR(20),
        cu_custNm  NVARCHAR(100),
        wb_workTy  VARCHAR(10),
        wb_fixFg   VARCHAR(5),
        wb_Title   NVARCHAR(MAX),
        wb_reqDt   DATE
    );
    INSERT INTO @issues
    SELECT
        w.wb_WBNO,
        w.wb_CustCD,
        ISNULL(c.cu_custNm, w.wb_CustCD),
        w.wb_workTy,
        w.wb_fixFg,
        ISNULL(w.wb_Title, N'') + N' ' + ISNULL(CAST(w.wb_recvText AS NVARCHAR(MAX)), N''),
        CONVERT(date, w.wb_reqDt)
    FROM dbo.TGW_WorkBoard w
    LEFT JOIN dbo.TCD_Customer c ON w.wb_CustCD = c.cu_custCd
    WHERE CONVERT(date, w.wb_reqDt) BETWEEN @start AND @end
      AND ISNULL(w.wb_curFg, 'Y') = 'Y'
      AND (@vendor IS NULL OR c.cu_custNm LIKE N'%' + @vendor + N'%' OR w.wb_CustCD LIKE N'%' + @vendor + N'%');

    -- 작업유형 코드 → 명칭 매핑 (실 마스터 미확인 — enum 매핑)
    DECLARE @typeMap TABLE (code VARCHAR(10), nm NVARCHAR(50));
    INSERT INTO @typeMap VALUES
        ('1', N'기능요청'), ('2', N'오류대응'), ('3', N'기능개선'),
        ('4', N'데이터문의'), ('5', N'환경설정');

    -- ========================================================================
    -- 1) KPI: 총건수 / 거래처수 / 최다거래처 / 재발률
    -- ========================================================================
    DECLARE @total INT = (SELECT COUNT(*) FROM @issues);
    DECLARE @vendors INT = (SELECT COUNT(DISTINCT cu_custCd) FROM @issues WHERE cu_custCd IS NOT NULL);
    DECLARE @top_vendor NVARCHAR(200) = (
        SELECT TOP 1 cu_custNm FROM @issues
        WHERE cu_custNm IS NOT NULL
        GROUP BY cu_custNm ORDER BY COUNT(*) DESC
    );
    -- 재발률 = 동일 거래처에서 같은 키워드가 2회 이상 등장한 (거래처,키워드) 짝의 비율
    DECLARE @recur INT = (
        SELECT COUNT(*) FROM (
            SELECT i.cu_custCd, k.[keyword]
            FROM @issues i CROSS JOIN @kws k
            WHERE i.wb_Title LIKE N'%' + k.[keyword] + N'%'
              AND i.cu_custCd IS NOT NULL
            GROUP BY i.cu_custCd, k.[keyword]
            HAVING COUNT(*) >= 2
        ) x
    );
    DECLARE @recur_pct NVARCHAR(20) =
        CAST(CAST(ROUND(100.0 * @recur / NULLIF(@total, 0), 1) AS DECIMAL(5,1))
             AS NVARCHAR(20)) + '%';

    SELECT
        @total                                AS [총건수],
        @vendors                              AS [거래처수],
        ISNULL(@top_vendor, N'-')             AS [최다거래처],
        ISNULL(@recur_pct, N'0%')             AS [재발률];

    -- ========================================================================
    -- 2) 작업유형 분포
    -- ========================================================================
    SELECT
        ISNULL(t.nm, N'(' + ISNULL(i.wb_workTy, N'?') + N')')   AS [작업유형명],
        COUNT(*)                                                AS [건수]
    FROM @issues i
    LEFT JOIN @typeMap t ON i.wb_workTy = t.code
    GROUP BY i.wb_workTy, t.nm
    ORDER BY [건수] DESC;

    -- ========================================================================
    -- 3) Top 거래처: 거래처명 / 요청건수 / 재발률 / 주요유형
    -- ========================================================================
    ;WITH vc AS (
        SELECT
            cu_custCd,
            cu_custNm,
            COUNT(*) AS req_cnt
        FROM @issues
        WHERE cu_custCd IS NOT NULL
        GROUP BY cu_custCd, cu_custNm
    ),
    top5 AS (SELECT TOP 5 * FROM vc ORDER BY req_cnt DESC),
    vendor_kw AS (
        SELECT
            t.cu_custCd,
            STUFF((
                SELECT TOP 3 N', ' + k.[keyword]
                FROM @kws k
                WHERE EXISTS (
                    SELECT 1 FROM @issues i2
                    WHERE i2.cu_custCd = t.cu_custCd
                      AND i2.wb_Title LIKE N'%' + k.[keyword] + N'%'
                )
                ORDER BY (
                    SELECT COUNT(*) FROM @issues i3
                    WHERE i3.cu_custCd = t.cu_custCd
                      AND i3.wb_Title LIKE N'%' + k.[keyword] + N'%'
                ) DESC
                FOR XML PATH(''), TYPE
            ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')   AS top_kw
        FROM top5 t
    ),
    vendor_recur AS (
        SELECT
            t.cu_custCd,
            (SELECT COUNT(*) FROM (
                SELECT i.cu_custCd, k.[keyword]
                FROM @issues i CROSS JOIN @kws k
                WHERE i.cu_custCd = t.cu_custCd
                  AND i.wb_Title LIKE N'%' + k.[keyword] + N'%'
                GROUP BY i.cu_custCd, k.[keyword]
                HAVING COUNT(*) >= 2
            ) y) AS recur_cnt
        FROM top5 t
    )
    SELECT
        t.cu_custNm                           AS [거래처명],
        t.req_cnt                             AS [요청건수],
        ISNULL(
            CAST(CAST(ROUND(100.0 * vr.recur_cnt / NULLIF(t.req_cnt, 0), 1)
                      AS DECIMAL(5,1)) AS NVARCHAR(20)) + '%',
            '0%'
        )                                     AS [재발률],
        ISNULL(vk.top_kw, N'-')               AS [주요유형]
    FROM top5 t
    LEFT JOIN vendor_kw    vk ON t.cu_custCd = vk.cu_custCd
    LEFT JOIN vendor_recur vr ON t.cu_custCd = vr.cu_custCd
    ORDER BY t.req_cnt DESC;

    -- ========================================================================
    -- 4) 키워드 클러스터: 키워드 / 등장횟수 / 거래처다양성
    -- ========================================================================
    SELECT
        k.[keyword]                           AS [키워드],
        ISNULL(c.cnt, 0)                      AS [등장횟수],
        ISNULL(c.diversity, 0)                AS [거래처다양성]
    FROM @kws k
    OUTER APPLY (
        SELECT
            COUNT(*)                          AS cnt,
            COUNT(DISTINCT i.cu_custCd)       AS diversity
        FROM @issues i
        WHERE i.wb_Title LIKE N'%' + k.[keyword] + N'%'
    ) c
    WHERE ISNULL(c.cnt, 0) > 0
    ORDER BY [등장횟수] DESC;

    -- ========================================================================
    -- 5) Radar long format: Top 3 거래처 + '전사평균' × 키워드
    -- ========================================================================
    ;WITH top3 AS (
        SELECT TOP 3 cu_custCd, cu_custNm
        FROM @issues
        WHERE cu_custCd IS NOT NULL
        GROUP BY cu_custCd, cu_custNm
        ORDER BY COUNT(*) DESC
    )
    SELECT
        k.[keyword]                           AS [category],
        SUM(CASE WHEN i.wb_Title LIKE N'%' + k.[keyword] + N'%' THEN 1 ELSE 0 END)
                                              AS [value],
        t3.cu_custNm                          AS [series]
    FROM top3 t3
    INNER JOIN @issues i ON i.cu_custCd = t3.cu_custCd
    CROSS JOIN @kws k
    GROUP BY k.[keyword], t3.cu_custNm

    UNION ALL

    SELECT
        k.[keyword]                           AS [category],
        ROUND(CAST(SUM(CASE WHEN i.wb_Title LIKE N'%' + k.[keyword] + N'%' THEN 1 ELSE 0 END)
                   AS FLOAT) / NULLIF(@vendors, 0), 0)
                                              AS [value],
        N'전사평균'                            AS [series]
    FROM @issues i CROSS JOIN @kws k
    GROUP BY k.[keyword]

    ORDER BY [series], [category];
END
GO

-- ============================================================================
-- 등록 확인:
--   SELECT name FROM sys.procedures WHERE name = 'sp_customer_as_pattern';
--
-- 실행 테스트:
--   EXEC dbo.sp_customer_as_pattern @days = 90;
--   EXEC dbo.sp_customer_as_pattern @days = 90, @vendor = N'옥스';
--   EXEC dbo.sp_customer_as_pattern @days = 90, @keywords_csv = N'재고,오류,BOM';
-- ============================================================================
