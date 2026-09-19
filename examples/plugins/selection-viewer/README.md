# Selection Viewer

Orca のタブ内でローカル JSON を表示し、選択項目とテキストを既存の automation に渡すサンプルです。Web サーバーや Cloudflare への配置は不要です。

1. この fork をビルドして起動します。
2. Settings → Plugins でプラグインを有効にし、Development paths にこのディレクトリを登録します。表示された権限を確認してプラグインを有効化します。
3. 利用するワークスペースに `items.json` をコピーし、同じプロジェクトにローカル automation を作成します。
4. タブの「＋」→ **Selection Viewer** を開きます。接続設定でワークスペースからの相対ファイルパスと automation を選びます。
5. チェックボックスと追加の指示を入力し、**実行**を押します。下部の履歴から標準の実行画面へ移動できます。「Execution ended」は実行終了を表し、業務の成功を保証する表示ではありません。

サンプルを編集したらリポジトリルートで `node examples/plugins/selection-viewer/build.mjs` を実行します。生成した `panel.html` は依存を含む単一 HTML です。開発用プラグインは再読込されます。再読込・接続変更・タブを閉じる操作で、未送信の入力は消えます。

## 独自の Viewer

Manifest の `contributes.panels` に `"placement": "tab"` と HTML の `entry` を指定します。指定しない panel は従来どおりサイドバーへ表示されます。必要な権限は `viewer:read` と、実行する場合の `automation:run` です。React 等も単一 HTML にまとめれば使用できます。既存の sandbox/CSP に従うため、外部通信や親画面の DOM・IPC への直接アクセスはできません。

`createViewerPanelClient(window)` が公開する API:

- `context()`: 接続状態と接続 revision
- `data(cursor?)`: JSON のページ（100件・32KiB以下）
- `dispatch({requestId, requestedAt, bindingRevision, datasetRevision, selectedIds, text})`: 接続された automation を実行
- `runs(requestId?, cursor?)`: 履歴と、応答を確認できなかった要求の照会
- `dispose()`: message listener と待機中の要求を解除

データは `{ "items": [{ "id": "unique-id", "title": "表示名", "任意の属性": "値" }] }` です。ファイルはワークスペース内の実体に限定し、2MiB・10,000件まで、IDは128文字までで重複不可です。この UI サンプルは最初のページを表示します。大量データ用の独自 UI は `nextCursor` で続きを取得してください。

1回の実行は100件・テキスト8192文字・選択行とテキスト合計32KiBまでです。項目を選ばずテキストだけでも実行できます。表示後にファイルが変更された場合は再読込が必要です。選択行とテキストは実行ごとの JSON snapshot に保存し、元の automation の prompt・schedule は書き換えません。毎回新しいセッションで起動し、既存の precheck と実行状態管理を利用します。

`requestId` は実行の識別子です。同じ要求の再送では変更せず、応答不明時に新しい ID を自動発行しないでください。SDK は同じ ID の二重送信をまとめます。履歴が整理された場合も受理済みの ID は再実行しません。receipt は最低24時間と実行中の期間保持します。

v1 はローカル Desktop の Git・folder workspace 対応です。SSH と Web client は未対応として表示し、ローカル実行へ切り替えることはありません。

Folder workspace では同じプロジェクトグループ配下のローカルリポジトリに登録された automation を選べます。データはその Folder workspace 内から読み込みます。

接続後に automation の実行先を変えた場合は、Viewer の接続設定を保存し直してください。受付直後にアプリが終了した場合も自動で再実行せず、復旧後に中断した実行として表示します。時計の修正後も、受付記録を整理済みの古い要求は再実行しません。
