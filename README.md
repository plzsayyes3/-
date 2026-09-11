# 保育園シフト作成 PoC

保育園の月間シフトを、**休みの自動配置 → 人による修正 → 休日確定 → 当番の自動配置**の2段階で作るプロトタイプです。

公開URL: https://plzsayyes3.github.io/childcare-shift/

## データの置き場所

```text
plzsayyes3/childacare-staff   Private
  ├─ data/staff.json          職員マスタ正本
  ├─ data/patterns.json       勤務パターン正本
  └─ data/months/YYYY-MM.json 月次データ
          ▲
          │ GitHub API + ページで本人が入力したFine-grained PAT
          ▼
plzsayyes3/childcare-shift    Public / GitHub Pages
  └─ UI・CSV取込・生成ロジック・匿名サンプルのみ

plzsayyes3/gpts               Private
  └─ プロジェクト仕様・設計記録
```

実職員情報は `childacare-staff` にだけ保存します。Publicな本リポジトリへ実名入りJSON/CSVやトークンをcommitしません。

## コード構成（schema v4）

2026-09-11のコードレビューで、旧 `app.js` と `staff-extensions.js` の継ぎ足し構造を廃止し、責務ごとに分離しました。

```text
state.js             状態・schema v4・migration・validation
scheduler-core.js    DOM非依存の休日/当番生成ロジック
scheduler.js         scheduler-core と画面状態の橋渡し
ui.js                描画・画面操作・JSON/CSV出力
csv-import.js        CSV解析・検証・取込
github-client.js     GitHub API・PAT・SHA競合検知
private-repo.js      Private DBの読込/保存フロー・復旧UI
bootstrap.js         起動順序だけを担当
styles.css           表示
```

`state.js` 以外から状態スキーマを勝手に追加せず、生成規則は `scheduler-core.js` に集約します。`scheduler-core.js` はNodeからも実行でき、回帰テスト対象です。

旧schema v2/v3のローカルデータやJSONは読込時にv4へ正規化します。Private側のv3ファイルも読込可能で、次回保存時にv4形式で保存されます。

## Private職員DBの使い方

ページ上部でリポジトリ名とGitHubトークンを設定します。

1. `plzsayyes3/childacare-staff` を指定
2. Fine-grained PATを入力
3. **接続する**
4. 編集前に各タブの **Privateから再読込** を実行
5. 編集・CSV取込
6. **Privateへ保存**
7. 作業後に **トークン消去**

### トークン

トークンはGitHubリポジトリ、HTML、localStorage、sessionStorage、JSON、CSVには保存しません。開いているタブのJavaScriptメモリ上だけに保持します。

推奨権限:

```text
Repository access: plzsayyes3/childacare-staff のみ
Contents: Read and write   # 保存する場合
```

読込だけなら `Contents: Read-only` で足ります。用途専用のFine-grained PATを使用してください。

## 保存時の安全策

既存Privateファイルを**一度も読み込まずに上書きすることはできません**。これは、CSVだけを読み込んだブラウザ作業コピーで職員DB全体を誤置換する事故を防ぐためです。

保存時は、読込時のファイルSHAとGitHub上の現在SHAを比較します。

```text
一致       → 保存
不一致     → 409として停止。自動上書きしない
基準SHAなし + 既存ファイル → 停止して先に再読込を要求
基準SHAなし + 新規月ファイル → 新規作成可能
```

409時は現在のブラウザ編集を保持し、JSONバックアップ → Private再読込 → 必要な変更を再反映 → 保存、の順に案内します。

職員マスタと勤務パターンは現在2ファイルへ順番に保存するため、通信断等で片方だけ保存される可能性は残っています。画面では部分保存を明示します。将来は1commitでの原子的更新を検討します。

## エラー復旧

GitHub APIエラーはページ内で **原因 → 復旧手順 → 次に押すボタン** を表示します。

- 401: トークン無効・期限切れ
- 403: リポジトリ対象/Contents権限不足
- 404: リポジトリ・必要JSONなし。月次初回404は新規作成へ誘導
- 409: 未読込または競合。上書きせず停止
- 422: 保存内容/ブランチ等の不整合
- ローカル入力エラー: Privateへ送信する前に停止

## CSVインポート

用途別に4種類あります。行数は固定していません。

```text
samples/staff.csv             職員マスタ
samples/patterns.csv          勤務パターン
samples/monthly-staff.csv     月次・職員別条件
samples/monthly-settings.csv  月次・全体設定
```

複数値は `|` 区切りです。CSV読込時にヘッダー重複、必須列、数値範囲、時刻、曜日、対象月の日付範囲などを検証します。

CSVはブラウザ作業コピーを更新するだけです。Privateへ反映するには、その後に対応タブから保存します。安全のため、**最初にPrivateから再読込してからCSVを取り込む**運用を推奨します。

### 職員CSV列

```text
id,name,employmentType,role,qualifications,weeklyWorkDays,weeklyDaysOff,fixedOffWeekdays,allowedPatternIds,preferredPatternIds,defaultPatternId,shiftPolicy,requestedOffLimit,active,notes
```

### 勤務パターンCSV列

```text
id,name,start,end,workMinutes,breakMinutes,requiredCount,regularQualifiedRequired,active,category
```

### 月次・職員別CSV列

```text
month,staffId,staffName,requestedOff,fixedOff
```

### 月次・全体設定CSV列

```text
month,regularMonthlyOff,holidays,edgeShiftMax
```

## 現在の主な生成条件

- 日曜・祝日は休園
- 06:45 は正規保育士かつ保育士資格者2名
- 11:30 は正規保育士かつ保育士資格者2名
- 08:30時点で最低8名
- 正規職員は共通の月休日日数を使用
- 非正規等は週勤務日数/週休数/固定休曜日を設定可能
- 希望休はソフト条件、今月だけの固定休は絶対条件
- `flexible / prefer-fixed / fixed` を区別
- 優先勤務パターンを考慮
- 6:45 と11:30の上限は現在**各シフト別**に判定
- 看護師資格だけでは6:45/11:30の「正規保育士資格者」には数えない

## テスト

生成ロジックは `tests/scheduler-core.test.js` で回帰テストします。

```bash
node tests/scheduler-core.test.js
```

GitHub Actionsでは全JavaScriptの構文チェック、scheduler回帰テスト、fixture確認を行います。

主な回帰テスト:

- 正規看護師も正規職員の月休日数対象になる
- 看護師資格のみでは保育士資格条件を満たさない
- 6:45 / 11:30上限は合算ではなく各別
- `fixed` と `prefer-fixed` の違い
- 優先パターン
- 同じ入力に対する決定性

## 未確定の業務ルール

コードレビューで勝手に決めず、現行挙動を明示して残している項目です。

- 正規職員の月休日数に日曜・祝日の休園日を含めるか
- 非正規の「週」の区切りを暦週（月〜日等）にするか。現在は月初から7日区切り
- 6:45 / 11:30 の上限値そのもの（現在初期値3）
- 土曜日専用ルール
- 研修・会議等の勤務イベント
- 当番セルの直接修正・ロック
- 労働時間/連続勤務/就業規則の厳密チェック
- 貪欲法から数理最適化へ移行するか

## Publicリポジトリの安全策

`.gitignore` で個人データや秘密情報を除外します。匿名の `samples/` と `fixtures/` のみPublicで管理します。

mainへのpushでGitHub Pagesへ自動デプロイします。
