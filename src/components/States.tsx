// 通用读取状态组件：加载、空数据和可手动重试的错误由调用页面选择。
// 展示请求尚未完成的通用状态。
export function Loading() { return <div className="state">正在加载…</div> }
// 显示调用方给出的空数据原因。
export function Empty({ children }: { children: string }) { return <div className="state">{children}</div> }
// 显示错误并提供调用方指定的重试操作；是否重试由用户点击决定。
export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="state error"><strong>请求未完成</strong><p>{error.message}</p><button onClick={retry}>重试</button></div>
}
