# 保育園シフト作成 PoC

保育園の月間シフトを、**休みの自動配置 → 人による修正 → 休日確定 → 当番の自動配置**の2段階で作るためのプロトタイプです。

このリポジトリは **Public** で運用し、GitHub PagesでHTMLを公開します。

公開URL: https://plzsayyes3.github.io/childcare-shift/

実職員データの正本は private な `plzsayyes3/gpts` 側に置き、この公開リポジトリには個人データをコミットしません。

## 現在の構造

画面は3つです。

1. **勤務パターンDB** — 開始・終了・必要人数・資格条件
2. **スタッフDB** — 雇用区分・職種・資格・固定休・勤務可能パターン等
3. **月次シフト** — 希望休・今月だけの固定休・休日生成・当番生成

データは4層に分けます。

- スタッフDB
- 勤務パターンDB
- 月次データ
- 生成結果

JSONスキーマは現在 **v3** です。

## データ管理

実職員データの正本は private な `plzsayyes3/gpts` 側で管理します。

正本:

- `plzsayyes3/gpts/projects/childcare-shift/data/staff.json`
- `plzsayyes3/gpts/projects/childcare-shift/data/patterns.json`

このHTMLではブラウザの `localStorage` を作業コピーとして利用しますが、正本にはしません。JSON入出力を実装しており、将来は gpts から必要なデータを安全に処理して利用する構成へ移行します。

`.gitignore` で実職員JSON、月次データ、CSV、ローカルトークン、一時private checkout等をこのリポジトリへ誤ってコミットしないようにしています。

## private gptsへアクセスするトークン

このリポジトリはPublicなので、**GitHubトークンをHTML / JavaScript / JSON / README / localStorageへ保存してはいけません**。

正式な保管場所は GitHub Actions の **Repository secret** です。

Secret名は固定で以下を使用します。

```text
GPTS_REPO_TOKEN
```

### GitHub上での登録場所

`childcare-shift` リポジトリで次の順に開きます。

```text
Settings
  → Secrets and variables
    → Actions
      → Repository secrets
        → New repository secret
```

Name:

```text
GPTS_REPO_TOKEN
```

Secret:

```text
privateな plzsayyes3/gpts を読み取れるGitHubトークン
```

可能ならFine-grained Personal Access Tokenを使い、対象リポジトリを `plzsayyes3/gpts` のみに限定し、**Contents: Read-only** を基本にします。書き込みが必要になるまではwrite権限を付けません。

### ローカル開発での置き場所

リポジトリには `.env.example` を置いてあります。

```env
GPTS_REPO_TOKEN=
GPTS_REPO=plzsayyes3/gpts
```

ローカルではこれを参考に `.env` を作ります。

```env
GPTS_REPO_TOKEN=実際のトークン
GPTS_REPO=plzsayyes3/gpts
```

`.env` と `.env.*` は `.gitignore` 対象です。`.env.example` だけをGit管理します。

### トークン利用の構造

```text
private repo
plzsayyes3/gpts
      │
      │ read-only access
      ▼
GitHub Actions runner
      ▲
      │ secrets.GPTS_REPO_TOKEN
      │
Repository secret

      ↓ 必要な処理だけ実行

childcare-shift の生成ロジック

      ↓

公開して問題ない成果物だけをPagesへ
```

重要なのは、**ブラウザからprivate gptsへ直接アクセスしない**ことです。

GitHub Pagesは静的サイトなので、ブラウザ側へトークンを渡すと閲覧者から取得できてしまいます。そのため、privateリポジトリへのアクセスが必要な処理はGitHub Actions等のサーバー側で行います。

### 接続確認

`.github/workflows/check-gpts-access.yml` を用意しています。

GitHubのActions画面から:

```text
Check private gpts access
  → Run workflow
```

を実行すると、次を確認します。

1. `GPTS_REPO_TOKEN` が設定されているか
2. privateな `plzsayyes3/gpts` をcheckoutできるか
3. `projects/childcare-shift/data/staff.json` が存在するか
4. `projects/childcare-shift/data/patterns.json` が存在するか

privateデータは `_private/gpts` というRunner上の一時ディレクトリへcheckoutします。

この一時データは:

- Artifactへアップロードしない
- GitHub Pagesへ含めない
- publicリポジトリへcommitしない
- Workflow終了後にRunnerとともに破棄する

という扱いにします。

### 今後の利用方針

将来的に `gpts → childcare-shift` の自動連携を実装するときも、同じ `GPTS_REPO_TOKEN` をGitHub Actions内だけで利用します。

ただし、`staff.json` の実名・勤務条件・希望休等をそのままPagesへ出力することは禁止します。外部出力する場合は、用途を決めたうえで公開可能な情報だけに変換する処理を間に置きます。

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
- 非正規・派遣等は「週休数」「週勤務日数」「固定休曜日」を持てる
- 希望休は絶対条件ではなく、休み候補として優先
- 今月だけの固定休は絶対条件
- 個別勤務時間は勤務パターンとして追加可能
- スタッフごとに基本勤務・優先勤務・勤務可能パターンを登録可能
- 勤務ポリシーを「可変 / 原則固定 / 固定」で表現可能
- 保育士以外の職種・資格（看護師、事務員等）を保持可能
- 06:45 / 11:30 の偏りを抑える簡易割当
- 条件不足を日付・勤務パターン・人数単位で警告表示
- JSON入出力
- CSV出力

## 安全策

- パターンID重複・不正時刻・必要人数矛盾などの整合性チェック
- スタッフから存在しない勤務パターンへの参照チェック
- 「休日を確定」「確定を解除」
- 休日確定後のみ当番生成可能
- 確定中は月次条件・休日表の変更を抑止
- 同一入力での再現性を高める明示的な同点順序
- GitHub ActionsでJavaScript構文と匿名デモJSONを自動検証
- 実職員データはこの公開リポジトリへ保存しない
- GitHubトークンはRepository secretまたはローカル`.env`だけに保存
- private gptsのcheckout先 `_private/` はGit管理対象外

## 使い方

1. GitHub Pagesを開く
2. 「勤務パターン」で基本7パターン・個別パターンを確認/追加
3. 「スタッフ」で恒常条件を登録
4. 「月次シフト」で対象月・休日数・希望休等を入力
5. **休みを自動配置**
6. 休日表をクリックして手修正
7. **休日を確定**
8. **当番を自動配置**
9. 不足警告を確認
10. 必要ならCSV / JSON出力

## 匿名デモデータ

`fixtures/demo-v3.json` に実職員情報を含まない匿名検証データを置いています。

## 現段階の制限

これは本格的な数理最適化ソルバーではなく、実際の条件を入れて仕様を固めるためのPoCです。

未確定・今後実装するもの：

- 労働時間・連続勤務・就業規則に応じた厳密な労務チェック
- 06:45 / 11:30 の上限が各別か合算かの最終仕様
- 希望休を実現できない場合の最適化重み
- 土曜日専用の必要人数・勤務ルール
- 研修・会議等の勤務扱いイベント
- 当番セルの直接手修正とロック
- gptsからの安全な自動外部出力
- 数理最適化による公平性改善

## 公開リポジトリ運用

リポジトリ名は `plzsayyes3/childcare-shift`。mainへのpushでGitHub Pagesへ自動デプロイします。

Public運用中も、実職員名・勤務条件・月次希望休などの個人データはコミットしません。
