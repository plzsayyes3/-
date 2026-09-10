# 保育園シフト作成 PoC

保育園の月間シフトを、**休みの自動配置 → 人による修正 → 休日確定 → 当番の自動配置**の2段階で作るためのプロトタイプです。

このリポジトリは **Public** で運用し、GitHub PagesでHTMLを公開します。

公開URL: https://plzsayyes3.github.io/childcare-shift/

## リポジトリの役割分担

個人情報と公開コードを分離します。

```text
plzsayyes3/childacare-staff   Private
  └─ 職員氏名・雇用区分・資格・個別勤務条件・将来の希望休等
        │
        │ STAFF_REPO_TOKEN / read-only
        ▼
GitHub Actions runner
        │
        ├─ 必要な処理だけ実行
        └─ 個人情報そのものは公開しない
        ▼
plzsayyes3/childcare-shift    Public
  └─ UI・シフト生成ロジック・匿名デモ・GitHub Pages

plzsayyes3/gpts               Private
  └─ プロジェクト仕様・設計記録
```

### 個人情報の正本

実職員データの正本は以下です。

```text
plzsayyes3/childacare-staff/data/staff.json
```

`childcare-shift` と `gpts` には、今後実職員DB本体を保存しません。

勤務パターンや公開可能な生成ルールは `childcare-shift` 側で管理できます。設計メモは `gpts` に残します。

## 現在の画面構造

1. **勤務パターンDB** — 開始・終了・必要人数・資格条件
2. **スタッフDB** — 雇用区分・職種・資格・固定休・勤務可能パターン等
3. **月次シフト** — 希望休・今月だけの固定休・休日生成・当番生成

データは概念上4層です。

- スタッフDB
- 勤務パターンDB
- 月次データ
- 生成結果

JSONスキーマは現在 **v3** です。

## private職員DBへアクセスするトークン

このリポジトリはPublicなので、**GitHubトークンをHTML / JavaScript / JSON / README / localStorageへ保存してはいけません**。

正式な保管場所は GitHub Actions の **Repository secret** です。

Secret名:

```text
STAFF_REPO_TOKEN
```

### GitHub上での登録場所

`childcare-shift` リポジトリで:

```text
Settings
  → Secrets and variables
    → Actions
      → Repository secrets
        → New repository secret
```

Name:

```text
STAFF_REPO_TOKEN
```

Secret:

```text
privateな plzsayyes3/childacare-staff を読み取れるGitHubトークン
```

Fine-grained Personal Access Tokenを推奨します。

基本権限:

```text
Repository access: plzsayyes3/childacare-staff のみ
Contents: Read-only
```

職員DBへ書き戻す仕組みを実装するまではwrite権限を付けません。

### ローカル開発

`.env.example`:

```env
STAFF_REPO_TOKEN=
STAFF_REPO=plzsayyes3/childacare-staff
```

ローカルでは `.env` を作成します。

```env
STAFF_REPO_TOKEN=実際のトークン
STAFF_REPO=plzsayyes3/childacare-staff
```

`.env` と `.env.*` は `.gitignore` 対象です。`.env.example` だけをGit管理します。

## 接続確認

手動実行用Workflow:

```text
.github/workflows/check-staff-access.yml
```

GitHub Actions画面で:

```text
Check private staff access
  → Run workflow
```

を実行すると、

1. `STAFF_REPO_TOKEN` が設定済みか
2. `plzsayyes3/childacare-staff` をcheckoutできるか
3. `data/staff.json` が存在するか
4. `staff` 配列を読み取れるか

を確認します。

private職員DBはRunner上の

```text
_private/childacare-staff
```

へ一時checkoutします。

ここは:

- Git管理しない
- Artifactへアップロードしない
- GitHub Pagesへ含めない
- 職員データをActionsログへ出力しない
- Workflow終了後にRunnerとともに破棄する

という扱いです。

## ブラウザとprivate repoを直接つながない理由

GitHub Pagesは静的サイトです。ブラウザJavaScriptにprivate repo用トークンを渡すと、閲覧者がそのトークンを取得できます。

そのため、次の構造は禁止します。

```text
Browser → token → private repository
```

必ずサーバー側相当のGitHub Actions等を介します。

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

正規保育士の標準勤務は実働8時間＋休憩45分。

## 現在反映している条件

- 日曜・祝日は休園
- 06:45 は正規保育士かつ保育士資格2名
- 11:30 は正規保育士かつ保育士資格2名
- 08:30 時点で最低8名
- 正規保育士は月の共通休日日数を設定
- 非正規・派遣等は週休数・週勤務日数・固定休曜日を持てる
- 希望休は絶対条件ではなく、休み候補として優先
- 今月だけの固定休は絶対条件
- 個別勤務時間は勤務パターンとして追加可能
- 基本勤務・優先勤務・勤務可能パターンを登録可能
- 勤務ポリシーを `flexible / prefer-fixed / fixed` で表現可能
- 看護師・事務員等の職種・資格を保持可能
- 06:45 / 11:30 の偏りを抑える簡易割当
- 条件不足を日付・勤務パターン・人数単位で警告表示
- JSON入出力
- CSV出力

## 安全策

- 実職員データをこのPublicリポジトリへcommitしない
- `data/staff.json`, `data/months/`, `_private/`, `.env` 等を `.gitignore`
- トークンはRepository secretまたはローカル`.env`のみ
- private職員DBをPages/Artifactへそのまま出さない
- Actionsログへ個人情報を表示しない
- 匿名デモデータだけをPublic側へ置く

## 匿名デモデータ

`fixtures/demo-v3.json` に実職員情報を含まない匿名検証データを置いています。

## 使い方

1. GitHub Pagesを開く
2. 勤務パターンを確認/追加
3. スタッフ条件を読み込む、または試算用データを入力
4. 対象月・休日数・希望休等を入力
5. **休みを自動配置**
6. 休日表を手修正
7. **休日を確定**
8. **当番を自動配置**
9. 不足警告を確認
10. 必要ならCSV / JSON出力

## 現段階の制限

- 労働時間・連続勤務・就業規則に応じた厳密な労務チェック
- 06:45 / 11:30 の上限が各別か合算かの最終仕様
- 希望休を実現できない場合の最適化重み
- 土曜日専用の必要人数・勤務ルール
- 研修・会議等の勤務扱いイベント
- 当番セルの直接手修正とロック
- private職員DBからの本番用自動シフト生成
- 数理最適化による公平性改善

## 公開運用

リポジトリ: `plzsayyes3/childcare-shift`

mainへのpushでGitHub Pagesへ自動デプロイします。Public運用中も、職員氏名・勤務条件・希望休等の個人情報は公開側へcommitしません。
