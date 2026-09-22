import { useCallback, useEffect, useState } from 'react'

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
