# 保育園シフト作成 PoC

保育園の月間シフトを、**休みの自動配置 → 人による修正 → 休日確定 → 当番の自動配置**の2段階で作るためのプロトタイプです。

公開URL: https://plzsayyes3.github.io/childcare-shift/

## リポジトリ構成

```text
plzsayyes3/childacare-staff   Private
  ├─ data/staff.json          職員マスタ正本
  ├─ data/patterns.json       勤務パターン正本
  └─ data/months/YYYY-MM.json 月次の希望休・固定休・生成状態
          ▲
          │ GitHub API
          │ ページで本人が入力したFine-grained PAT
          ▼
plzsayyes3/childcare-shift    Public / GitHub Pages
  ├─ UI
  ├─ CSVインポート
  ├─ シフト生成ロジック
  └─ 匿名サンプルのみ

plzsayyes3/gpts               Private
  └─ プロジェクト仕様・設計記録
```

実職員情報の正本は `childacare-staff` です。Publicな `childcare-shift` には実名入りデータをcommitしません。

## ページ上でGitHubトークンを設定する方式

ページ上部の **Private職員DB** 欄を使います。

1. リポジトリ名は通常 `plzsayyes3/childacare-staff` のままにする
2. GitHubトークンを入力
3. `接続確認`
4. `職員・パターン読込` または `今月を読込`
5. 編集後、必要なら `職員・パターン保存` / `今月を保存`
6. 作業後に `トークン消去`

### トークンの保存方法

トークン値は以下には保存しません。

- GitHubリポジトリ
- HTML / JavaScriptソース
- localStorage
- sessionStorage
- JSON / CSV

入力したトークンは、そのブラウザタブのJavaScriptメモリ上だけに保持します。入力欄からも取得後に消します。タブを閉じるか `トークン消去` を押すと保持値は消えます。

### 推奨トークン

Fine-grained Personal Access Tokenを推奨します。

読込だけの場合:

```text
Repository access: plzsayyes3/childacare-staff のみ
Contents: Read-only
```

ページからPrivateリポジトリへ保存もする場合:

```text
Repository access: plzsayyes3/childacare-staff のみ
Contents: Read and write
```

必要以上のリポジトリや権限を与えないでください。可能なら有効期限も短めにします。

### セキュリティ上の注意

この方式では、トークンをPublicリポジトリへ埋め込むことはありませんが、**入力中・利用中のトークンはそのブラウザページのJavaScriptから利用可能**です。ブラウザ拡張やXSS等の影響を完全に排除できる方式ではありません。

そのため、この用途専用で `childacare-staff` だけに限定したFine-grained tokenを使います。メインアカウント全体へ広い権限を持つPATは使いません。

## Private職員DBとの読込・保存

### 職員・パターン読込

以下をGitHub APIから読み込みます。

```text
data/staff.json
data/patterns.json
```

ブラウザの作業コピーへ反映します。

### 職員・パターン保存

現在のブラウザ上のスタッフDB・勤務パターンDBを、同じ2ファイルへcommitします。書込権限のあるトークンが必要です。

### 今月を読込 / 保存

対象月が `2026-10` なら以下を使用します。

```text
data/months/2026-10.json
```

希望休・固定休・休日生成状態・当番生成状態など、その月に紐づくデータを保存します。

## CSVインポート

ページに **CSVインポート** タブがあります。行数に上限を設けず、用途別に4種類のCSVを読み込めます。

CSV読込はまずブラウザの作業コピーだけを更新します。Privateリポジトリへ反映するには、その後に上部の保存ボタンを押します。

### 1. 職員マスタCSV

サンプル: `samples/staff.csv`

列:

```text
id
name
employmentType
role
qualifications
weeklyWorkDays
weeklyDaysOff
fixedOffWeekdays
allowedPatternIds
preferredPatternIds
defaultPatternId
shiftPolicy
requestedOffLimit
active
notes
```

複数値は `|` 区切りです。

例:

```text
保育士|看護師
P01|P02|P03
月|水
```

同一 `id` が既に存在する場合は更新、存在しないIDは追加します。

### 2. 勤務パターンCSV

サンプル: `samples/patterns.csv`

列:

```text
id
name
start
end
workMinutes
breakMinutes
requiredCount
regularQualifiedRequired
active
category
```

同一 `id` は更新、未登録IDは追加です。

### 3. 月次・職員別条件CSV

サンプル: `samples/monthly-staff.csv`

列:

```text
month
staffId
staffName
requestedOff
fixedOff
```

`month` は `YYYY-MM`。職員照合は `staffId` を優先し、未入力なら完全一致する `staffName` を使います。

日付の複数指定例:

```text
3|12|25
```

休日確定済みの月へは上書きせず、確定解除を要求します。

### 4. 月次・全体設定CSV

サンプル: `samples/monthly-settings.csv`

列:

```text
month
regularMonthlyOff
holidays
edgeShiftMax
```

祝日の複数指定も `|` 区切りです。

## CSVサンプル一覧

```text
samples/staff.csv
samples/patterns.csv
samples/monthly-staff.csv
samples/monthly-settings.csv
```

サンプルには実職員情報を含めません。PagesのCSVインポート画面から各ファイルをそのままダウンロードできます。

## 現在の画面

1. **勤務パターン** — 開始・終了・必要人数・資格条件
2. **スタッフ** — 雇用区分・職種・資格・勤務条件
3. **月次シフト** — 希望休・固定休・休日生成・当番生成
4. **CSVインポート** — 一括データ投入

JSONスキーマは現在 **v3** です。

## 基本勤務パターン

| ID | 開始 | 終了 | 必要人数 |
|---|---|---|---:|
| P01 | 06:45 | 15:30 | 2 |
| P02 | 07:30 | 16:15 | 1 |
| P03 | 08:00 | 16:45 | 2 |
| P04 | 08:30 | 17:15 | 3 |
| P05 | 09:00 | 17:45 | 2 |
| P06 | 09:45 | 18:30 | 5 |
| P07 | 11:30 | 20:15 | 2 |

正規保育士の標準勤務は実働8時間＋休憩45分です。

## 現在反映している主な条件

- 日曜・祝日は休園
- 06:45 は正規保育士かつ保育士資格2名
- 11:30 は正規保育士かつ保育士資格2名
- 08:30 時点で最低8名
- 正規保育士は月の共通休日日数を設定
- 非正規等は週休数・週勤務日数・固定休曜日を設定可能
- 希望休はソフト条件
- 今月だけの固定休は絶対条件
- 基本勤務・優先勤務・勤務可能パターンを設定可能
- `flexible / prefer-fixed / fixed` の勤務ポリシー
- 看護師・事務員等の職種・資格
- 条件不足の警告
- JSON入出力
- CSV出力 / CSV入力

## Publicリポジトリの安全策

`.gitignore` で以下をPublicリポジトリから除外しています。

```text
data/staff.json
data/months/
exports/
*.csv
childcare-shift-data.json
.env
.env.*
_private/
```

ただし `samples/` 配下の匿名CSVはPublicで管理します。

## 現段階の未確定事項

- 労働時間・連続勤務・就業規則に応じた厳密な労務チェック
- 06:45 / 11:30 上限が各別か合算か
- 希望休を実現できない場合の最適化重み
- 土曜日専用ルール
- 研修・会議等の勤務イベント
- 当番セルの直接手修正とロック
- 数理最適化による公平性改善

mainへのpushでGitHub Pagesへ自動デプロイします。
