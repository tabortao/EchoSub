import axios, { type AxiosInstance } from 'axios'

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器：附加 JWT
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('echosub_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理 401
// 例外：删除等高风险操作使用 `X-Confirm-Purpose: delete` 标记，401 表示「密码错误」而非 token 失效，
// 这种情况下不能清 token / 跳登录页，由调用方处理。
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const isConfirm = error.config?.headers?.['X-Confirm-Purpose'] === 'delete'
    if (status === 401 && !isConfirm) {
      localStorage.removeItem('echosub_token')
      localStorage.removeItem('echosub_user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default client
