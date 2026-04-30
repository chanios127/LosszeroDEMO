# seed/ — Demo / PT Gold Reports

큐레이션된 보고서를 PT 시연 시작 시점에 archive에 미리 깔아두기 위한 프리셋.

## 의도

라이브 LLM 시연이 모델 한계(D11/A5 계열) 또는 네트워크/타이밍 issue로 chain fail 시 PT 자체가 무너지지 않도록, 사전 검증된 보고서를 ReportArchivePage에 미리 올려둔다.

런타임 보관 디렉토리(`storage/reports/`)는 `.gitignore` 등재되어 데이터가 git에 흘러가지 않으나, **본 `seed/reports/`는 의도적으로 commit** — 시연 환경 재현을 위해.

## 운영

```bash
# 시연 직전: storage 비우고 seed 다시 깔기
python seed/load_reports.py --reset

# storage 비우지 않고 seed 추가
python seed/load_reports.py

# seed 목록 확인
python seed/load_reports.py --list
```

`REPORTS_DATA_DIR` env 설정된 환경에서도 동작 (backend와 같은 override 규칙).

## 시드 추가 워크플로우

1. backend 가동 + Claude Sonnet (또는 회귀 통과 모델)로 시나리오 회귀
2. ReportProposalCard 등장 → "보관" 클릭 → `storage/reports/<id>.json` 생성
3. 마음에 드는 결과만 git mv:
   ```bash
   git mv storage/reports/<id>.json seed/reports/<id>.json
   git add seed/reports/<id>.json
   ```
4. 시드는 시연 환경에서 데이터 PII 노출 우려 시 사전 sanitize 권장 (직원명·거래처명 등). 사내 PT 한정 사용이면 그대로 OK.

## 시드 추가 시 검수 체크리스트

- [ ] `schema.title` / `summary` / `tags` 적절 (LLM 자동 생성된 것 확인)
- [ ] 모든 신블록의 `data_ref` 매핑 정상 (빈 시각화 0)
- [ ] `chart{viz_hint:gantt}` 블록의 `y` 컬럼이 시작/종료 시각 둘 다 존재
- [ ] `chart{viz_hint:radar}` 블록의 `data_ref`가 long format(`category`/`value`/`series`)
- [ ] `bubble_breakdown.bubble.{size,x}` 가 실제 data_ref 컬럼명과 일치
- [ ] `domain` 필드 정확 (groupware vs 3z)
- [ ] PII 노출 우려 시 sanitize 완료
