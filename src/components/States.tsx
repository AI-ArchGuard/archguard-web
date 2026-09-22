export function Loading() { return <div className="state">正在加载…</div> }
export function Empty({ children }: { children: string }) { return <div className="state">{children}</div> }
export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="state error"><strong>请求未完成</strong><p>{error.message}</p><button onClick={retry}>重试</button></div>
}
