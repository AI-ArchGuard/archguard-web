import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CredentialSettingsPage } from './CredentialSettingsPage'
import { CredentialClientError } from '../api/credentials'

const state = vi.hoisted(() => ({ actor: 'owner', get: vi.fn(), save: vi.fn(), remove: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { profile: { sub: state.actor } } }) }))
vi.mock('../api/credentials', async original => ({ ...await original<typeof import('../api/credentials')>(),
  getCredentialStatus: state.get, saveCredential: state.save, deleteCredential: state.remove }))
const absent = { configured: false, credentialVersion: null, updatedAt: null }
const saved = { configured: true, credentialVersion: '11111111-1111-4111-8111-111111111111', updatedAt: '2026-10-06T00:00:00Z' }
const synthetic = 'synthetic-test-only-credential'
beforeEach(() => {
  vi.clearAllMocks(); state.actor = 'owner'; state.get.mockResolvedValue(absent)
  state.save.mockResolvedValue(saved); state.remove.mockResolvedValue(absent)
})

it('shows loading, empty state and immediate password clearing on save', async () => {
  render(<CredentialSettingsPage />)
  expect(screen.getByText('正在读取状态…')).toBeInTheDocument()
  await screen.findByText('未配置')
  const input = screen.getByLabelText('新的 DeepSeek API Key') as HTMLInputElement
  expect(input.type).toBe('password'); expect(input.autocomplete).toBe('off')
  fireEvent.change(input, { target: { value: synthetic } })
  fireEvent.click(screen.getByRole('button', { name: '加密保存 Key' }))
  expect(input.value).toBe('')
  await screen.findByText('已配置（有效性未验证）')
  expect(state.save).toHaveBeenCalledTimes(1); expect(state.save.mock.calls[0][0]).toBe(synthetic)
  expect(screen.queryByText(synthetic)).not.toBeInTheDocument()
  expect(screen.getByText(/未验证 Key 有效性，也未开启模型调用/)).toBeInTheDocument()
})

it('clears failed input, hides unknown state and never retries until manual refresh', async () => {
  state.save.mockRejectedValue(new CredentialClientError(503))
  render(<CredentialSettingsPage />); await screen.findByText('未配置')
  const input = screen.getByLabelText('新的 DeepSeek API Key') as HTMLInputElement
  fireEvent.change(input, { target: { value: synthetic } }); fireEvent.click(screen.getByRole('button', { name: '加密保存 Key' }))
  expect(input.value).toBe(''); await screen.findByRole('alert')
  expect(screen.queryByLabelText('新的 DeepSeek API Key')).not.toBeInTheDocument()
  expect(state.save).toHaveBeenCalledTimes(1); expect(state.get).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '手动刷新状态' })); await screen.findByText('未配置')
  expect(screen.getByLabelText('新的 DeepSeek API Key')).toHaveValue('')
})

it('requires explicit confirmation and does not represent local deletion as provider revocation', async () => {
  state.get.mockResolvedValue(saved); render(<CredentialSettingsPage />)
  await screen.findByText('已配置（有效性未验证）')
  const button = screen.getByRole('button', { name: '删除本地 Key' }); expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox')); expect(button).toBeEnabled(); fireEvent.click(button)
  await screen.findByText('未配置')
  expect(state.remove).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/如需撤销，请到 DeepSeek 控制台操作/)).toBeInTheDocument()
})

it.each([403, 503])('shows permission/unavailable state without a secret input (%s)', async status => {
  state.get.mockRejectedValue(new CredentialClientError(status))
  render(<CredentialSettingsPage />); await screen.findByRole('alert')
  expect(screen.queryByLabelText('新的 DeepSeek API Key')).not.toBeInTheDocument()
  expect(state.save).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled()
})

it('clears detached input on leaving, pagehide and identity changes', async () => {
  const view = render(<CredentialSettingsPage />); await screen.findByText('未配置')
  let input = screen.getByLabelText('新的 DeepSeek API Key') as HTMLInputElement
  fireEvent.change(input, { target: { value: synthetic } }); window.dispatchEvent(new Event('pagehide')); expect(input.value).toBe('')
  fireEvent.change(input, { target: { value: synthetic } }); state.actor = 'another-actor'; view.rerender(<CredentialSettingsPage />)
  expect(input.value).toBe(''); await screen.findByText('未配置')
  input = screen.getByLabelText('新的 DeepSeek API Key') as HTMLInputElement
  fireEvent.change(input, { target: { value: synthetic } }); view.unmount(); expect(input.value).toBe('')
})

it('invalid input is cleared before any request and duplicate clicks are suppressed', async () => {
  let finish: (value: typeof saved) => void = () => undefined
  state.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<CredentialSettingsPage />); await screen.findByText('未配置')
  const input = screen.getByLabelText('新的 DeepSeek API Key') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'bad' } }); fireEvent.click(screen.getByRole('button', { name: '加密保存 Key' }))
  expect(input.value).toBe(''); expect(state.save).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: synthetic } }); fireEvent.submit(input.closest('form')!)
  fireEvent.submit(input.closest('form')!); expect(state.save).toHaveBeenCalledTimes(1)
  finish(saved); await waitFor(() => expect(screen.getByText('已配置（有效性未验证）')).toBeInTheDocument())
})
