// 共有バックエンド（みんなが見つけた鳥のAPI）のURL。デプロイのたびに変わらない（スタックを作り直した場合のみ変わる）。
// 別のURLを使うときは、ビルド時にVITE_API_BASEで上書きする
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://bz07bcgea8.execute-api.ap-northeast-1.amazonaws.com";
