// 普通页面共享读取状态：以调用方提供的资源键控制加载器身份，提供数据、错误、加载中及手动刷新。
import { useCallback, useEffect, useState } from 'react'

// 资源键变化时重新加载；此通用 Hook 不取消在途请求，敏感页面另用带代次/取消的状态管理。
export function useApi<T>(loader: () => Promise<T>, key: string) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    setLoading(true); setError(undefined)
    loader().then(setData).catch((value: unknown) => setError(value instanceof Error ? value : new Error('请求失败')))
      .finally(() => setLoading(false))
  // The caller controls reload identity through the stable resource key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // Loading a keyed external resource is the purpose of this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload }
}
