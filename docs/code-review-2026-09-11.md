# Code review 2026-09-11

対象: `plzsayyes3/childcare-shift`

## 結論

旧構成はファイルサイズそのものより、1ファイルに複数責務が集中し、`staff-extensions.js` が `app.js` の関数を後から上書きする構造が最大の保守リスクだった。今回、schema v4への移行と同時に責務分離を実施した。

## 修正した重要事項

### 1. monkey patch構造を廃止

旧:

```text
app.js
  ↑ 後から関数を再代入
staff-extensions.js
```

新:

```text
state.js
scheduler-core.js
scheduler.js
ui.js
csv-import.js
github-client.js
private-repo.js
bootstrap.js
```

各責務の正本を1か所にした。

### 2. 6:45 / 11:30上限の実装不一致

画面は「各上限」と表示していたが、旧ロジックはP01/P07の回数を合算していた。

v4ではP01とP07を別々に集計し、それぞれに `edgeShiftMax` を適用する。

### 3. 正規看護師の月休日数

旧休日生成は `employmentType === '正規保育士'` のみ月休日数を適用していたため、正規看護師が対象外だった。

v4では「正規」で始まる雇用区分を正規職員として扱い、共通の月休日数を適用する。

### 4. 資格判定を明確化

6:45 / 11:30 の必要資格は `正規保育士` かつ `qualifications` に `保育士` を持つ職員だけを数える。看護師資格だけでは条件を満たさない。

legacyの `qualified` は読込互換のため残すが、v4内部では保育士資格の互換値として扱う。

### 5. GitHub 409処理を安全側へ変更

旧実装は409後に最新SHAを取り直して再保存していた。これは別端末/別編集の変更を気付かず上書きする可能性がある。

v4では:

- Private読込時のSHAをbaselineとして保持
- 保存前に現在SHAと比較
- 不一致なら保存停止
- baselineなしで既存ファイルを上書きしようとした場合も停止
- 新規月ファイルだけはbaselineなしで作成可能

とした。

### 6. CSVだけでPrivate全体を誤置換できる問題

Privateマスタを読まずにCSVだけ読み込み、その作業コピーを保存すると、既存職員を欠落させる危険があった。

既存Privateファイルは先に読込してbaselineを取得しない限り保存不可とした。

### 7. CSV検証を強化

追加した検証:

- 必須列
- ヘッダー重複
- CSV引用符
- ID重複
- 時刻形式/開始終了
- 数値範囲
- 曜日
- `YYYY-MM`
- 対象月の日付範囲
- `shiftPolicy`
- boolean値

### 8. schema v4へ移行

職種、複数資格、週勤務日数、週休数、優先勤務、勤務固定度などを正式なstaff schemaとして扱う。

旧v2/v3はmigrationで読める。

### 9. 職員のactive UIを追加

データには存在していた `active` を画面から切り替えられるようにした。削除せず一時的にシフト対象外へできる。

### 10. 生成ロジックをテスト可能にした

`scheduler-core.js` はDOM/localStorage/GitHub APIから独立した純粋ロジックとし、Nodeテストを追加した。

回帰対象:

- 正規看護師の月休日数
- 保育士資格判定
- 6:45 / 11:30の各別上限
- fixed / prefer-fixed
- preferredPatternIds
- 決定性

## 現在の責務分離

| ファイル | 責務 |
|---|---|
| `state.js` | schema・migration・validation・ブラウザ作業状態 |
| `scheduler-core.js` | 休日/当番生成・警告の純粋ロジック |
| `scheduler.js` | coreと画面状態のadapter |
| `ui.js` | DOM描画・操作・ローカル入出力 |
| `csv-import.js` | CSV解析/検証/反映 |
| `github-client.js` | GitHub HTTP/PAT/SHA |
| `private-repo.js` | Private DB workflow・エラー復旧UI |
| `bootstrap.js` | 起動順序 |

## 残る技術課題

### High: 職員/勤務パターン保存は2commit

`data/staff.json` と `data/patterns.json` を順番に保存している。保存前の競合チェックは行うが、1つ目のcommit後に通信断が起きれば片方だけ更新される可能性がある。

将来案:

- Git Data APIでtree/commit/refを使い1commitにする
- またはmasterを1ファイルへ統合する

現状は部分保存時に画面へ明示する。

### High: ブラウザ統合テストがない

純粋schedulerの回帰テストと全JS構文チェックはあるが、実ブラウザでのクリック操作を自動化したE2Eテストはまだない。

将来はPlaywright等で最低限:

- 起動
- v3→v4 migration
- CSV import
- 休日生成
- lock
- 当番生成
- Private操作のmock

を追加すると安全性が上がる。

### Medium: stateとDOMに一部結合が残る

`state.js` の `save()` / `loadMonthState()` は月入力DOMを参照している。現時点では規模に対して許容するが、さらに大きくなる場合はstore層とform adapterを分離する。

### Medium: schedulerは貪欲法

現在は決定的な貪欲法。条件が増えると局所的に不足する可能性がある。将来、制約最適化/数理最適化を検討する。

## 未確定のため変更していない業務ルール

以下はコード品質問題ではなく、園の業務ルール決定が必要なので勝手に変更していない。

- 月休日数に日曜/祝日の休園日を含めるか
- 非正規の「週」の区切り。現在は月初から7日単位
- 6:45 / 11:30 の上限値そのもの
- 土曜日ルール
- 研修/会議等の扱い
- 労務ルール詳細

## 判定

現段階では、さらに細かくファイルを分割する必要はない。次に分割するなら `state.js` のDOM依存を外す段階で行う。
